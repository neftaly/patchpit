import {
  paneIdsInLayoutOrder,
  type WorkspaceContext,
  type WorkspaceNode,
  type WorkspacePaneId,
  type WorkspaceSplitEdge,
  type WorkspaceSplitIds,
  type WorkspaceState,
} from './durable-state.ts';

type WorkspacePreview = WorkspaceContext & {
  readonly contextId: string;
};

export type WorkspacePaneViewState = {
  readonly activeContextId: string | null;
  readonly preview: WorkspacePreview | null;
};

export type WorkspaceViewState = {
  readonly activePaneId: WorkspacePaneId | null;
  readonly panes: Readonly<Record<WorkspacePaneId, WorkspacePaneViewState>>;
};

export type WorkspacePresentationPane = {
  readonly kind: 'pane';
  readonly activeContext: string | null;
  readonly contexts: readonly string[];
  readonly previewContext: string | null;
};

export type WorkspacePresentation = {
  readonly activePaneId: WorkspacePaneId | null;
  readonly contexts: Readonly<Record<string, WorkspaceContext>>;
  readonly nodes: Readonly<Record<string, WorkspacePresentationPane | Exclude<WorkspaceNode, { readonly kind: 'pane' }>>>;
  readonly rootNodeId: string;
};

export type WorkspaceAction = {
  readonly kind: 'workspace.context.activate';
  readonly paneId: WorkspacePaneId;
  readonly contextId: string;
} | {
  readonly kind: 'workspace.context.close';
  readonly paneId: WorkspacePaneId;
  readonly contextId: string;
} | {
  readonly kind: 'workspace.context.move';
  readonly contextId: string;
  readonly targetPaneId: WorkspacePaneId;
  readonly beforeContext: string | null;
  readonly url: string | null;
} | {
  readonly kind: 'workspace.context.split';
  readonly contextId: string;
  readonly targetPaneId: WorkspacePaneId;
  readonly edge: WorkspaceSplitEdge;
  readonly ids: WorkspaceSplitIds;
  readonly url: string | null;
} | {
  readonly kind: 'workspace.split.resize';
  readonly splitId: string;
  readonly ratio: number;
};

export const createWorkspaceViewState = (
  workspace: WorkspaceState,
  activePaneId: WorkspacePaneId | null = null,
): WorkspaceViewState => {
  const paneIds = paneIdsInLayoutOrder(workspace);
  return {
    activePaneId: activePaneId !== null && paneIds.includes(activePaneId)
      ? activePaneId
      : paneIds[0] ?? null,
    panes: Object.fromEntries(paneIds.map((paneId) => {
      const node = workspace.nodes[paneId];
      const activeContextId = node?.kind === 'pane' ? node.contexts[0] ?? null : null;
      return [paneId, { activeContextId, preview: null }];
    })),
  };
};

export const composeWorkspacePresentation = (
  workspace: WorkspaceState,
  inputViewState: WorkspaceViewState,
): WorkspacePresentation => {
  const viewState = reconcileWorkspaceViewState(workspace, inputViewState);
  const contexts: Record<string, WorkspaceContext> = { ...workspace.contexts };
  const nodes = Object.fromEntries(Object.entries(workspace.nodes).map(([nodeId, node]) => {
    if (node.kind === 'split') return [nodeId, node];
    const paneViewState = viewState.panes[nodeId]!;
    const preview = paneViewState.preview;
    const previewContext = preview !== null && contexts[preview.contextId] === undefined
      ? preview.contextId
      : null;
    if (previewContext !== null && preview !== null) contexts[previewContext] = { url: preview.url };
    const paneContexts = previewContext === null ? node.contexts : [...node.contexts, previewContext];
    const activeContext = paneViewState.activeContextId !== null
      && paneContexts.includes(paneViewState.activeContextId)
      ? paneViewState.activeContextId
      : previewContext ?? paneContexts[0] ?? null;
    return [nodeId, {
      kind: 'pane' as const,
      activeContext,
      contexts: paneContexts,
      previewContext,
    }];
  }));
  return {
    activePaneId: viewState.activePaneId,
    contexts,
    nodes,
    rootNodeId: workspace.rootNodeId,
  };
};

export const reconcileWorkspaceViewState = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
): WorkspaceViewState => {
  const paneIds = paneIdsInLayoutOrder(workspace);
  const reconciledPanes = paneIds.map((paneId) => {
    const pane = workspace.nodes[paneId];
    const current = viewState.panes[paneId];
    const durableContexts = pane?.kind === 'pane' ? pane.contexts : [];
    const available = current?.preview === null || current?.preview === undefined
      ? durableContexts
      : [...durableContexts, current.preview.contextId];
    const activeContextId = current?.activeContextId !== null
      && current?.activeContextId !== undefined
      && available.includes(current.activeContextId)
      ? current.activeContextId
      : current?.preview?.contextId ?? durableContexts[0] ?? null;
    const next = { activeContextId, preview: current?.preview ?? null };
    return { current, next, paneId };
  });
  const panes = Object.fromEntries(reconciledPanes.map(({ next, paneId }) => [paneId, next]));
  const activePaneId = viewState.activePaneId !== null && paneIds.includes(viewState.activePaneId)
    ? viewState.activePaneId
    : paneIds[0] ?? null;
  const changed = activePaneId !== viewState.activePaneId
    || Object.keys(viewState.panes).length !== paneIds.length
    || reconciledPanes.some(({ current, next }) => current === undefined
      || current.activeContextId !== next.activeContextId
      || current.preview !== next.preview);
  return changed ? { activePaneId, panes } : viewState;
};

export const selectWorkspaceContext = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
  contextId: string,
  target: boolean,
): WorkspaceViewState => updatePaneViewState(workspace, viewState, paneId, (pane) =>
  pane.activeContextId === contextId ? pane : { ...pane, activeContextId: contextId }, target);

export const previewWorkspaceContext = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
  preview: WorkspacePreview,
): WorkspaceViewState => updatePaneViewState(workspace, viewState, paneId, (pane) =>
  pane.activeContextId === preview.contextId
    && pane.preview?.contextId === preview.contextId
    && pane.preview.url === preview.url
    ? pane
    : { activeContextId: preview.contextId, preview }, true);

export const clearWorkspacePreview = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
): WorkspaceViewState => updatePaneViewState(workspace, viewState, paneId, (pane) => pane.preview === null
  ? pane
  : {
      activeContextId: pane.preview.contextId === pane.activeContextId ? null : pane.activeContextId,
      preview: null,
    }, false);

const updatePaneViewState = (
  workspace: WorkspaceState,
  inputViewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
  update: (pane: WorkspacePaneViewState) => WorkspacePaneViewState,
  target: boolean,
) => {
  const viewState = reconcileWorkspaceViewState(workspace, inputViewState);
  const pane = viewState.panes[paneId];
  if (pane === undefined) return viewState;
  const nextPane = update(pane);
  const next = nextPane === pane && (!target || viewState.activePaneId === paneId)
    ? viewState
    : {
        activePaneId: target ? paneId : viewState.activePaneId,
        panes: { ...viewState.panes, [paneId]: nextPane },
      };
  return reconcileWorkspaceViewState(workspace, next);
};
