import {
  applyWorkspaceOperation,
  paneIdsInLayoutOrder,
  type WorkspaceOperation,
  type WorkspaceState,
} from './durable-state.ts';
import {
  clearWorkspacePreview,
  previewWorkspaceContext,
  reconcileWorkspaceViewState,
  selectWorkspaceContext,
  workspaceContextPaneId,
  workspaceContextForUrl,
  activeWorkspaceEditor,
  type WorkspaceAction,
  type WorkspaceViewState,
} from './view-state.ts';

export type WorkspacePlan = {
  readonly durableOperation?: WorkspaceOperation;
  readonly viewState: WorkspaceViewState;
  readonly workspace: WorkspaceState;
};

export const planWorkspaceAction = (options: {
  readonly action: WorkspaceAction;
  readonly viewState: WorkspaceViewState;
  readonly workspace: WorkspaceState;
}): WorkspacePlan => {
  const { action } = options;
  const plan = emptyPlan(options.workspace, options.viewState);

  if (action.kind === 'workspace.context.select') {
    const paneId = workspaceContextPaneId(plan.workspace, plan.viewState, action.contextId);
    if (paneId === undefined) return plan;
    return {
      ...plan,
      viewState: selectWorkspaceContext(
        plan.workspace,
        plan.viewState,
        paneId,
        action.contextId,
      ),
    };
  }
  if (action.kind === 'workspace.split.resize') {
    return reconcilePlan(withDurableOperation(plan, action));
  }
  if (action.kind === 'workspace.context.close') {
    const paneId = workspaceContextPaneId(plan.workspace, plan.viewState, action.contextId);
    if (paneId === undefined) return plan;
    const preview = plan.viewState.panes[paneId]?.preview;
    if (preview?.contextId === action.contextId) {
      const cleared = {
        ...plan,
        viewState: clearWorkspacePreview(plan.workspace, plan.viewState, paneId),
      };
      const pane = plan.workspace.nodes[paneId];
      return reconcilePlan(pane?.kind === 'pane' && pane.contexts.length === 0
        ? withDurableOperation(cleared, { kind: 'workspace.pane.close', paneId })
        : cleared);
    }
    return reconcilePlan(withDurableOperation(plan, {
      kind: 'workspace.context.close',
      contextId: action.contextId,
    }));
  }

  const preview = Object.entries(plan.viewState.panes)
    .find(([, pane]) => pane.preview?.contextId === action.contextId);
  const previewUrl = preview?.[1].preview?.url;
  const newUrl = action.url ?? previewUrl;
  const operation = durablePlacementOperation(action, newUrl);
  const applied = withDurableOperation(plan, operation);
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
  const existing = workspaceContextForUrl(initial.workspace, initial.viewState, options.url);
  if (existing !== undefined && (!options.pinned || existing.kind === 'durable')) {
    return {
      ...initial,
      viewState: selectWorkspaceContext(
        initial.workspace,
        initial.viewState,
        existing.paneId,
        existing.contextId,
      ),
    };
  }
  if (existing?.kind === 'preview') {
    const pinned = withDurableOperation(initial, {
      kind: 'workspace.context.pin',
      contextId: existing.contextId,
      url: options.url,
      targetPaneId: existing.paneId,
      beforeContext: null,
    });
    const withoutPreview = clearWorkspacePreview(
      pinned.workspace,
      pinned.viewState,
      existing.paneId,
    );
    return reconcilePlan({
      ...pinned,
      viewState: selectWorkspaceContext(
        pinned.workspace,
        withoutPreview,
        existing.paneId,
        existing.contextId,
      ),
    });
  }
  if (workspaceContextPaneId(initial.workspace, initial.viewState, options.contextId) !== undefined) {
    return initial;
  }
  const target = planEditorTarget(options, initial);
  if (target === undefined) return initial;
  const { paneId: targetPaneId, plan } = target;
  const currentPreview = plan.viewState.panes[targetPaneId]?.preview;
  const contextId = currentPreview?.url === options.url ? currentPreview.contextId : options.contextId;
  if (options.pinned) {
    const pinned = plan.workspace.contexts[contextId] === undefined
      ? withDurableOperation(plan, {
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
      viewState: selectWorkspaceContext(pinned.workspace, withoutPreview, targetPaneId, contextId),
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
  viewState,
  workspace,
});

const withDurableOperation = (plan: WorkspacePlan, operation: WorkspaceOperation): WorkspacePlan => {
  const workspace = applyWorkspaceOperation(plan.workspace, operation);
  return workspace === plan.workspace
    ? plan
    : { ...plan, durableOperation: operation, workspace };
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
  const currentEditorPaneId = activeWorkspaceEditor(
    plan.workspace,
    plan.viewState,
    options.isEditorContext,
  )?.paneId;
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
  return { paneId: options.nodes.paneId, plan: withDurableOperation(plan, operation) };
};
