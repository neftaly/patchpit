import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkspace,
  moveContext,
  openContext,
  previewContext,
  type WorkspacePaneId,
  type WorkspaceState,
} from './workspace.ts';

const fileContexts = ['personal-readme', 'shared-readme', 'shared-schedule', 'project-notes'] as const;

void test('preview replacement, pinning, and movement preserve context ownership', () => {
  const personalContext = 'personal-readme';
  const sharedContext = 'shared-readme';
  let workspace = previewContext(createWorkspace('home'), personalContext, 'right');

  assert.equal(workspace.right.previewContext, personalContext);
  workspace = previewContext(workspace, sharedContext, 'right');
  assert.equal(workspace.right.contexts.includes(personalContext), false);
  assert.equal(workspace.right.previewContext, sharedContext);

  workspace = openContext(workspace, sharedContext, 'right');
  workspace = previewContext(workspace, personalContext, 'right');
  assert.equal(workspace.right.contexts.includes(sharedContext), true);
  assert.equal(workspace.right.previewContext, personalContext);

  workspace = moveContext(workspace, personalContext, 'left');
  assert.equal(workspace.right.previewContext, undefined);
  assert.equal(workspace.left.previewContext, undefined);
  assert.equal(workspace.left.contexts.includes(personalContext), true);

  workspace = moveContext(workspace, personalContext, 'right', sharedContext);
  assert.deepEqual(workspace.right.contexts.slice(0, 2), [personalContext, sharedContext]);
});

void test('context behavior fuzz preserves workspace invariants', () => {
  const paneIds: readonly WorkspacePaneId[] = ['left', 'right'];
  let workspace = createWorkspace('home');

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const contextId = fileContexts[(iteration * 17) % fileContexts.length];
    const paneId = paneIds[(iteration * 31) % paneIds.length];
    if (contextId === undefined || paneId === undefined) continue;
    workspace = iteration % 3 === 0
      ? openContext(workspace, contextId, paneId)
      : previewContext(workspace, contextId, paneId);
    if (iteration % 5 === 0) workspace = moveContext(workspace, contextId, paneIds[iteration % 2] ?? 'left');
    assertWorkspaceInvariants(workspace);
  }
});

const assertWorkspaceInvariants = (workspace: WorkspaceState) => {
  const mountedContexts = [...workspace.left.contexts, ...workspace.right.contexts];
  assert.equal(new Set(mountedContexts).size, mountedContexts.length);
  for (const paneId of ['left', 'right'] as const) {
    const pane = workspace[paneId];
    assert.equal(pane.activeContext === undefined || pane.contexts.includes(pane.activeContext), true);
    assert.equal(
      pane.previewContext === undefined || pane.contexts.includes(pane.previewContext), true);
  }
};
