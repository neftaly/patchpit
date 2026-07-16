import {
  applyWorkspaceOperation,
  contextIdForUrl,
  paneIdsInLayoutOrder,
  type WorkspaceOperation,
  type WorkspaceState,
} from './durable-state.ts';
import {
  clearWorkspacePreview,
  previewWorkspaceContext,
  reconcileWorkspaceViewState,
  selectWorkspaceContext,
  type WorkspaceAction,
  type WorkspaceViewState,
} from './view-state.ts';

export type WorkspacePlan = {
  readonly operations: readonly WorkspaceOperation[];
  readonly viewState: WorkspaceViewState;
  readonly workspace: WorkspaceState;
};

export const planWorkspaceAction = (options: {
  readonly action: WorkspaceAction;
  readonly isEditorContext: (url: string) => boolean;
  readonly viewState: WorkspaceViewState;
  readonly workspace: WorkspaceState;
}): WorkspacePlan => {
  const { action, isEditorContext } = options;
  const plan = emptyPlan(options.workspace, options.viewState);

  if (action.kind === 'workspace.context.activate') {
    const url = contextUrl(plan.workspace, plan.viewState, action.paneId, action.contextId);
    return {
      ...plan,
      viewState: selectWorkspaceContext(
        plan.workspace,
        plan.viewState,
        action.paneId,
        action.contextId,
        url !== undefined && isEditorContext(url),
      ),
    };
  }
  if (action.kind === 'workspace.split.resize') {
    return reconcilePlan(applyPlannedOperation(plan, action));
  }
  if (action.kind === 'workspace.context.close') {
    const preview = plan.viewState.panes[action.paneId]?.preview;
    if (preview?.contextId === action.contextId) {
      const cleared = {
        ...plan,
        viewState: clearWorkspacePreview(plan.workspace, plan.viewState, action.paneId),
      };
      const pane = plan.workspace.nodes[action.paneId];
      return reconcilePlan(pane?.kind === 'pane' && pane.contexts.length === 0
        ? applyPlannedOperation(cleared, { kind: 'workspace.pane.close', paneId: action.paneId })
        : cleared);
    }
    return reconcilePlan(applyPlannedOperation(plan, action));
  }

  const preview = Object.entries(plan.viewState.panes)
    .find(([, pane]) => pane.preview?.contextId === action.contextId);
  const previewUrl = preview?.[1].preview?.url;
  const newUrl = action.url ?? previewUrl;
  const operation = durablePlacementOperation(action, newUrl);
  const applied = applyPlannedOperation(plan, operation);
  const withoutPreview = preview === undefined
    ? applied.viewState
    : clearWorkspacePreview(applied.workspace, applied.viewState, preview[0]);
  const targetPaneId = action.kind === 'workspace.context.move' ? action.targetPaneId : action.ids.paneId;
  return reconcilePlan({
    ...applied,
    viewState: selectWorkspaceContext(
      applied.workspace,
      withoutPreview,
      targetPaneId,
      action.contextId,
      true,
    ),
  });
};

type OpenWorkspaceContextOptions = {
  readonly contextId: string;
  readonly isEditorContext: (url: string) => boolean;
  readonly nodes: { readonly paneId: string; readonly splitId: string };
  readonly pinned: boolean;
  readonly viewState: WorkspaceViewState;
  readonly url: string;
  readonly workspace: WorkspaceState;
};

export const planOpenWorkspaceContext = (options: OpenWorkspaceContextOptions): WorkspacePlan => {
  const initial = emptyPlan(options.workspace, options.viewState);
  const target = planEditorTarget(options, initial);
  if (target === undefined) return initial;
  const { paneId: targetPaneId, plan } = target;
  const existing = contextIdForUrl(plan.workspace, options.url, targetPaneId);
  if (existing !== undefined) {
    return {
      ...plan,
      viewState: selectWorkspaceContext(plan.workspace, plan.viewState, targetPaneId, existing, true),
    };
  }
  const currentPreview = plan.viewState.panes[targetPaneId]?.preview;
  const contextId = currentPreview?.url === options.url ? currentPreview.contextId : options.contextId;
  if (options.pinned) {
    const pinned = plan.workspace.contexts[contextId] === undefined
      ? applyPlannedOperation(plan, {
          kind: 'workspace.context.pin',
          contextId,
          url: options.url,
          targetPaneId,
          beforeContext: null,
        })
      : plan;
    const withoutPreview = clearWorkspacePreview(pinned.workspace, pinned.viewState, targetPaneId);
    return reconcilePlan({
      ...pinned,
      viewState: selectWorkspaceContext(pinned.workspace, withoutPreview, targetPaneId, contextId, true),
    });
  }
  return reconcilePlan({
    ...plan,
    viewState: previewWorkspaceContext(plan.workspace, plan.viewState, targetPaneId, {
      contextId,
      url: options.url,
    }),
  });
};

const emptyPlan = (workspace: WorkspaceState, viewState: WorkspaceViewState): WorkspacePlan => ({
  operations: [],
  viewState,
  workspace,
});

const applyPlannedOperation = (plan: WorkspacePlan, operation: WorkspaceOperation): WorkspacePlan => {
  const workspace = applyWorkspaceOperation(plan.workspace, operation);
  return workspace === plan.workspace
    ? plan
    : { ...plan, operations: [...plan.operations, operation], workspace };
};

const reconcilePlan = (plan: WorkspacePlan): WorkspacePlan => ({
  ...plan,
  viewState: reconcileWorkspaceViewState(plan.workspace, plan.viewState),
});

const durablePlacementOperation = (
  action: Extract<WorkspaceAction, { readonly kind: 'workspace.context.move' | 'workspace.context.split' }>,
  url: string | undefined,
): WorkspaceOperation => {
  if (action.kind === 'workspace.context.move') {
    return url === undefined
      ? {
          kind: 'workspace.context.move',
          contextId: action.contextId,
          targetPaneId: action.targetPaneId,
          beforeContext: action.beforeContext,
        }
      : {
          kind: 'workspace.context.pin',
          contextId: action.contextId,
          url,
          targetPaneId: action.targetPaneId,
          beforeContext: action.beforeContext,
        };
  }
  return url === undefined
    ? {
        kind: 'workspace.context.split',
        contextId: action.contextId,
        targetPaneId: action.targetPaneId,
        edge: action.edge,
        ids: action.ids,
      }
    : {
        kind: 'workspace.context.pin-split',
        contextId: action.contextId,
        url,
        targetPaneId: action.targetPaneId,
        edge: action.edge,
        ids: action.ids,
      };
};

const planEditorTarget = (
  options: OpenWorkspaceContextOptions,
  plan: WorkspacePlan,
): { readonly paneId: string; readonly plan: WorkspacePlan } | undefined => {
  const currentEditorPaneId = editorPaneId(plan.workspace, plan.viewState, options.isEditorContext);
  if (currentEditorPaneId !== undefined) return { paneId: currentEditorPaneId, plan };
  const firstPaneId = paneIdsInLayoutOrder(plan.workspace)[0];
  if (firstPaneId === undefined) return undefined;
  const operation: WorkspaceOperation = options.pinned
    ? {
        kind: 'workspace.context.pin-split',
        contextId: options.contextId,
        url: options.url,
        targetPaneId: firstPaneId,
        edge: 'right',
        ids: options.nodes,
      }
    : {
        kind: 'workspace.pane.split',
        targetPaneId: firstPaneId,
        edge: 'right',
        ids: options.nodes,
      };
  return { paneId: options.nodes.paneId, plan: applyPlannedOperation(plan, operation) };
};

const editorPaneId = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  isEditorContext: (url: string) => boolean,
) => {
  const candidates = [viewState.activePaneId, ...paneIdsInLayoutOrder(workspace)];
  return candidates.find((paneId, index) => paneId !== null
    && candidates.indexOf(paneId) === index
    && paneHasEditorContext(workspace, viewState, paneId, isEditorContext)) ?? undefined;
};

const paneHasEditorContext = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: string,
  isEditorContext: (url: string) => boolean,
) => {
  const pane = workspace.nodes[paneId];
  if (pane?.kind !== 'pane') return false;
  const preview = viewState.panes[paneId]?.preview;
  const ids = preview === null || preview === undefined
    ? pane.contexts
    : [...pane.contexts, preview.contextId];
  return ids.some((contextId) => {
    const url = contextUrl(workspace, viewState, paneId, contextId);
    return url !== undefined && isEditorContext(url);
  });
};

const contextUrl = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: string,
  contextId: string,
) => workspace.contexts[contextId]?.url
  ?? (viewState.panes[paneId]?.preview?.contextId === contextId
    ? viewState.panes[paneId]?.preview?.url
    : undefined);
