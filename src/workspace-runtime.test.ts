import assert from 'node:assert/strict';
import test from 'node:test';
import { Repo } from '@automerge/automerge-repo';
import { createWorkspaceDocument, openWorkspace } from './workspace-runtime.ts';
import { workspaceSchemaArtifact } from './workspace-schema.ts';

void test('workspace runtime projects relation-shaped storage and applies named operations', async () => {
  const repo = new Repo();
  const handle = repo.create(createWorkspaceDocument('home'));
  const workspace = await openWorkspace(handle);
  let changes = 0;
  const unsubscribe = workspace.subscribe(() => {
    changes += 1;
  });

  try {
    const initialProjection = workspace.getSnapshot();
    assert.equal(workspace.getSnapshot(), initialProjection);
    assert.equal(initialProjection.state, 'ready');
    assert.equal(workspace.resourceRef, handle.url);
    assert.equal(handle.doc()['@patchpit'].type, 'workspace');
    assert.deepEqual(handle.doc()['@patchpit'].schema, {
      id: workspaceSchemaArtifact.id,
      contentHash: workspaceSchemaArtifact.contentHash,
    });
    assert.equal(
      handle.doc()['@patchpit'].schemas[workspaceSchemaArtifact.id]?.contentHash,
      workspaceSchemaArtifact.contentHash,
    );
    assert.deepEqual(Object.keys(handle.doc().panes), ['left']);
    assert.deepEqual(handle.doc().paneContexts['context-0'], { paneId: 'left', position: 0 });

    const result = await workspace.act({
      kind: 'workspace.context.open',
      contextId: 'file',
      url: 'viewer.html#{"src":"file"}',
      targetPaneId: 'right',
      missingSplitId: 'split-0',
      mode: 'open',
    });
    assert.equal(result.outcome, 'committed');
    const nextProjection = workspace.getSnapshot();
    assert.notEqual(nextProjection, initialProjection);
    assert.equal(nextProjection.state, 'ready');
    if (nextProjection.state !== 'ready') throw new Error('Workspace projection is unavailable');
    assert.deepEqual(
      nextProjection.workspace.nodes.right?.kind === 'pane'
        ? nextProjection.workspace.nodes.right.contexts
        : undefined,
      ['file'],
    );
    assert.deepEqual(handle.doc().paneContexts.file, { paneId: 'right', position: 0 });
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
  const first = await openWorkspace(handle);
  const second = await openWorkspace(handle);

  try {
    const results = await Promise.all([
      first.act({
        kind: 'workspace.context.open',
        contextId: 'first',
        url: 'first',
        targetPaneId: 'left',
        missingSplitId: 'unused-first',
        mode: 'open',
      }),
      second.act({
        kind: 'workspace.context.open',
        contextId: 'second',
        url: 'second',
        targetPaneId: 'left',
        missingSplitId: 'unused-second',
        mode: 'open',
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
  const workspace = await openWorkspace(handle);
  try {
    handle.change((doc) => {
      (doc.panes.left as { activeContext: string }).activeContext = 'missing';
    });
    const projection = workspace.getSnapshot();
    assert.equal(projection.state, 'invalid');
    assert.equal(projection.issues.some(({ code }) => code === 'patchpit.workspace.active-context-unmounted'), true);
  } finally {
    workspace.close();
    await repo.shutdown();
  }
});
