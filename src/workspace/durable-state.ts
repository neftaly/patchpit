import { workspaceSplitRatioBounds } from '@patchpit/artifacts';

export type WorkspacePaneId = string;
export type WorkspaceSplitEdge = 'left' | 'right' | 'top' | 'bottom';

const INITIAL_SPLIT_RATIO = 0.2;
const NEW_SPLIT_RATIO = 0.5;
export const MIN_SPLIT_RATIO = workspaceSplitRatioBounds.minimum;
export const MAX_SPLIT_RATIO = workspaceSplitRatioBounds.maximum;

export type WorkspaceContext = {
  readonly url: string;
};

export type WorkspaceSplitIds = {
  readonly paneId: WorkspacePaneId;
  readonly splitId: string;
};

export type WorkspacePane = {
  readonly kind: 'pane';
  readonly contexts: readonly string[];
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
  readonly kind: 'workspace.context.close';
  readonly contextId: string;
} | {
  readonly kind: 'workspace.context.pin';
  readonly contextId: string;
  readonly url: string;
  readonly targetPaneId: WorkspacePaneId;
  readonly beforeContext: string | null;
} | {
  readonly kind: 'workspace.context.move';
  readonly contextId: string;
  readonly targetPaneId: WorkspacePaneId;
  readonly beforeContext: string | null;
} | {
  readonly kind: 'workspace.context.split';
  readonly contextId: string;
  readonly targetPaneId: WorkspacePaneId;
  readonly edge: WorkspaceSplitEdge;
  readonly ids: WorkspaceSplitIds;
} | {
  readonly kind: 'workspace.context.pin-split';
  readonly contextId: string;
  readonly url: string;
  readonly targetPaneId: WorkspacePaneId;
  readonly edge: WorkspaceSplitEdge;
  readonly ids: WorkspaceSplitIds;
} | {
  readonly kind: 'workspace.pane.close';
  readonly paneId: WorkspacePaneId;
} | {
  readonly kind: 'workspace.pane.split';
  readonly targetPaneId: WorkspacePaneId;
  readonly edge: WorkspaceSplitEdge;
  readonly ids: WorkspaceSplitIds;
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
    case 'workspace.context.close':
      return closeContext(workspace, operation.contextId);
    case 'workspace.context.pin':
      return pinContext(
        workspace,
        operation.contextId,
        operation.url,
        operation.targetPaneId,
        operation.beforeContext ?? undefined,
      );
    case 'workspace.context.move':
      return moveContext(
        workspace,
        operation.contextId,
        operation.targetPaneId,
        operation.beforeContext ?? undefined,
      );
    case 'workspace.context.split':
      return splitContext(workspace, operation.contextId, operation.targetPaneId, operation.edge, operation.ids);
    case 'workspace.context.pin-split': {
      const pinned = registerContext(workspace, operation.contextId, operation.url);
      if (pinned === workspace && workspace.contexts[operation.contextId] !== undefined) return workspace;
      const split = insertSplitPane(
        pinned,
        operation.targetPaneId,
        operation.edge,
        operation.ids,
        [operation.contextId],
      );
      return split === pinned ? workspace : split;
    }
    case 'workspace.pane.close':
      return closePane(workspace, operation.paneId);
    case 'workspace.pane.split':
      return insertSplitPane(workspace, operation.targetPaneId, operation.edge, operation.ids, []);
    case 'workspace.split.resize':
      return resizeSplit(workspace, operation.splitId, operation.ratio);
  }
};

export const createWorkspace = (initialContext: string, documentContext?: string): WorkspaceState =>
  documentContext === undefined
    ? {
        contexts: { 'context-0': { url: initialContext } },
        nodes: { left: { kind: 'pane', contexts: ['context-0'] } },
        rootNodeId: 'left',
      }
    : {
        contexts: {
          'context-0': { url: initialContext },
          'context-1': { url: documentContext },
        },
        nodes: {
          left: { kind: 'pane', contexts: ['context-0'] },
          right: { kind: 'pane', contexts: ['context-1'] },
          'split-0': {
            kind: 'split', axis: 'horizontal', first: 'left', ratio: INITIAL_SPLIT_RATIO, second: 'right',
          },
        },
        rootNodeId: 'split-0',
      };

export const paneIdsInLayoutOrder = (workspace: WorkspaceState): readonly WorkspacePaneId[] => {
  const paneIds: WorkspacePaneId[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = workspace.nodes[nodeId];
    if (node?.kind === 'pane') {
      paneIds.push(nodeId);
    } else if (node?.kind === 'split') {
      visit(node.first);
      visit(node.second);
    }
  };
  visit(workspace.rootNodeId);
  return paneIds;
};

export const paneContaining = (
  workspace: WorkspaceState,
  contextId: string,
): WorkspacePaneId | undefined => Object.entries(workspace.nodes)
  .find(([, node]) => node.kind === 'pane' && node.contexts.includes(contextId))?.[0];

const registerContext = (
  workspace: WorkspaceState,
  contextId: string,
  url: string,
): WorkspaceState => workspace.contexts[contextId] === undefined
  ? { ...workspace, contexts: { ...workspace.contexts, [contextId]: { url } } }
  : workspace;

const pinContext = (
  workspace: WorkspaceState,
  contextId: string,
  url: string,
  targetPaneId: WorkspacePaneId,
  beforeContext?: string,
): WorkspaceState => {
  if (workspace.contexts[contextId] !== undefined || paneAt(workspace, targetPaneId) === undefined) return workspace;
  const registered = registerContext(workspace, contextId, url);
  const target = paneAt(registered, targetPaneId)!;
  return updatePane(registered, targetPaneId, {
    kind: 'pane',
    contexts: insertContext(target.contexts, contextId, beforeContext),
  });
};

const closeContext = (
  workspace: WorkspaceState,
  contextId: string,
): WorkspaceState => {
  const paneId = paneContaining(workspace, contextId);
  if (paneId === undefined) return workspace;
  const pane = paneAt(workspace, paneId);
  if (pane === undefined) return workspace;
  const removed = pruneContexts(updatePane(workspace, paneId, {
    kind: 'pane',
    contexts: pane.contexts.filter((candidate) => candidate !== contextId),
  }));
  return paneAt(removed, paneId)?.contexts.length === 0 ? closePane(removed, paneId) : removed;
};

const moveContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
  beforeContext?: string,
): WorkspaceState => {
  const sourcePaneId = paneContaining(workspace, contextId);
  const sourcePane = sourcePaneId === undefined ? undefined : paneAt(workspace, sourcePaneId);
  const targetPane = paneAt(workspace, targetPaneId);
  if (sourcePaneId === undefined || sourcePane === undefined || targetPane === undefined || contextId === beforeContext) {
    return workspace;
  }
  const sourceContexts = sourcePane.contexts.filter((candidate) => candidate !== contextId);
  const targetContexts = sourcePaneId === targetPaneId ? sourceContexts : targetPane.contexts;
  const contexts = insertContext(targetContexts, contextId, beforeContext);
  if (sourcePaneId === targetPaneId && sameStrings(contexts, sourcePane.contexts)) return workspace;
  const moved = {
    ...workspace,
    nodes: {
      ...workspace.nodes,
      [sourcePaneId]: { kind: 'pane' as const, contexts: sourceContexts },
      [targetPaneId]: { kind: 'pane' as const, contexts },
    },
  };
  return sourcePaneId !== targetPaneId && sourceContexts.length === 0 ? closePane(moved, sourcePaneId) : moved;
};

const splitContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
  edge: WorkspaceSplitEdge,
  ids: WorkspaceSplitIds,
): WorkspaceState => {
  if (workspace.contexts[contextId] === undefined
    || paneAt(workspace, targetPaneId) === undefined
    || workspace.nodes[ids.paneId] !== undefined
    || workspace.nodes[ids.splitId] !== undefined) return workspace;
  const sourcePaneId = paneContaining(workspace, contextId);
  const sourcePane = sourcePaneId === undefined ? undefined : paneAt(workspace, sourcePaneId);
  if (sourcePaneId === undefined || sourcePane === undefined) return workspace;
  const withoutContext = updatePane(workspace, sourcePaneId, {
    kind: 'pane',
    contexts: sourcePane.contexts.filter((candidate) => candidate !== contextId),
  });
  const withoutEmptySource = sourcePaneId !== targetPaneId && sourcePane.contexts.length === 1
    ? closePane(withoutContext, sourcePaneId)
    : withoutContext;
  return insertSplitPane(withoutEmptySource, targetPaneId, edge, ids, [contextId]);
};

const insertSplitPane = (
  workspace: WorkspaceState,
  targetPaneId: WorkspacePaneId,
  edge: WorkspaceSplitEdge,
  ids: WorkspaceSplitIds,
  contexts: readonly string[],
): WorkspaceState => {
  if (paneAt(workspace, targetPaneId) === undefined
    || workspace.nodes[ids.paneId] !== undefined
    || workspace.nodes[ids.splitId] !== undefined) return workspace;
  const targetFirst = edge === 'right' || edge === 'bottom';
  const replaced = replaceNodeReference(workspace, targetPaneId, ids.splitId);
  return {
    ...replaced,
    nodes: {
      ...replaced.nodes,
      [ids.paneId]: { kind: 'pane', contexts },
      [ids.splitId]: {
        kind: 'split',
        axis: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
        first: targetFirst ? targetPaneId : ids.paneId,
        ratio: NEW_SPLIT_RATIO,
        second: targetFirst ? ids.paneId : targetPaneId,
      },
    },
  };
};

const closePane = (workspace: WorkspaceState, paneId: WorkspacePaneId): WorkspaceState => {
  const pane = paneAt(workspace, paneId);
  if (pane === undefined || pane.contexts.length !== 0 || workspace.rootNodeId === paneId) return workspace;
  const parent = parentNode(workspace, paneId);
  if (parent === undefined) return workspace;
  const siblingId = parent.node.first === paneId ? parent.node.second : parent.node.first;
  const collapsed = replaceNodeReference(workspace, parent.id, siblingId);
  const removed = new Set([parent.id, paneId]);
  const nodes = Object.fromEntries(Object.entries(collapsed.nodes)
    .filter(([nodeId]) => !removed.has(nodeId)));
  return { ...collapsed, nodes };
};

const insertContext = (
  contexts: readonly string[],
  contextId: string,
  beforeContext?: string,
) => {
  const requestedIndex = beforeContext === undefined ? -1 : contexts.indexOf(beforeContext);
  const insertionIndex = requestedIndex < 0 ? contexts.length : requestedIndex;
  return [...contexts.slice(0, insertionIndex), contextId, ...contexts.slice(insertionIndex)];
};

const paneAt = (workspace: WorkspaceState, paneId: WorkspacePaneId) => {
  const node = workspace.nodes[paneId];
  return node?.kind === 'pane' ? node : undefined;
};

const updatePane = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  pane: WorkspacePane,
): WorkspaceState => ({ ...workspace, nodes: { ...workspace.nodes, [paneId]: pane } });

const pruneContexts = (workspace: WorkspaceState): WorkspaceState => {
  const mounted = new Set(Object.values(workspace.nodes)
    .flatMap((node) => node.kind === 'pane' ? node.contexts : []));
  const contexts = Object.fromEntries(Object.entries(workspace.contexts)
    .filter(([contextId]) => mounted.has(contextId)));
  return Object.keys(contexts).length === Object.keys(workspace.contexts).length
    ? workspace
    : { ...workspace, contexts };
};

const resizeSplit = (workspace: WorkspaceState, nodeId: string, ratio: number): WorkspaceState => {
  const node = workspace.nodes[nodeId];
  if (node?.kind !== 'split'
    || !Number.isFinite(ratio)
    || ratio < MIN_SPLIT_RATIO
    || ratio > MAX_SPLIT_RATIO
    || node.ratio === ratio) {
    return workspace;
  }
  return { ...workspace, nodes: { ...workspace.nodes, [nodeId]: { ...node, ratio } } };
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
  const parent = Object.entries(workspace.nodes).find(([, node]) =>
    node.kind === 'split' && (node.first === nodeId || node.second === nodeId));
  return parent === undefined ? undefined : { id: parent[0], node: parent[1] as Extract<WorkspaceNode, { kind: 'split' }> };
};

const sameStrings = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
