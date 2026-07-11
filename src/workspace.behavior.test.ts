import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeContext,
  createWorkspace,
  moveContext,
  openContext,
  previewContext,
  resizeSplit,
  splitContext,
  type WorkspacePaneId,
  type WorkspaceState,
} from './workspace.ts';

const fileContexts = ['personal-readme', 'shared-readme', 'shared-schedule', 'project-notes'] as const;

void test('initial document context opens beside a twenty-percent workspace pane', () => {
  const workspace = createWorkspace('home', 'index');
  assert.deepEqual(pane(workspace, 'right')?.contexts, ['index']);
  assert.equal(workspace.nodes['split-0']?.kind === 'split' && workspace.nodes['split-0'].ratio, 0.2);
  assertWorkspaceInvariants(workspace);
});

void test('preview replacement, pinning, and movement preserve context ownership', () => {
  const personalContext = 'personal-readme';
  const sharedContext = 'shared-readme';
  let workspace = previewContext(createWorkspace('home'), personalContext, 'right');

  assert.equal(pane(workspace, 'right')?.previewContext, personalContext);
  workspace = previewContext(workspace, sharedContext, 'right');
  assert.equal(pane(workspace, 'right')?.contexts.includes(personalContext), false);
  assert.equal(pane(workspace, 'right')?.previewContext, sharedContext);

  workspace = openContext(workspace, sharedContext, 'right');
  workspace = previewContext(workspace, personalContext, 'right');
  assert.equal(pane(workspace, 'right')?.contexts.includes(sharedContext), true);
  assert.equal(pane(workspace, 'right')?.previewContext, personalContext);

  workspace = moveContext(workspace, personalContext, 'left');
  assert.equal(pane(workspace, 'right')?.previewContext, null);
  assert.equal(pane(workspace, 'left')?.previewContext, null);
  assert.equal(pane(workspace, 'left')?.contexts.includes(personalContext), true);

  workspace = moveContext(workspace, personalContext, 'right', sharedContext);
  assert.deepEqual(pane(workspace, 'right')?.contexts.slice(0, 2), [personalContext, sharedContext]);
  assert.equal(moveContext(workspace, personalContext, 'right', sharedContext), workspace);
});

void test('edge drops split panes without duplicating contexts', () => {
  let workspace = openContext(createWorkspace('home'), 'other', 'right');
  workspace = openContext(workspace, 'file', 'right');
  workspace = splitContext(workspace, 'file', 'right', 'left');

  assert.deepEqual(pane(workspace, 'pane-1')?.contexts, ['file']);
  assert.deepEqual(pane(workspace, 'right')?.contexts, ['other']);
  assert.equal(workspace.rootNodeId, 'split-0');
  assert.deepEqual(workspace.nodes, {
    left: { kind: 'pane', activeContext: 'home', contexts: ['home'], previewContext: null },
    right: { kind: 'pane', activeContext: 'other', contexts: ['other'], previewContext: null },
    'pane-1': { kind: 'pane', activeContext: 'file', contexts: ['file'], previewContext: null },
    'split-0': { kind: 'split', axis: 'horizontal', first: 'left', ratio: 0.5, second: 'split-1' },
    'split-1': { kind: 'split', axis: 'horizontal', first: 'pane-1', ratio: 0.5, second: 'right' },
  });
  assertWorkspaceInvariants(workspace);
});

void test('split resizing is constrained and preserves topology', () => {
  let workspace = openContext(createWorkspace('home'), 'file', 'right');
  workspace = resizeSplit(workspace, 'split-0', 0.7);
  assert.equal(workspace.nodes['split-0']?.kind === 'split' && workspace.nodes['split-0'].ratio, 0.7);
  workspace = resizeSplit(workspace, 'split-0', 2);
  assert.equal(workspace.nodes['split-0']?.kind === 'split' && workspace.nodes['split-0'].ratio, 0.9);
  assertWorkspaceInvariants(workspace);
});

void test('moving the last context out collapses its pane', () => {
  let workspace = openContext(createWorkspace('home'), 'file', 'right');
  workspace = moveContext(workspace, 'file', 'left');

  assert.equal(workspace.nodes.right, undefined);
  assert.equal(workspace.rootNodeId, 'left');
  assertWorkspaceInvariants(workspace);
});

void test('closing contexts selects a remaining tab and collapses empty panes', () => {
  let workspace = openContext(createWorkspace('home'), 'first', 'right');
  workspace = openContext(workspace, 'second', 'right');
  workspace = closeContext(workspace, 'right', 'second');
  assert.equal(pane(workspace, 'right')?.activeContext, 'first');
  workspace = closeContext(workspace, 'right', 'first');
  assert.equal(workspace.nodes.right, undefined);
  assert.equal(workspace.rootNodeId, 'left');
  assert.equal(closeContext(workspace, 'left', 'home'), workspace);
  assertWorkspaceInvariants(workspace);
});

void test('context behavior fuzz preserves workspace invariants', () => {
  const paneIds: readonly WorkspacePaneId[] = ['left', 'right'];
  const edges = ['left', 'right', 'top', 'bottom'] as const;
  let workspace = createWorkspace('home');

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const contextId = fileContexts[(iteration * 17) % fileContexts.length];
    const paneId = paneIds[(iteration * 31) % paneIds.length];
    if (contextId === undefined || paneId === undefined) continue;
    workspace = iteration % 3 === 0
      ? openContext(workspace, contextId, paneId)
      : previewContext(workspace, contextId, paneId);
    if (iteration % 5 === 0) workspace = moveContext(workspace, contextId, paneIds[iteration % 2] ?? 'left');
    if (iteration % 11 === 0) workspace = closeContext(workspace, paneId, contextId);
    if (iteration % 7 === 0) {
      const targets = Object.entries(workspace.nodes)
        .filter(([, node]) => node.kind === 'pane')
        .map(([nodeId]) => nodeId);
      const target = targets[iteration % targets.length];
      const edge = edges[iteration % edges.length];
      if (target !== undefined && edge !== undefined) workspace = splitContext(workspace, contextId, target, edge);
    }
    assertWorkspaceInvariants(workspace);
  }
});

const assertWorkspaceInvariants = (workspace: WorkspaceState) => {
  const panes = Object.values(workspace.nodes).filter((node) => node.kind === 'pane');
  assert.equal(panes.every(({ contexts }) => contexts.length > 0), true);
  const mountedContexts = panes.flatMap(({ contexts }) => contexts);
  assert.equal(new Set(mountedContexts).size, mountedContexts.length);
  for (const pane of panes) {
    assert.equal(pane.contexts.includes(pane.activeContext), true);
    assert.equal(
      pane.previewContext === null || pane.contexts.includes(pane.previewContext), true);
  }
  const layoutPanes = layoutPaneIds(workspace, workspace.rootNodeId);
  const paneIds = Object.entries(workspace.nodes)
    .filter(([, node]) => node.kind === 'pane')
    .map(([nodeId]) => nodeId);
  assert.deepEqual([...layoutPanes].sort(), paneIds.sort());
};

const layoutPaneIds = (workspace: WorkspaceState, nodeId: string): readonly string[] => {
  const node = workspace.nodes[nodeId];
  if (node === undefined) return [];
  return node.kind === 'pane'
    ? [nodeId]
    : [...layoutPaneIds(workspace, node.first), ...layoutPaneIds(workspace, node.second)];
};

const pane = (workspace: WorkspaceState, paneId: string) => {
  const node = workspace.nodes[paneId];
  return node?.kind === 'pane' ? node : undefined;
};
