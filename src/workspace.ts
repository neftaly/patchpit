export type WorkspacePaneId = string;
export type WorkspaceSplitEdge = 'left' | 'right' | 'top' | 'bottom';

export type WorkspaceContext = {
  readonly url: string;
};

export type WorkspaceSplitIds = {
  readonly paneId: WorkspacePaneId;
  readonly splitId: string;
};

export type WorkspacePane = {
  readonly kind: 'pane';
  readonly activeContext: string;
  readonly contexts: readonly string[];
  readonly previewContext: string | null;
};

export type WorkspaceNode = WorkspacePane | {
  readonly kind: 'split';
  readonly axis: 'horizontal' | 'vertical';
  readonly first: string;
  readonly ratio: number;
  readonly second: string;
};

export type WorkspaceState = {
  readonly contexts: Readonly<Record<string, WorkspaceContext>>;
  readonly nodes: Readonly<Record<string, WorkspaceNode>>;
  readonly rootNodeId: string;
};

export type WorkspaceOperation = {
  readonly kind: 'workspace.context.activate';
  readonly paneId: WorkspacePaneId;
  readonly contextId: string;
} | {
  readonly kind: 'workspace.context.close';
  readonly paneId: WorkspacePaneId;
  readonly contextId: string;
} | {
  readonly kind: 'workspace.context.open';
  readonly contextId: string;
  readonly url: string;
  readonly targetPaneId: WorkspacePaneId;
  readonly missingSplitId: string;
  readonly mode: 'open' | 'preview';
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

export const applyWorkspaceOperation = (
  workspace: WorkspaceState,
  operation: WorkspaceOperation,
): WorkspaceState => {
  switch (operation.kind) {
    case 'workspace.context.activate':
      return activateContext(workspace, operation.paneId, operation.contextId);
    case 'workspace.context.close':
      return closeContext(workspace, operation.paneId, operation.contextId);
    case 'workspace.context.open': {
      const registered = addContext(workspace, operation.contextId, operation.url);
      return (operation.mode === 'open' ? openContext : previewContext)(
        registered,
        operation.contextId,
        operation.targetPaneId,
        operation.missingSplitId,
      );
    }
    case 'workspace.context.move': {
      const registered = operation.url === null
        ? workspace
        : addContext(workspace, operation.contextId, operation.url);
      const prepared = operation.pin
        ? openContext(registered, operation.contextId, operation.targetPaneId)
        : registered;
      const moved = moveContext(
        prepared,
        operation.contextId,
        operation.targetPaneId,
        operation.beforeContext ?? undefined,
      );
      return moved === registered && registered !== workspace ? workspace : moved;
    }
    case 'workspace.context.split': {
      const registered = operation.url === null
        ? workspace
        : addContext(workspace, operation.contextId, operation.url);
      const split = splitContext(
        registered,
        operation.contextId,
        operation.targetPaneId,
        operation.edge,
        operation.ids,
      );
      return split === registered && registered !== workspace ? workspace : split;
    }
    case 'workspace.split.resize':
      return resizeSplit(workspace, operation.splitId, operation.ratio);
  }
};

export const createWorkspace = (initialContext: string, documentContext?: string): WorkspaceState => documentContext === undefined
  ? {
      contexts: { 'context-0': { url: initialContext } },
      nodes: {
        left: { kind: 'pane', activeContext: 'context-0', contexts: ['context-0'], previewContext: null },
      },
      rootNodeId: 'left',
    }
  : {
      contexts: {
        'context-0': { url: initialContext },
        'context-1': { url: documentContext },
      },
      nodes: {
        left: { kind: 'pane', activeContext: 'context-0', contexts: ['context-0'], previewContext: null },
        right: { kind: 'pane', activeContext: 'context-1', contexts: ['context-1'], previewContext: null },
        'split-0': { kind: 'split', axis: 'horizontal', first: 'left', ratio: 0.2, second: 'right' },
      },
      rootNodeId: 'split-0',
    };

export const addContext = (
  workspace: WorkspaceState,
  contextId: string,
  url: string,
): WorkspaceState => workspace.contexts[contextId] === undefined
  ? { ...workspace, contexts: { ...workspace.contexts, [contextId]: { url } } }
  : workspace;

export const contextIdForUrl = (
  workspace: WorkspaceState,
  url: string,
  paneId: WorkspacePaneId,
): string | undefined => paneAt(workspace, paneId)?.contexts
  .find((contextId) => workspace.contexts[contextId]?.url === url);

export const paneIdsInLayoutOrder = (workspace: WorkspaceState): readonly WorkspacePaneId[] => {
  const paneIds: WorkspacePaneId[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = workspace.nodes[nodeId];
    if (node?.kind === 'pane') {
      paneIds.push(nodeId);
      return;
    }
    if (node?.kind === 'split') {
      visit(node.first);
      visit(node.second);
    }
  };
  visit(workspace.rootNodeId);
  return paneIds;
};

export const activateContext = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  contextId: string,
): WorkspaceState => {
  const pane = paneAt(workspace, paneId);
  if (pane === undefined || pane.activeContext === contextId || !pane.contexts.includes(contextId)) return workspace;
  return updatePane(workspace, paneId, { ...pane, activeContext: contextId });
};

export const closeContext = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  contextId: string,
): WorkspaceState => {
  const pane = paneAt(workspace, paneId);
  if (pane === undefined || !pane.contexts.includes(contextId)) return workspace;
  if (pane.contexts.length === 1 && workspace.rootNodeId === paneId) return workspace;
  return pruneContexts(removeEmptyPane(updatePane(workspace, paneId, removeContextFromPane(pane, contextId)), paneId));
};

export const previewContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
  missingSplitId?: string,
): WorkspaceState => {
  if (workspace.contexts[contextId] === undefined) return workspace;
  const existingPaneId = paneContaining(workspace, contextId);
  if (existingPaneId !== undefined) return activateContext(workspace, existingPaneId, contextId);

  const targetPane = paneAt(workspace, targetPaneId);
  if (targetPane === undefined) return missingSplitId === undefined
    ? workspace
    : addPreviewPane(workspace, targetPaneId, missingSplitId, contextId);
  const nextTarget = targetPane.previewContext === null
    ? targetPane
    : removeContextFromPane(targetPane, targetPane.previewContext);
  return pruneContexts(updatePane(workspace, targetPaneId, {
    kind: 'pane',
    activeContext: contextId,
    contexts: [...nextTarget.contexts, contextId],
    previewContext: contextId,
  }));
};

export const openContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
  missingSplitId?: string,
): WorkspaceState => {
  const previewed = previewContext(workspace, contextId, targetPaneId, missingSplitId);
  const paneId = paneContaining(previewed, contextId);
  return paneId === undefined ? previewed : pinContext(previewed, paneId, contextId);
};

export const moveContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
  beforeContext?: string,
): WorkspaceState => {
  const sourcePaneId = paneContaining(workspace, contextId);
  const sourcePane = sourcePaneId === undefined ? undefined : paneAt(workspace, sourcePaneId);
  const target = paneAt(workspace, targetPaneId);
  if (sourcePaneId === undefined || sourcePane === undefined || target === undefined) return workspace;
  if (contextId === beforeContext) return workspace;

  const source = removeContextFromPane(sourcePane, contextId);
  const targetWithoutContext = sourcePaneId === targetPaneId ? source : target;
  const contexts = [...targetWithoutContext.contexts];
  const targetIndex = beforeContext === undefined ? -1 : contexts.indexOf(beforeContext);
  contexts.splice(targetIndex < 0 ? contexts.length : targetIndex, 0, contextId);
  if (sourcePaneId === targetPaneId && contexts.every((context, index) => sourcePane.contexts[index] === context)) {
    return workspace;
  }
  const moved = {
    ...workspace,
    nodes: {
      ...workspace.nodes,
      [sourcePaneId]: source,
      [targetPaneId]: { ...targetWithoutContext, activeContext: contextId, contexts, kind: 'pane' as const },
    },
  };
  return sourcePaneId === targetPaneId ? moved : removeEmptyPane(moved, sourcePaneId);
};

export const splitContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
  edge: WorkspaceSplitEdge,
  ids: WorkspaceSplitIds,
): WorkspaceState => {
  if (workspace.contexts[contextId] === undefined
    || workspace.nodes[ids.paneId] !== undefined
    || workspace.nodes[ids.splitId] !== undefined) return workspace;
  const sourcePaneId = paneContaining(workspace, contextId);
  const sourcePane = sourcePaneId === undefined ? undefined : paneAt(workspace, sourcePaneId);
  if (paneAt(workspace, targetPaneId) === undefined || (sourcePaneId !== undefined && sourcePane === undefined)) {
    return workspace;
  }
  if (sourcePaneId === targetPaneId && sourcePane?.contexts.length === 1) return workspace;

  let withoutSource = workspace;
  if (sourcePaneId !== undefined && sourcePane !== undefined) {
    withoutSource = updatePane(workspace, sourcePaneId, removeContextFromPane(sourcePane, contextId));
    if (sourcePaneId !== targetPaneId) withoutSource = removeEmptyPane(withoutSource, sourcePaneId);
  }

  const targetFirst = edge === 'right' || edge === 'bottom';
  const replaced = replaceNodeReference(withoutSource, targetPaneId, ids.splitId);
  return {
    ...replaced,
    nodes: {
      ...replaced.nodes,
      [ids.paneId]: { kind: 'pane', activeContext: contextId, contexts: [contextId], previewContext: null },
      [ids.splitId]: {
        kind: 'split',
        axis: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
        first: targetFirst ? targetPaneId : ids.paneId,
        ratio: 0.5,
        second: targetFirst ? ids.paneId : targetPaneId,
      },
    },
  };
};

const pinContext = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  contextId: string,
): WorkspaceState => {
  const pane = paneAt(workspace, paneId);
  if (pane?.previewContext !== contextId) return workspace;
  return updatePane(workspace, paneId, { ...pane, previewContext: null });
};

const paneContaining = (
  workspace: WorkspaceState,
  contextId: string,
): WorkspacePaneId | undefined => Object.entries(workspace.nodes)
  .find(([, node]) => node.kind === 'pane' && node.contexts.includes(contextId))?.[0];

const paneAt = (workspace: WorkspaceState, paneId: WorkspacePaneId) => {
  const node = workspace.nodes[paneId];
  return node?.kind === 'pane' ? node : undefined;
};

const removeContextFromPane = (
  pane: WorkspacePane,
  contextId: string,
): WorkspacePane => {
  const removedIndex = pane.contexts.indexOf(contextId);
  const contexts = pane.contexts.filter((candidate) => candidate !== contextId);
  return {
    kind: 'pane',
    activeContext: pane.activeContext === contextId
      ? contexts[removedIndex] ?? contexts[removedIndex - 1] ?? pane.activeContext
      : pane.activeContext,
    contexts,
    previewContext: pane.previewContext === contextId ? null : pane.previewContext,
  };
};

const updatePane = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  pane: WorkspacePane,
): WorkspaceState => ({ ...workspace, nodes: { ...workspace.nodes, [paneId]: pane } });

const addPreviewPane = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  splitId: string,
  contextId: string,
): WorkspaceState => {
  if (workspace.nodes[paneId] !== undefined || workspace.nodes[splitId] !== undefined) return workspace;
  return {
    ...workspace,
    nodes: {
      ...workspace.nodes,
      [paneId]: { kind: 'pane', activeContext: contextId, contexts: [contextId], previewContext: contextId },
      [splitId]: {
        kind: 'split',
        axis: 'horizontal',
        first: workspace.rootNodeId,
        ratio: 0.5,
        second: paneId,
      },
    },
    rootNodeId: splitId,
  };
};

const pruneContexts = (workspace: WorkspaceState): WorkspaceState => {
  const mounted = new Set(Object.values(workspace.nodes)
    .flatMap((node) => node.kind === 'pane' ? node.contexts : []));
  const contexts = Object.fromEntries(Object.entries(workspace.contexts)
    .filter(([contextId]) => mounted.has(contextId)));
  return Object.keys(contexts).length === Object.keys(workspace.contexts).length
    ? workspace
    : { ...workspace, contexts };
};

export const resizeSplit = (
  workspace: WorkspaceState,
  nodeId: string,
  ratio: number,
): WorkspaceState => {
  const node = workspace.nodes[nodeId];
  if (node?.kind !== 'split' || !Number.isFinite(ratio)) return workspace;
  const constrained = Math.min(0.9, Math.max(0.1, ratio));
  if (node.ratio === constrained) return workspace;
  return { ...workspace, nodes: { ...workspace.nodes, [nodeId]: { ...node, ratio: constrained } } };
};

const removeEmptyPane = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
): WorkspaceState => {
  if (paneAt(workspace, paneId)?.contexts.length !== 0) return workspace;
  const parent = parentNode(workspace, paneId);
  if (parent === undefined) return workspace;
  const siblingId = parent.node.first === paneId ? parent.node.second : parent.node.first;
  const collapsed = replaceNodeReference(workspace, parent.id, siblingId);
  const nodes = { ...collapsed.nodes };
  delete nodes[parent.id];
  delete nodes[paneId];
  return { ...collapsed, nodes };
};

const replaceNodeReference = (
  workspace: WorkspaceState,
  nodeId: string,
  replacementId: string,
): WorkspaceState => {
  if (workspace.rootNodeId === nodeId) return { ...workspace, rootNodeId: replacementId };
  const parent = parentNode(workspace, nodeId);
  if (parent === undefined) return workspace;
  return {
    ...workspace,
    nodes: {
      ...workspace.nodes,
      [parent.id]: {
        ...parent.node,
        [parent.node.first === nodeId ? 'first' : 'second']: replacementId,
      },
    },
  };
};

const parentNode = (
  workspace: WorkspaceState,
  nodeId: string,
): { readonly id: string; readonly node: Extract<WorkspaceNode, { readonly kind: 'split' }> } | undefined => {
  for (const [id, node] of Object.entries(workspace.nodes)) {
    if (node.kind === 'split' && (node.first === nodeId || node.second === nodeId)) return { id, node };
  }
  return undefined;
};
