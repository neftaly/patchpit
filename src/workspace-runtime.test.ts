import assert from 'node:assert/strict';
import test from 'node:test';
import { Repo } from '@automerge/automerge-repo';
import { addContext, openContext } from './workspace.ts';
import { createWorkspaceDocument, openWorkspace } from './workspace-runtime.ts';
import { workspaceSchemaArtifact } from './workspace-schema.ts';

void test('workspace runtime owns commits while its ready Repo handle owns the document', async () => {
  const repo = new Repo();
  const handle = repo.create(createWorkspaceDocument('home'));
  const workspace = openWorkspace(handle);
  let changes = 0;
  const unsubscribe = workspace.subscribe(() => {
    changes += 1;
  });

  try {
    const initialSnapshot = workspace.getSnapshot();
    assert.equal(workspace.getSnapshot(), initialSnapshot);
    assert.equal(workspace.resourceRef, handle.url);
    assert.equal(initialSnapshot, handle.doc());

    await workspace.update((current) => openContext(
      addContext(current, 'file', 'viewer.html#{"src":"file"}'),
      'file',
      'right',
      'split-0',
    ));
    assert.notEqual(workspace.getSnapshot(), initialSnapshot);
    assert.equal(workspace.getSnapshot(), handle.doc());
    assert.equal(workspace.getSnapshot()['@patchpit'].type, 'workspace');
    assert.deepEqual(workspace.getSnapshot()['@patchpit'].schema, {
      id: workspaceSchemaArtifact.id,
      contentHash: workspaceSchemaArtifact.contentHash,
    });
    assert.equal(
      workspace.getSnapshot()['@patchpit'].schemas[workspaceSchemaArtifact.id]?.contentHash,
      workspaceSchemaArtifact.contentHash,
    );
    assert.equal('panes' in workspace.getSnapshot(), false);
    assert.equal('nextNodeId' in workspace.getSnapshot(), false);
    const right = workspace.getSnapshot().nodes.right;
    assert.deepEqual(right?.kind === 'pane' ? right.contexts : undefined, ['file']);
    assert.equal(changes, 1);

    await assert.rejects(workspace.update(() => { throw new Error('failed update'); }), /failed update/);
    await workspace.update((current) => openContext(
      addContext(current, 'next', 'viewer.html#{"src":"next"}'),
      'next',
      'right',
    ));
    const recovered = workspace.getSnapshot().nodes.right;
    assert.deepEqual(recovered?.kind === 'pane' ? recovered.contexts : undefined, ['file', 'next']);
  } finally {
    unsubscribe();
    workspace.close();
    assert.equal(handle.isReady(), true);
    await repo.shutdown();
  }
});
