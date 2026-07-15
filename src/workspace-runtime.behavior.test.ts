import assert from 'node:assert/strict';
import test from 'node:test';
import { getObjectId } from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import { createWorkspaceDocument, openWorkspace } from './workspace-runtime.ts';
import { workspaceStorageMappingArtifact } from './workspace-schema.ts';

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
    await assert.rejects(openWorkspace(handle), /workspace attachment is unavailable/);
  } finally {
    await repo.shutdown();
  }
});

void test('workspace writes preserve the identity of surviving logical rows', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createWorkspaceDocument('home'));
  const workspace = await openWorkspace(handle);
  const survivingIds = () => ({
    context: getObjectId(handle.doc().contexts['context-0']!),
    membership: getObjectId(handle.doc().paneContexts['context-0']!),
    pane: getObjectId(handle.doc().panes.left!),
  });
  const initialIds = survivingIds();

  try {
    assert.equal((await workspace.act({
      kind: 'workspace.context.open',
      contextId: 'file',
      url: 'viewer.html#{"src":"file"}',
      targetPaneId: 'left',
      missingSplitId: 'unused',
      mode: 'open',
    })).outcome, 'committed');
    assert.deepEqual(survivingIds(), initialIds);

    assert.equal((await workspace.act({
      kind: 'workspace.context.close',
      paneId: 'left',
      contextId: 'file',
    })).outcome, 'committed');
    assert.deepEqual(survivingIds(), initialIds);
    assert.equal(handle.doc().panes.left?.activeContext, 'context-0');
  } finally {
    workspace.close();
    await repo.shutdown();
  }
});
