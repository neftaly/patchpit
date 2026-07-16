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
} from '../../src/workspace/view-state.ts';
import { openWorkspaceViewState } from '../../src/workspace/view-state-runtime.ts';
import { planOpenWorkspaceContext, planWorkspaceAction } from '../../src/workspace/action-planner.ts';
import { workspaceInvariantViolations } from '../support/workspace-test-support.ts';

const resourcesUrl = 'files.html';
const isEditor = (url: string) => url !== resourcesUrl;

void test('durable workspace stores topology and pinned placements without per-view selection', () => {
  const workspace = createWorkspace(resourcesUrl, 'app.html#{"rootEntryId":"demo"}');
  assert.deepEqual(workspace.nodes, {
    left: { kind: 'pane', contexts: ['context-0'] },
    right: { kind: 'pane', contexts: ['context-1'] },
    'split-0': { kind: 'split', axis: 'horizontal', first: 'left', ratio: 0.2, second: 'right' },
  });
  assertWorkspace(workspace);
});

void test('closing the last tab explicitly collapses its pane while empty root panes remain valid', () => {
  let workspace = createWorkspace(resourcesUrl, 'document');
  workspace = apply(workspace, { kind: 'workspace.context.close', paneId: 'right', contextId: 'context-1' });
  assert.equal(workspace.nodes.right, undefined);
  assert.equal(workspace.rootNodeId, 'left');

  workspace = apply(workspace, { kind: 'workspace.context.close', paneId: 'left', contextId: 'context-0' });
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
  let viewState = createWorkspaceViewState(workspace, 'right');
  viewState = previewWorkspaceContext(workspace, viewState, 'right', { contextId: 'preview-a', url: 'a' });
  viewState = previewWorkspaceContext(workspace, viewState, 'right', { contextId: 'preview-b', url: 'b' });
  const presentation = composeWorkspacePresentation(workspace, viewState);

  assert.equal(workspace.contexts['preview-a'], undefined);
  assert.equal(workspace.contexts['preview-b'], undefined);
  assert.deepEqual(presentation.nodes.right, {
    kind: 'pane',
    activeContext: 'preview-b',
    contexts: ['context-1', 'preview-b'],
    previewContext: 'preview-b',
  });
});

void test('per-view state is owned by an exact external source with its own identity', () => {
  const workspace = createWorkspace(resourcesUrl, 'document');
  const runtime = openWorkspaceViewState({
    sourceId: 'view-state:client-a',
    workspace,
    activePaneId: 'right',
  });
  let changes = 0;
  const unsubscribe = runtime.subscribe(() => { changes += 1; });
  const before = runtime.getSnapshot();
  runtime.update(workspace, (viewState) => previewWorkspaceContext(
    workspace,
    viewState,
    'right',
    { contextId: 'preview', url: 'document-2' },
  ));
  const after = runtime.getSnapshot();

  assert.equal(runtime.sourceId, 'view-state:client-a');
  assert.notEqual(after, before);
  assert.equal(after.panes.right?.preview?.contextId, 'preview');
  assert.equal(changes, 1);
  unsubscribe();
  runtime.close();
});

void test('Resources selection does not replace the active editor target', () => {
  const workspace = createWorkspace(resourcesUrl, 'document');
  let viewState = createWorkspaceViewState(workspace, 'right');
  viewState = selectWorkspaceContext(workspace, viewState, 'left', 'context-0', false);
  const plan = planOpenWorkspaceContext({
    contextId: 'preview',
    isEditorContext: isEditor,
    nodes: { paneId: 'unused-pane', splitId: 'unused-split' },
    pinned: false,
    viewState,
    url: 'viewer.html#{"entryId":"notes"}',
    workspace,
  });

  assert.equal(plan.operations.length, 0);
  assert.equal(plan.viewState.activePaneId, 'right');
  assert.equal(plan.viewState.panes.right?.preview?.contextId, 'preview');
});

void test('moving a preview promotes it and closing it collapses the destination pane', () => {
  let workspace = createWorkspace(resourcesUrl, 'document');
  let viewState = previewWorkspaceContext(
    workspace,
    createWorkspaceViewState(workspace, 'right'),
    'right',
    { contextId: 'preview', url: 'viewer.html#{"entryId":"notes"}' },
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
    isEditorContext: isEditor,
    viewState,
    workspace,
  });
  workspace = plan.workspace;
  viewState = plan.viewState;
  assert.equal(workspace.contexts.preview?.url, 'viewer.html#{"entryId":"notes"}');
  assert.deepEqual(workspace.nodes.bottom, { kind: 'pane', contexts: ['preview'] });

  plan = planWorkspaceAction({
    action: { kind: 'workspace.context.close', paneId: 'bottom', contextId: 'preview' },
    isEditorContext: isEditor,
    viewState,
    workspace,
  });
  assert.equal(plan.workspace.nodes.bottom, undefined);
  assertWorkspace(plan.workspace);
});

const apply = (workspace: WorkspaceState, operation: WorkspaceOperation) =>
  applyWorkspaceOperation(workspace, operation);

const assertWorkspace = (workspace: WorkspaceState) => {
  assert.deepEqual(workspaceInvariantViolations(workspace), []);
};
