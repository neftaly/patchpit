import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import { createWorkspaceDocument, openWorkspaceRuntime } from '../../src/workspace/runtime.ts';
import {
  workspaceConstraintSetArtifact,
  workspaceStorageMappingArtifact,
} from '@patchpit/artifacts';

void test('workspace opening resolves its declared artifacts by exact identity', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  handle.change((doc) => {
    const mapping = doc['@patchpit'].schemas[workspaceStorageMappingArtifact.id] as unknown as {
      body: { model: string };
    };
    mapping.body.model = 'tampered';
  });

  try {
    await assert.rejects(openWorkspaceRuntime(handle), /workspace attachment is unavailable/);
  } finally {
    await repo.shutdown();
  }
});

void test('workspace opening resolves its constraint set by exact identity', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  handle.change((doc) => {
    const constraints = doc['@patchpit'].schemas[workspaceConstraintSetArtifact.id] as unknown as {
      body: { constraints: { code: string }[] };
    };
    constraints.body.constraints[0]!.code = 'tampered';
  });

  try {
    await assert.rejects(openWorkspaceRuntime(handle), /workspace attachment is unavailable/);
  } finally {
    await repo.shutdown();
  }
});

void test('workspace opening rejects conflicted Patchpit metadata without selecting a winner', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  handle.change((doc) => {
    (doc['@patchpit'].schema as { contentHash: string }).contentHash = 'sha256:neutral';
  });
  const base = handle.doc();
  const left = Automerge.change(
    Automerge.clone(base, { actor: '8'.repeat(64) }),
    (doc) => { (doc['@patchpit'].schema as { contentHash: string }).contentHash = 'sha256:other'; },
  );
  const right = Automerge.change(
    Automerge.clone(base, { actor: '9'.repeat(64) }),
    (doc) => {
      (doc['@patchpit'].schema as { contentHash: string }).contentHash =
        workspaceStorageMappingArtifact.body.schema.contentHash;
    },
  );
  handle.update(() => Automerge.merge(left, right));

  try {
    await assert.rejects(openWorkspaceRuntime(handle), /workspace metadata is invalid/);
  } finally {
    await repo.shutdown();
  }
});

void test('workspace writes preserve the identity of surviving logical rows', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  const workspace = await openWorkspaceRuntime(handle);
  const survivingIds = () => ({
    placement: Automerge.getObjectId(handle.doc().placements['context-0']!),
    pane: Automerge.getObjectId(handle.doc().panes.left!),
  });
  const initialIds = survivingIds();

  try {
    assert.equal((await workspace.commitOperation({
      kind: 'workspace.context.pin',
      contextId: 'file',
      url: 'viewer.html#{"src":"file"}',
      targetPaneId: 'left',
      beforeContext: null,
    })).outcome, 'committed');
    assert.deepEqual(survivingIds(), initialIds);

    assert.equal((await workspace.commitOperation({
      kind: 'workspace.context.close',
      paneId: 'left',
      contextId: 'file',
    })).outcome, 'committed');
    assert.deepEqual(survivingIds(), initialIds);
    assert.deepEqual(handle.doc().placements['context-0'], { paneId: 'left', position: 0, url: 'home' });
  } finally {
    workspace.close();
    await repo.shutdown();
  }
});
