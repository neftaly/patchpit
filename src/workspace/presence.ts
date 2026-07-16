import {
  paneIdsInLayoutOrder,
  type WorkspaceContext,
  type WorkspaceNode,
  type WorkspacePaneId,
  type WorkspaceSplitEdge,
  type WorkspaceSplitIds,
  type WorkspaceState,
} from './model.ts';

type WorkspacePreview = WorkspaceContext & {
  readonly contextId: string;
};

export type WorkspacePanePresence = {
  readonly activeContextId: string | null;
  readonly preview: WorkspacePreview | null;
};

export type WorkspacePresence = {
  readonly activePaneId: WorkspacePaneId | null;
  readonly panes: Readonly<Record<WorkspacePaneId, WorkspacePanePresence>>;
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
  readonly pin: boolean;
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

export const createWorkspacePresence = (
  workspace: WorkspaceState,
  activePaneId: WorkspacePaneId | null = null,
): WorkspacePresence => {
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
  inputPresence: WorkspacePresence,
): WorkspacePresentation => {
  const presence = reconcileWorkspacePresence(workspace, inputPresence);
  const contexts: Record<string, WorkspaceContext> = { ...workspace.contexts };
  const nodes = Object.fromEntries(Object.entries(workspace.nodes).map(([nodeId, node]) => {
    if (node.kind === 'split') return [nodeId, node];
    const panePresence = presence.panes[nodeId]!;
    const preview = panePresence.preview;
    const previewContext = preview !== null && contexts[preview.contextId] === undefined
      ? preview.contextId
      : null;
    if (previewContext !== null && preview !== null) contexts[previewContext] = { url: preview.url };
    const paneContexts = previewContext === null ? node.contexts : [...node.contexts, previewContext];
    const activeContext = panePresence.activeContextId !== null
      && paneContexts.includes(panePresence.activeContextId)
      ? panePresence.activeContextId
      : previewContext ?? paneContexts[0] ?? null;
    return [nodeId, {
      kind: 'pane' as const,
      activeContext,
      contexts: paneContexts,
      previewContext,
    }];
  }));
  return {
    activePaneId: presence.activePaneId,
    contexts,
    nodes,
    rootNodeId: workspace.rootNodeId,
  };
};

export const reconcileWorkspacePresence = (
  workspace: WorkspaceState,
  presence: WorkspacePresence,
): WorkspacePresence => {
  const paneIds = paneIdsInLayoutOrder(workspace);
  let changed = presence.activePaneId !== null && !paneIds.includes(presence.activePaneId);
  const panes = Object.fromEntries(paneIds.map((paneId) => {
    const pane = workspace.nodes[paneId];
    const current = presence.panes[paneId];
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
    if (current === undefined
      || current.activeContextId !== next.activeContextId
      || current.preview !== next.preview) changed = true;
    return [paneId, next];
  }));
  if (Object.keys(presence.panes).length !== paneIds.length) changed = true;
  const activePaneId = presence.activePaneId !== null && paneIds.includes(presence.activePaneId)
    ? presence.activePaneId
    : paneIds[0] ?? null;
  return changed ? { activePaneId, panes } : presence;
};

export const selectWorkspaceContext = (
  workspace: WorkspaceState,
  presence: WorkspacePresence,
  paneId: WorkspacePaneId,
  contextId: string,
  target: boolean,
): WorkspacePresence => updatePanePresence(workspace, presence, paneId, (pane) => ({
  activeContextId: contextId,
  preview: pane.preview,
}), target);

export const previewWorkspaceContext = (
  workspace: WorkspaceState,
  presence: WorkspacePresence,
  paneId: WorkspacePaneId,
  preview: WorkspacePreview,
): WorkspacePresence => updatePanePresence(workspace, presence, paneId, () => ({
  activeContextId: preview.contextId,
  preview,
}), true);

export const clearWorkspacePreview = (
  workspace: WorkspaceState,
  presence: WorkspacePresence,
  paneId: WorkspacePaneId,
): WorkspacePresence => updatePanePresence(workspace, presence, paneId, (pane) => ({
  activeContextId: pane.preview?.contextId === pane.activeContextId ? null : pane.activeContextId,
  preview: null,
}), false);

const updatePanePresence = (
  workspace: WorkspaceState,
  inputPresence: WorkspacePresence,
  paneId: WorkspacePaneId,
  update: (pane: WorkspacePanePresence) => WorkspacePanePresence,
  target: boolean,
) => {
  const presence = reconcileWorkspacePresence(workspace, inputPresence);
  const pane = presence.panes[paneId];
  if (pane === undefined) return presence;
  const nextPane = update(pane);
  const next = nextPane === pane && (!target || presence.activePaneId === paneId)
    ? presence
    : {
        activePaneId: target ? paneId : presence.activePaneId,
        panes: { ...presence.panes, [paneId]: nextPane },
      };
  return reconcileWorkspacePresence(workspace, next);
};
