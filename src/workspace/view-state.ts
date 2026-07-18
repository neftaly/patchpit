import {
  paneContaining,
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
  readonly selectedContextId: string | null;
  readonly preview: WorkspacePreview | null;
};

export type WorkspaceViewState = {
  readonly panes: Readonly<Record<WorkspacePaneId, WorkspacePaneViewState>>;
  readonly recentContextIds: readonly string[];
};

export type WorkspacePresentationPane = {
  readonly kind: 'pane';
  readonly selectedContext: string | null;
  readonly contexts: readonly string[];
  readonly previewContext: string | null;
};

export type WorkspacePresentation = {
  readonly activeEditorContextId: string | null;
  readonly contexts: Readonly<Record<string, WorkspaceContext>>;
  readonly nodes: Readonly<Record<string, WorkspacePresentationPane | Exclude<WorkspaceNode, { readonly kind: 'pane' }>>>;
  readonly rootNodeId: string;
};

export type ActiveWorkspaceEditor = {
  readonly contextId: string;
  readonly paneId: WorkspacePaneId;
};

export type MountedWorkspaceContext = ActiveWorkspaceEditor & {
  readonly kind: 'durable' | 'preview';
  readonly url: string;
};

export type WorkspaceAction = {
  readonly kind: 'workspace.context.select';
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
  recentContextIds: readonly string[] = [],
): WorkspaceViewState => {
  const paneIds = paneIdsInLayoutOrder(workspace);
  return {
    panes: Object.fromEntries(paneIds.map((paneId) => {
      const node = workspace.nodes[paneId];
      const selectedContextId = node?.kind === 'pane' ? node.contexts[0] ?? null : null;
      return [paneId, { selectedContextId, preview: null }];
    })),
    recentContextIds,
  };
};

export const composeWorkspacePresentation = (
  workspace: WorkspaceState,
  inputViewState: WorkspaceViewState,
  isEditorContext: (url: string) => boolean,
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
    const selectedContext = paneViewState.selectedContextId !== null
      && paneContexts.includes(paneViewState.selectedContextId)
      ? paneViewState.selectedContextId
      : previewContext ?? paneContexts[0] ?? null;
    return [nodeId, {
      kind: 'pane' as const,
      selectedContext,
      contexts: paneContexts,
      previewContext,
    }];
  }));
  return {
    activeEditorContextId: activeWorkspaceEditor(workspace, viewState, isEditorContext)?.contextId ?? null,
    contexts,
    nodes,
    rootNodeId: workspace.rootNodeId,
  };
};

export const activeWorkspaceEditor = (
  workspace: WorkspaceState,
  inputViewState: WorkspaceViewState,
  isEditorContext: (url: string) => boolean,
): ActiveWorkspaceEditor | undefined => {
  const editor = mountedWorkspaceContexts(workspace, inputViewState)
    .find(({ url }) => isEditorContext(url));
  return editor === undefined ? undefined : { contextId: editor.contextId, paneId: editor.paneId };
};

export const workspaceContextForUrl = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  url: string,
): MountedWorkspaceContext | undefined => mountedWorkspaceContexts(workspace, viewState)
  .find((candidate) => candidate.url === url);

export const workspaceContextPaneId = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  contextId: string,
) => paneContaining(workspace, contextId)
  ?? Object.entries(viewState.panes).find(([, pane]) => pane.preview?.contextId === contextId)?.[0];

export const workspaceContextUrl = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
  contextId: string,
) => workspace.contexts[contextId]?.url
  ?? (viewState.panes[paneId]?.preview?.contextId === contextId
    ? viewState.panes[paneId]?.preview?.url
    : undefined);

export const reconcileWorkspaceViewState = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
): WorkspaceViewState => {
  const paneIds = paneIdsInLayoutOrder(workspace);
  const claimedContextIds = new Set(Object.keys(workspace.contexts));
  const reconciledPanes = paneIds.map((paneId) => {
    const pane = workspace.nodes[paneId];
    const current = viewState.panes[paneId];
    const durableContexts = pane?.kind === 'pane' ? pane.contexts : [];
    const preview = current?.preview !== null && current?.preview !== undefined
      && !claimedContextIds.has(current.preview.contextId)
      ? current.preview
      : null;
    if (preview !== null) claimedContextIds.add(preview.contextId);
    const available = preview === null
      ? durableContexts
      : [...durableContexts, preview.contextId];
    const selectedContextId = current?.selectedContextId !== null
      && current?.selectedContextId !== undefined
      && available.includes(current.selectedContextId)
      ? current.selectedContextId
      : preview?.contextId ?? durableContexts[0] ?? null;
    const next = { selectedContextId, preview };
    return { current, next, paneId };
  });
  const panes = Object.fromEntries(reconciledPanes.map(({ next, paneId }) => [paneId, next]));
  const availableContextIds = new Set([
    ...reconciledPanes.flatMap(({ next }) => next.preview === null ? [] : [next.preview.contextId]),
    ...paneIds.flatMap((paneId) => {
      const pane = workspace.nodes[paneId];
      return pane?.kind === 'pane' ? pane.contexts : [];
    }),
  ]);
  const recentContextIds = viewState.recentContextIds.filter((contextId, index, contextIds) =>
    availableContextIds.has(contextId) && contextIds.indexOf(contextId) === index);
  const changed = !sameStrings(recentContextIds, viewState.recentContextIds)
    || Object.keys(viewState.panes).length !== paneIds.length
    || reconciledPanes.some(({ current, next }) => current === undefined
      || current.selectedContextId !== next.selectedContextId
      || current.preview !== next.preview);
  return changed ? { panes, recentContextIds } : viewState;
};

export const selectWorkspaceContext = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
  contextId: string,
): WorkspaceViewState => updatePaneViewState(workspace, viewState, paneId, (pane) =>
  pane.selectedContextId === contextId ? pane : { ...pane, selectedContextId: contextId }, contextId);

export const previewWorkspaceContext = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
  preview: WorkspacePreview,
): WorkspaceViewState => updatePaneViewState(workspace, viewState, paneId, (pane) =>
  pane.selectedContextId === preview.contextId
    && pane.preview?.contextId === preview.contextId
    && pane.preview.url === preview.url
    ? pane
    : { selectedContextId: preview.contextId, preview }, preview.contextId);

export const clearWorkspacePreview = (
  workspace: WorkspaceState,
  viewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
): WorkspaceViewState => updatePaneViewState(workspace, viewState, paneId, (pane) => pane.preview === null
  ? pane
    : {
      selectedContextId: pane.preview.contextId === pane.selectedContextId ? null : pane.selectedContextId,
      preview: null,
    }, undefined);

const updatePaneViewState = (
  workspace: WorkspaceState,
  inputViewState: WorkspaceViewState,
  paneId: WorkspacePaneId,
  update: (pane: WorkspacePaneViewState) => WorkspacePaneViewState,
  interactedContextId: string | undefined,
) => {
  const viewState = reconcileWorkspaceViewState(workspace, inputViewState);
  const pane = viewState.panes[paneId];
  if (pane === undefined) return viewState;
  const nextPane = update(pane);
  const recentContextIds = interactedContextId === undefined
    ? viewState.recentContextIds
    : [
        interactedContextId,
        ...viewState.recentContextIds.filter((contextId) => contextId !== interactedContextId),
      ];
  const next = nextPane === pane && recentContextIds === viewState.recentContextIds
    ? viewState
    : {
        panes: { ...viewState.panes, [paneId]: nextPane },
        recentContextIds,
      };
  return reconcileWorkspaceViewState(workspace, next);
};

const mountedWorkspaceContexts = (
  workspace: WorkspaceState,
  inputViewState: WorkspaceViewState,
): readonly MountedWorkspaceContext[] => {
  const viewState = reconcileWorkspaceViewState(workspace, inputViewState);
  const panes = paneIdsInLayoutOrder(workspace).flatMap((paneId) => {
    const pane = workspace.nodes[paneId];
    const paneViewState = viewState.panes[paneId];
    if (pane?.kind !== 'pane' || paneViewState === undefined) return [];
    return [{
      contextIds: paneViewState.preview === null
        ? pane.contexts
        : [...pane.contexts, paneViewState.preview.contextId],
      paneId,
      selectedContextId: paneViewState.selectedContextId,
    }];
  });
  const contextIds = new Set([
    ...viewState.recentContextIds,
    ...panes.flatMap(({ selectedContextId }) => selectedContextId === null ? [] : [selectedContextId]),
    ...panes.flatMap(({ contextIds: paneContextIds }) => paneContextIds),
  ]);
  return [...contextIds].flatMap((contextId) => {
    const paneId = workspaceContextPaneId(workspace, viewState, contextId);
    const url = paneId === undefined
      ? undefined
      : workspaceContextUrl(workspace, viewState, paneId, contextId);
    return paneId === undefined || url === undefined
      ? []
      : [{
          contextId,
          kind: workspace.contexts[contextId] === undefined ? 'preview' as const : 'durable' as const,
          paneId,
          url,
        }];
  });
};

const sameStrings = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
