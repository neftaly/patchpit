import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkspaceOperation,
  createWorkspace,
  workspaceInvariantViolations,
  type WorkspaceOperation,
  type WorkspacePaneId,
  type WorkspaceState,
} from './workspace.ts';

const fileContexts = ['personal-readme', 'shared-readme', 'shared-schedule', 'project-notes'] as const;

void test('initial document context opens beside a twenty-percent workspace pane', () => {
  const workspace = createWorkspace('home', 'index');
  assert.deepEqual(pane(workspace, 'right')?.contexts, ['context-1']);
  assert.equal(workspace.contexts['context-1']?.url, 'index');
  assert.equal(workspace.nodes['split-0']?.kind === 'split' && workspace.nodes['split-0'].ratio, 0.2);
  assertWorkspaceInvariants(workspace);
});

void test('preview replacement, pinning, and movement preserve context ownership', () => {
  const personalContext = 'personal-readme';
  const sharedContext = 'shared-readme';
  let workspace = apply(createWorkspace('home'), openOperation(personalContext, 'right', 'preview', 'split-0'));

  assert.equal(pane(workspace, 'right')?.previewContext, personalContext);
  workspace = apply(workspace, openOperation(sharedContext, 'right', 'preview'));
  assert.equal(pane(workspace, 'right')?.contexts.includes(personalContext), false);
  assert.equal(pane(workspace, 'right')?.previewContext, sharedContext);

  workspace = apply(workspace, openOperation(sharedContext, 'right', 'open'));
  workspace = apply(workspace, openOperation(personalContext, 'right', 'preview'));
  assert.equal(pane(workspace, 'right')?.contexts.includes(sharedContext), true);
  assert.equal(pane(workspace, 'right')?.previewContext, personalContext);

  workspace = apply(workspace, moveOperation(personalContext, 'left'));
  assert.equal(pane(workspace, 'right')?.previewContext, null);
  assert.equal(pane(workspace, 'left')?.previewContext, null);
  assert.equal(pane(workspace, 'left')?.contexts.includes(personalContext), true);

  workspace = apply(workspace, moveOperation(personalContext, 'right', sharedContext));
  assert.deepEqual(pane(workspace, 'right')?.contexts.slice(0, 2), [personalContext, sharedContext]);
  assert.equal(apply(workspace, moveOperation(personalContext, 'right', sharedContext)), workspace);
});

void test('edge drops split panes without duplicating contexts', () => {
  let workspace = apply(createWorkspace('home'), openOperation('other', 'right', 'open', 'split-0'));
  workspace = apply(workspace, openOperation('file', 'right', 'open'));
  workspace = apply(workspace, {
    kind: 'workspace.context.split',
    contextId: 'file',
    targetPaneId: 'right',
    edge: 'left',
    ids: { paneId: 'pane-1', splitId: 'split-1' },
    url: null,
  });

  assert.deepEqual(pane(workspace, 'pane-1')?.contexts, ['file']);
  assert.deepEqual(pane(workspace, 'right')?.contexts, ['other']);
  assert.equal(workspace.rootNodeId, 'split-0');
  assert.deepEqual(workspace.nodes, {
    left: { kind: 'pane', activeContext: 'context-0', contexts: ['context-0'], previewContext: null },
    right: { kind: 'pane', activeContext: 'other', contexts: ['other'], previewContext: null },
    'pane-1': { kind: 'pane', activeContext: 'file', contexts: ['file'], previewContext: null },
    'split-0': { kind: 'split', axis: 'horizontal', first: 'left', ratio: 0.5, second: 'split-1' },
    'split-1': { kind: 'split', axis: 'horizontal', first: 'pane-1', ratio: 0.5, second: 'right' },
  });
  assertWorkspaceInvariants(workspace);
});

void test('split resizing is constrained and preserves topology', () => {
  let workspace = apply(createWorkspace('home'), openOperation('file', 'right', 'open', 'split-0'));
  workspace = apply(workspace, { kind: 'workspace.split.resize', splitId: 'split-0', ratio: 0.7 });
  assert.equal(workspace.nodes['split-0']?.kind === 'split' && workspace.nodes['split-0'].ratio, 0.7);
  workspace = apply(workspace, { kind: 'workspace.split.resize', splitId: 'split-0', ratio: 2 });
  assert.equal(workspace.nodes['split-0']?.kind === 'split' && workspace.nodes['split-0'].ratio, 0.9);
  assertWorkspaceInvariants(workspace);
});

void test('moving the last context out collapses its pane', () => {
  let workspace = apply(createWorkspace('home'), openOperation('file', 'right', 'open', 'split-0'));
  workspace = apply(workspace, moveOperation('file', 'left'));

  assert.equal(workspace.nodes.right, undefined);
  assert.equal(workspace.rootNodeId, 'left');
  assertWorkspaceInvariants(workspace);
});

void test('closing contexts selects a remaining tab and collapses empty panes', () => {
  let workspace = apply(createWorkspace('home'), openOperation('first', 'right', 'open', 'split-0'));
  workspace = apply(workspace, openOperation('second', 'right', 'open'));
  workspace = apply(workspace, openOperation('third', 'right', 'open'));
  workspace = apply(workspace, { kind: 'workspace.context.activate', paneId: 'right', contextId: 'second' });
  workspace = apply(workspace, closeOperation('right', 'second'));
  assert.equal(pane(workspace, 'right')?.activeContext, 'third');
  workspace = apply(workspace, closeOperation('right', 'third'));
  workspace = apply(workspace, closeOperation('right', 'first'));
  assert.equal(workspace.nodes.right, undefined);
  assert.equal(workspace.rootNodeId, 'left');
  assert.equal(apply(workspace, closeOperation('left', 'context-0')), workspace);
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
    workspace = apply(workspace, openOperation(
      contextId,
      paneId,
      iteration % 3 === 0 ? 'open' : 'preview',
      `split-${iteration}`,
    ));
    if (iteration % 5 === 0) {
      workspace = apply(workspace, moveOperation(contextId, paneIds[iteration % 2] ?? 'left'));
    }
    if (iteration % 11 === 0) workspace = apply(workspace, closeOperation(paneId, contextId));
    if (iteration % 7 === 0) {
      const targets = Object.entries(workspace.nodes)
        .filter(([, node]) => node.kind === 'pane')
        .map(([nodeId]) => nodeId);
      const target = targets[iteration % targets.length];
      const edge = edges[iteration % edges.length];
      if (target !== undefined && edge !== undefined) {
        workspace = apply(workspace, {
          kind: 'workspace.context.split',
          contextId,
          targetPaneId: target,
          edge,
          ids: {
            paneId: `pane-split-${iteration}`,
            splitId: `split-split-${iteration}`,
          },
          url: null,
        });
      }
    }
    assertWorkspaceInvariants(workspace);
  }
});

const assertWorkspaceInvariants = (workspace: WorkspaceState) => {
  assert.deepEqual(workspaceInvariantViolations(workspace), []);
};

const pane = (workspace: WorkspaceState, paneId: string) => {
  const node = workspace.nodes[paneId];
  return node?.kind === 'pane' ? node : undefined;
};

const apply = (workspace: WorkspaceState, operation: WorkspaceOperation) =>
  applyWorkspaceOperation(workspace, operation);

const openOperation = (
  contextId: string,
  targetPaneId: string,
  mode: 'open' | 'preview',
  missingSplitId = 'unused',
): WorkspaceOperation => ({
  kind: 'workspace.context.open',
  contextId,
  url: contextId,
  targetPaneId,
  missingSplitId,
  mode,
});

const moveOperation = (
  contextId: string,
  targetPaneId: string,
  beforeContext: string | null = null,
): WorkspaceOperation => ({
  kind: 'workspace.context.move',
  contextId,
  targetPaneId,
  beforeContext,
  url: null,
  pin: false,
});

const closeOperation = (paneId: string, contextId: string): WorkspaceOperation => ({
  kind: 'workspace.context.close',
  paneId,
  contextId,
});
