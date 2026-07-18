import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWorkspaceOperation,
  createWorkspace,
  type WorkspaceOperation,
  type WorkspaceState,
} from '../../src/workspace/durable-state.ts';
import {
  composeWorkspacePresentation,
  createWorkspaceViewState,
  previewWorkspaceContext,
  selectWorkspaceContext,
  type WorkspaceViewState,
} from '../../src/workspace/view-state.ts';
import { openWorkspacePresence } from '../../src/workspace/presence-runtime.ts';
import { planOpenWorkspaceContext, planWorkspaceAction } from '../../src/workspace/action-planner.ts';
import { workspaceInvariantViolations } from '../support/workspace-test-support.ts';

const resourcesUrl = 'files.html';
const isEditor = (url: string) => url !== resourcesUrl;

void test('durable workspace stores topology and pinned placements without per-view selection', () => {
  const workspace = createWorkspace(resourcesUrl, 'app.html#{"resourceRef":"demo"}');
  assert.deepEqual(workspace.nodes, {
    left: { kind: 'pane', contexts: ['context-0'] },
    right: { kind: 'pane', contexts: ['context-1'] },
    'split-0': { kind: 'split', axis: 'horizontal', first: 'left', ratio: 0.2, second: 'right' },
  });
  assertWorkspace(workspace);
});

void test('closing the last tab explicitly collapses its pane while empty root panes remain valid', () => {
  let workspace = createWorkspace(resourcesUrl, 'document');
  workspace = apply(workspace, { kind: 'workspace.context.close', contextId: 'context-1' });
  assert.equal(workspace.nodes.right, undefined);
  assert.equal(workspace.rootNodeId, 'left');

  workspace = apply(workspace, { kind: 'workspace.context.close', contextId: 'context-0' });
  assert.deepEqual(workspace.nodes.left, { kind: 'pane', contexts: [] });
  assertWorkspace(workspace);
});

void test('splitting a pane can move its last tab and leave the original pane empty', () => {
  const initial = createWorkspace('files.html');
  const split = applyWorkspaceOperation(initial, {
    kind: 'workspace.context.split',
    contextId: 'context-0',
    targetPaneId: 'left',
    edge: 'right',
    ids: { paneId: 'right', splitId: 'split-0' },
  });

  assert.deepEqual(split.nodes.left, { kind: 'pane', contexts: [] });
  assert.deepEqual(split.nodes.right, { kind: 'pane', contexts: ['context-0'] });
  assert.deepEqual(workspaceInvariantViolations(split), []);
});

void test('a context split with colliding node IDs is an atomic no-op', () => {
  const workspace = createWorkspace(resourcesUrl, 'document');
  const split = applyWorkspaceOperation(workspace, {
    kind: 'workspace.context.split',
    contextId: 'context-0',
    targetPaneId: 'left',
    edge: 'left',
    ids: { paneId: 'unused-pane', splitId: 'split-0' },
  });

  assert.equal(split, workspace);
  assert.deepEqual(workspaceInvariantViolations(split), []);
});

void test('preview replacement and selection remain outside durable workspace state', () => {
  const workspace = createWorkspace(resourcesUrl, 'document');
  let viewState = createWorkspaceViewState(workspace, ['context-1']);
  viewState = previewWorkspaceContext(workspace, viewState, 'right', { contextId: 'preview-a', url: 'a' });
  viewState = previewWorkspaceContext(workspace, viewState, 'right', { contextId: 'preview-b', url: 'b' });
  const presentation = composeWorkspacePresentation(workspace, viewState, isEditor);

  assert.equal(workspace.contexts['preview-a'], undefined);
  assert.equal(workspace.contexts['preview-b'], undefined);
  assert.deepEqual(presentation.nodes.right, {
    kind: 'pane',
    selectedContext: 'preview-b',
    contexts: ['context-1', 'preview-b'],
    previewContext: 'preview-b',
  });
});

void test('workspace presence is owned by exact per-client external sources', async () => {
  const workspace = createWorkspace(resourcesUrl, 'document');
  const first = await openWorkspacePresence({
    sourceId: 'presence:client-a',
    workspace,
    recentContextIds: ['context-1'],
  });
  const second = await openWorkspacePresence({
    sourceId: 'presence:client-b',
    workspace,
    recentContextIds: ['context-0'],
  });
  let changes = 0;
  const unsubscribe = first.subscribe(() => { changes += 1; });
  const before = first.getSnapshot();
  await first.update(workspace, (viewState) => previewWorkspaceContext(
    workspace,
    viewState,
    'right',
    { contextId: 'preview', url: 'document-2' },
  ));
  const after = first.getSnapshot();

  assert.notEqual(after, before);
  assert.equal(after.panes.right?.preview?.contextId, 'preview');
  assert.deepEqual(second.getSnapshot().recentContextIds, ['context-0']);
  assert.equal(second.getSnapshot().panes.right?.preview, null);
  assert.equal(changes, 1);
  unsubscribe();
  first.close();
  assert.equal(first.getSnapshot(), after);
  const replacePreview = (viewState: WorkspaceViewState) => previewWorkspaceContext(
    workspace,
    viewState,
    'right',
    { contextId: 'replacement-preview', url: 'document-3' },
  );
  assert.equal(await first.update(workspace, replacePreview), false);
  assert.equal(await second.update(workspace, replacePreview), true);
  second.close();
});

void test('recent Resources interaction preserves the active editor', () => {
  const workspace = createWorkspace(resourcesUrl, 'document');
  let viewState = createWorkspaceViewState(workspace, ['context-1']);
  viewState = selectWorkspaceContext(workspace, viewState, 'left', 'context-0');
  assert.deepEqual(viewState.recentContextIds, ['context-0', 'context-1']);
  assert.equal(composeWorkspacePresentation(workspace, viewState, isEditor).activeEditorContextId, 'context-1');
  const plan = planOpenWorkspaceContext({
    contextId: 'preview',
    isEditorContext: isEditor,
    nodes: { paneId: 'unused-pane', splitId: 'unused-split' },
    pinned: false,
    viewState,
    url: 'viewer.html#{"resourceRef":"notes"}',
    workspace,
  });

  assert.equal(plan.durableOperation, undefined);
  assert.deepEqual(plan.viewState.recentContextIds.slice(0, 3), ['preview', 'context-0', 'context-1']);
  assert.equal(plan.viewState.panes.right?.preview?.contextId, 'preview');
});

void test('moving a preview promotes it and closing it collapses the destination pane', () => {
  let workspace = createWorkspace(resourcesUrl, 'document');
  let viewState = previewWorkspaceContext(
    workspace,
    createWorkspaceViewState(workspace, ['context-1']),
    'right',
    { contextId: 'preview', url: 'viewer.html#{"resourceRef":"notes"}' },
  );
  let plan = planWorkspaceAction({
    action: {
      kind: 'workspace.context.split',
      contextId: 'preview',
      targetPaneId: 'right',
      edge: 'bottom',
      ids: { paneId: 'bottom', splitId: 'split-1' },
      url: null,
    },
    viewState,
    workspace,
  });
  workspace = plan.workspace;
  viewState = plan.viewState;
  assert.equal(workspace.contexts.preview?.url, 'viewer.html#{"resourceRef":"notes"}');
  assert.deepEqual(workspace.nodes.bottom, { kind: 'pane', contexts: ['preview'] });

  plan = planWorkspaceAction({
    action: { kind: 'workspace.context.close', contextId: 'preview' },
    viewState,
    workspace,
  });
  assert.equal(plan.workspace.nodes.bottom, undefined);
  assert.deepEqual(plan.viewState.recentContextIds, ['context-1']);
  assert.equal(composeWorkspacePresentation(plan.workspace, plan.viewState, isEditor).activeEditorContextId, 'context-1');
  assertWorkspace(plan.workspace);
});

const apply = (workspace: WorkspaceState, operation: WorkspaceOperation) =>
  applyWorkspaceOperation(workspace, operation);

const assertWorkspace = (workspace: WorkspaceState) => {
  assert.deepEqual(workspaceInvariantViolations(workspace), []);
};
