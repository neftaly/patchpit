export type WorkspacePaneId = 'left' | 'right';

type WorkspacePane = {
  readonly activeContext: string | undefined;
  readonly contexts: readonly string[];
  readonly previewContext: string | undefined;
};
export type WorkspaceState = Readonly<Record<WorkspacePaneId, WorkspacePane>>;

export const createWorkspace = (initialContext: string): WorkspaceState => ({
  left: {
    activeContext: initialContext,
    contexts: [initialContext],
    previewContext: undefined,
  },
  right: { activeContext: undefined, contexts: [], previewContext: undefined },
});

export const activateContext = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  contextId: string,
): WorkspaceState => {
  const pane = workspace[paneId];
  if (!pane.contexts.includes(contextId)) return workspace;
  return { ...workspace, [paneId]: { ...pane, activeContext: contextId } };
};

export const previewContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
): WorkspaceState => {
  const existingPaneId = paneContaining(workspace, contextId);
  if (existingPaneId !== undefined) return activateContext(workspace, existingPaneId, contextId);

  const targetPane = workspace[targetPaneId];
  const previousPreview = targetPane.previewContext;
  const nextTarget = previousPreview === undefined
    ? targetPane
    : removeContextFromPane(targetPane, previousPreview);

  return {
    ...workspace,
    [targetPaneId]: {
      activeContext: contextId,
      contexts: [...nextTarget.contexts, contextId],
      previewContext: contextId,
    },
  };
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

const pinContext = (
  workspace: WorkspaceState,
  paneId: WorkspacePaneId,
  contextId: string,
): WorkspaceState => {
  const pane = workspace[paneId];
  if (pane.previewContext !== contextId) return workspace;
  return { ...workspace, [paneId]: { ...pane, previewContext: undefined } };
};

export const moveContext = (
  workspace: WorkspaceState,
  contextId: string,
  targetPaneId: WorkspacePaneId,
): WorkspaceState => {
  const sourcePaneId = paneContaining(workspace, contextId);
  if (sourcePaneId === undefined) return workspace;
  if (sourcePaneId === targetPaneId) return pinContext(workspace, sourcePaneId, contextId);

  const sourcePane = removeContextFromPane(workspace[sourcePaneId], contextId);
  const targetPane = workspace[targetPaneId];
  return {
    ...workspace,
    [sourcePaneId]: sourcePane,
    [targetPaneId]: {
      ...targetPane,
      activeContext: contextId,
      contexts: [...targetPane.contexts, contextId],
    },
  };
};

const paneContaining = (
  workspace: WorkspaceState,
  contextId: string,
): WorkspacePaneId | undefined => {
  if (workspace.left.contexts.includes(contextId)) return 'left';
  if (workspace.right.contexts.includes(contextId)) return 'right';
  return undefined;
};

const removeContextFromPane = (
  pane: WorkspacePane,
  contextId: string,
): WorkspacePane => {
  const contexts = pane.contexts.filter((candidate) => candidate !== contextId);
  return {
    activeContext: pane.activeContext === contextId ? contexts.at(-1) : pane.activeContext,
    contexts,
    previewContext: pane.previewContext === contextId ? undefined : pane.previewContext,
  };
};
