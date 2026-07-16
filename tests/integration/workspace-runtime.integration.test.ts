import assert from 'node:assert/strict';
import test from 'node:test';
import { Repo } from '@automerge/automerge-repo';
import { createWorkspaceDocument, openWorkspaceRuntime } from '../../src/workspace/runtime.ts';
import {
  workspaceConstraintSetArtifact,
  workspaceSchemaArtifact,
} from '../../src/workspace/schema.ts';

void test('workspace runtime projects relation-shaped storage and applies named operations', async () => {
  const repo = new Repo();
  const handle = repo.create(createWorkspaceDocument('home'));
  const workspace = await openWorkspaceRuntime(handle);
  let changes = 0;
  const unsubscribe = workspace.subscribe(() => {
    changes += 1;
  });

  try {
    const initialProjection = workspace.getSnapshot();
    assert.equal(workspace.getSnapshot(), initialProjection);
    assert.equal(initialProjection.state, 'ready');
    assert.equal(handle.doc()['@patchpit'].type, 'workspace');
    assert.deepEqual(handle.doc()['@patchpit'].schema, {
      id: workspaceSchemaArtifact.id,
      contentHash: workspaceSchemaArtifact.contentHash,
    });
    assert.equal(
      handle.doc()['@patchpit'].schemas[workspaceSchemaArtifact.id]?.contentHash,
      workspaceSchemaArtifact.contentHash,
    );
    assert.deepEqual(handle.doc()['@patchpit'].declaration.constraints, {
      set: {
        id: workspaceConstraintSetArtifact.id,
        contentHash: workspaceConstraintSetArtifact.contentHash,
      },
      mode: 'required',
    });
    assert.deepEqual(Object.keys(handle.doc().panes), ['left']);
    assert.deepEqual(handle.doc().placements['context-0'], { paneId: 'left', position: 0, url: 'home' });

    const result = await workspace.commitOperation({
      kind: 'workspace.context.pin',
      contextId: 'file',
      url: 'viewer.html#{"src":"file"}',
      targetPaneId: 'left',
      beforeContext: null,
    });
    assert.equal(result.outcome, 'committed');
    const nextProjection = workspace.getSnapshot();
    assert.notEqual(nextProjection, initialProjection);
    assert.equal(nextProjection.state, 'ready');
    if (nextProjection.state !== 'ready') throw new Error('Workspace projection is unavailable');
    assert.deepEqual(
      nextProjection.workspace.nodes.left?.kind === 'pane'
        ? nextProjection.workspace.nodes.left.contexts
        : undefined,
      ['context-0', 'file'],
    );
    assert.deepEqual(handle.doc().placements.file, {
      paneId: 'left',
      position: 1,
      url: 'viewer.html#{"src":"file"}',
    });
    assert.equal(changes, 1);
  } finally {
    unsubscribe();
    workspace.close();
    assert.equal(handle.isReady(), true);
    await repo.shutdown();
  }
});

void test('named workspace operations replan after a concurrent stale basis', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  const first = await openWorkspaceRuntime(handle);
  const second = await openWorkspaceRuntime(handle);

  try {
    const results = await Promise.all([
      first.commitOperation({
        kind: 'workspace.context.pin',
        contextId: 'first',
        url: 'first',
        targetPaneId: 'left',
        beforeContext: null,
      }),
      second.commitOperation({
        kind: 'workspace.context.pin',
        contextId: 'second',
        url: 'second',
        targetPaneId: 'left',
        beforeContext: null,
      }),
    ]);
    assert.deepEqual(results.map(({ outcome }) => outcome), ['committed', 'committed']);
    const projection = first.getSnapshot();
    assert.equal(projection.state, 'ready');
    if (projection.state !== 'ready') throw new Error('Workspace projection is unavailable');
    assert.deepEqual(
      projection.workspace.nodes.left?.kind === 'pane'
        ? [...projection.workspace.nodes.left.contexts].sort()
        : undefined,
      ['context-0', 'first', 'second'],
    );
  } finally {
    first.close();
    second.close();
    await repo.shutdown();
  }
});

void test('malformed workspace relations produce an invalid projection without throwing', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  const workspace = await openWorkspaceRuntime(handle);
  try {
    handle.change((doc) => {
      (doc.placements['context-0'] as { paneId: string }).paneId = 'missing';
    });
    const projection = workspace.getSnapshot();
    assert.equal(projection.state, 'invalid');
    assert.equal(projection.issues.some(({ code }) => code === 'patchpit.workspace.context-unmounted'), true);
  } finally {
    workspace.close();
    await repo.shutdown();
  }
});

void test('query-backed constraints reject unreachable layout nodes on read', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  const workspace = await openWorkspaceRuntime(handle);
  try {
    handle.change((doc) => {
      (doc.panes as Record<string, object>).detached = {};
    });
    const projection = workspace.getSnapshot();
    assert.equal(projection.state, 'invalid');
    assert.equal(projection.issues.some(({ code }) =>
      code === 'patchpit.workspace.layout-node-unreachable'), true);
  } finally {
    workspace.close();
    await repo.shutdown();
  }
});
