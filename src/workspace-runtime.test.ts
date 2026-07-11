import assert from 'node:assert/strict';
import test from 'node:test';
import { openFsEntries } from '@patchpit/fs';
import { openContext } from './workspace.ts';
import { openWorkspace } from './workspace-runtime.ts';

void test('workspace.am is a live Automerge document exposed through the filesystem', async () => {
  const workspace = openWorkspace('home');
  const files = openFsEntries([workspace.attachment]);
  let changes = 0;
  const unsubscribe = workspace.subscribe(() => {
    changes += 1;
  });

  try {
    const initialSnapshot = workspace.getSnapshot();
    const fileSnapshot = files.observer.getSnapshot();
    assert.equal(fileSnapshot.state, 'open');
    assert.deepEqual(fileSnapshot.current.rows.map(({ name, resourceRef }) => ({ name, resourceRef })), [{
      name: 'workspace.am',
      resourceRef: workspace.resourceRef,
    }]);

    await workspace.update((current) => openContext(current, 'file', 'right'));
    assert.notEqual(workspace.getSnapshot(), initialSnapshot);
    assert.equal(workspace.getSnapshot().workspace.kind, 'patchpit.workspace@1');
    assert.equal('panes' in workspace.getSnapshot().workspace, false);
    assert.equal('nextNodeId' in workspace.getSnapshot().workspace, false);
    const right = workspace.getSnapshot().workspace.nodes.right;
    assert.deepEqual(right?.kind === 'pane' ? right.contexts : undefined, ['file']);
    assert.equal(changes, 1);

    await assert.rejects(workspace.update(() => { throw new Error('failed update'); }), /failed update/);
    await workspace.update((current) => openContext(current, 'next', 'right'));
    const recovered = workspace.getSnapshot().workspace.nodes.right;
    assert.deepEqual(recovered?.kind === 'pane' ? recovered.contexts : undefined, ['file', 'next']);
  } finally {
    unsubscribe();
    files.close();
    workspace.close();
  }
});
