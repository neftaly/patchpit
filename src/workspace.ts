export type WorkspacePaneId = string;
export type WorkspaceSplitEdge = 'left' | 'right' | 'top' | 'bottom';

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
  readonly nodes: Readonly<Record<string, WorkspaceNode>>;
  readonly rootNodeId: string;
};

export const createWorkspace = (initialContext: string, documentContext?: string): WorkspaceState => documentContext === undefined
  ? {
      nodes: {
        left: { kind: 'pane', activeContext: initialContext, contexts: [initialContext], previewContext: null },
      },
      rootNodeId: 'left',
    }
  : {
      nodes: {
        left: { kind: 'pane', activeContext: initialContext, contexts: [initialContext], previewContext: null },
        right: { kind: 'pane', activeContext: documentContext, contexts: [documentContext], previewContext: null },
        'split-0': { kind: 'split', axis: 'horizontal', first: 'left', ratio: 0.2, second: 'right' },
      },
      rootNodeId: 'split-0',
    };

export const activateContext = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  contextId: string,
): WorkspaceState => {
  const pane = paneAt(workspace, paneId);
  if (pane === undefined || !pane.contexts.includes(contextId)) return workspace;
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
  return removeEmptyPane(updatePane(workspace, paneId, removeContextFromPane(pane, contextId)), paneId);
};

export const previewContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
): WorkspaceState => {
  const existingPaneId = paneContaining(workspace, contextId);
  if (existingPaneId !== undefined) return activateContext(workspace, existingPaneId, contextId);

  const targetPane = paneAt(workspace, targetPaneId);
  if (targetPane === undefined) return addPreviewPane(workspace, targetPaneId, contextId);
  const nextTarget = targetPane.previewContext === null
    ? targetPane
    : removeContextFromPane(targetPane, targetPane.previewContext);
  return updatePane(workspace, targetPaneId, {
    kind: 'pane',
    activeContext: contextId,
    contexts: [...nextTarget.contexts, contextId],
    previewContext: contextId,
  });
};

export const openContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
): WorkspaceState => {
  const previewed = previewContext(workspace, contextId, targetPaneId);
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
  if (contextId === beforeContext) return pinContext(workspace, sourcePaneId, contextId);

  const source = removeContextFromPane(sourcePane, contextId);
  const targetWithoutContext = sourcePaneId === targetPaneId ? source : target;
  const contexts = [...targetWithoutContext.contexts];
  const targetIndex = beforeContext === undefined ? -1 : contexts.indexOf(beforeContext);
  contexts.splice(targetIndex < 0 ? contexts.length : targetIndex, 0, contextId);
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
): WorkspaceState => {
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

  const suffix = nextNodeSuffix(workspace);
  const newPaneId = `pane-${suffix}`;
  const splitNodeId = `split-${suffix}`;
  const targetFirst = edge === 'right' || edge === 'bottom';
  const replaced = replaceNodeReference(withoutSource, targetPaneId, splitNodeId);
  return {
    ...replaced,
    nodes: {
      ...replaced.nodes,
      [newPaneId]: { kind: 'pane', activeContext: contextId, contexts: [contextId], previewContext: null },
      [splitNodeId]: {
        kind: 'split',
        axis: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
        first: targetFirst ? targetPaneId : newPaneId,
        ratio: 0.5,
        second: targetFirst ? newPaneId : targetPaneId,
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
  const contexts = pane.contexts.filter((candidate) => candidate !== contextId);
  return {
    kind: 'pane',
    activeContext: pane.activeContext === contextId ? contexts.at(-1) ?? pane.activeContext : pane.activeContext,
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
  contextId: string,
): WorkspaceState => {
  if (workspace.nodes[paneId] !== undefined) return workspace;
  const splitNodeId = `split-${nextNodeSuffix(workspace)}`;
  return {
    ...workspace,
    nodes: {
      ...workspace.nodes,
      [paneId]: { kind: 'pane', activeContext: contextId, contexts: [contextId], previewContext: contextId },
      [splitNodeId]: {
        kind: 'split',
        axis: 'horizontal',
        first: workspace.rootNodeId,
        ratio: 0.5,
        second: paneId,
      },
    },
    rootNodeId: splitNodeId,
  };
};

const nextNodeSuffix = (workspace: WorkspaceState) => Math.max(-1, ...Object.keys(workspace.nodes)
  .map((nodeId) => /^(?:pane|split)-(\d+)$/.exec(nodeId)?.[1])
  .map((suffix) => suffix === undefined ? -1 : Number(suffix))) + 1;

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
