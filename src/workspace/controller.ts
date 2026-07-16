import {
  applyWorkspaceOperation,
  contextIdForUrl,
  paneIdsInLayoutOrder,
  type WorkspaceOperation,
  type WorkspaceState,
} from './model.ts';
import {
  clearWorkspacePreview,
  previewWorkspaceContext,
  reconcileWorkspacePresence,
  selectWorkspaceContext,
  type WorkspaceAction,
  type WorkspacePresence,
} from './presence.ts';

export type WorkspacePlan = {
  readonly operations: readonly WorkspaceOperation[];
  readonly presence: WorkspacePresence;
  readonly workspace: WorkspaceState;
};

export const planWorkspaceAction = (options: {
  readonly action: WorkspaceAction;
  readonly isEditorContext: (url: string) => boolean;
  readonly presence: WorkspacePresence;
  readonly workspace: WorkspaceState;
}): WorkspacePlan => {
  const { action, isEditorContext } = options;
  let { presence, workspace } = options;
  const operations: WorkspaceOperation[] = [];
  const apply = (operation: WorkspaceOperation) => {
    const next = applyWorkspaceOperation(workspace, operation);
    if (next !== workspace) {
      operations.push(operation);
      workspace = next;
    }
  };

  if (action.kind === 'workspace.context.activate') {
    const url = contextUrl(workspace, presence, action.paneId, action.contextId);
    presence = selectWorkspaceContext(
      workspace,
      presence,
      action.paneId,
      action.contextId,
      url !== undefined && isEditorContext(url),
    );
    return { operations, presence, workspace };
  }
  if (action.kind === 'workspace.split.resize') {
    apply(action);
    return { operations, presence: reconcileWorkspacePresence(workspace, presence), workspace };
  }
  if (action.kind === 'workspace.context.close') {
    const preview = presence.panes[action.paneId]?.preview;
    if (preview?.contextId === action.contextId) {
      presence = clearWorkspacePreview(workspace, presence, action.paneId);
      const pane = workspace.nodes[action.paneId];
      if (pane?.kind === 'pane' && pane.contexts.length === 0) {
        apply({ kind: 'workspace.pane.close', paneId: action.paneId });
      }
    } else {
      apply(action);
    }
    return { operations, presence: reconcileWorkspacePresence(workspace, presence), workspace };
  }

  const preview = Object.entries(presence.panes)
    .find(([, pane]) => pane.preview?.contextId === action.contextId);
  const previewUrl = preview?.[1].preview?.url;
  const newUrl = action.url ?? previewUrl;
  if (action.kind === 'workspace.context.move') {
    if (newUrl === undefined) {
      apply({
        kind: 'workspace.context.move',
        contextId: action.contextId,
        targetPaneId: action.targetPaneId,
        beforeContext: action.beforeContext,
      });
    } else {
      apply({
        kind: 'workspace.context.pin',
        contextId: action.contextId,
        url: newUrl,
        targetPaneId: action.targetPaneId,
        beforeContext: action.beforeContext,
      });
    }
    if (preview !== undefined) presence = clearWorkspacePreview(workspace, presence, preview[0]);
    presence = selectWorkspaceContext(workspace, presence, action.targetPaneId, action.contextId, true);
    return { operations, presence: reconcileWorkspacePresence(workspace, presence), workspace };
  }

  if (newUrl === undefined) {
    apply({
      kind: 'workspace.context.split',
      contextId: action.contextId,
      targetPaneId: action.targetPaneId,
      edge: action.edge,
      ids: action.ids,
    });
  } else {
    apply({
      kind: 'workspace.context.pin-split',
      contextId: action.contextId,
      url: newUrl,
      targetPaneId: action.targetPaneId,
      edge: action.edge,
      ids: action.ids,
    });
  }
  if (preview !== undefined) presence = clearWorkspacePreview(workspace, presence, preview[0]);
  presence = selectWorkspaceContext(workspace, presence, action.ids.paneId, action.contextId, true);
  return { operations, presence: reconcileWorkspacePresence(workspace, presence), workspace };
};

export const planOpenWorkspaceContext = (options: {
  readonly contextId: string;
  readonly isEditorContext: (url: string) => boolean;
  readonly nodes: { readonly paneId: string; readonly splitId: string };
  readonly pinned: boolean;
  readonly presence: WorkspacePresence;
  readonly url: string;
  readonly workspace: WorkspaceState;
}): WorkspacePlan => {
  let { presence, workspace } = options;
  const operations: WorkspaceOperation[] = [];
  let targetPaneId = editorPaneId(workspace, presence, options.isEditorContext);
  if (targetPaneId === undefined) {
    const targetPane = paneIdsInLayoutOrder(workspace)[0];
    if (targetPane === undefined) return { operations, presence, workspace };
    targetPaneId = options.nodes.paneId;
    const operation: WorkspaceOperation = options.pinned
      ? {
          kind: 'workspace.context.pin-split',
          contextId: options.contextId,
          url: options.url,
          targetPaneId: targetPane,
          edge: 'right',
          ids: options.nodes,
        }
      : {
          kind: 'workspace.pane.split',
          targetPaneId: targetPane,
          edge: 'right',
          ids: options.nodes,
        };
    workspace = applyWorkspaceOperation(workspace, operation);
    operations.push(operation);
  }
  const existing = contextIdForUrl(workspace, options.url, targetPaneId);
  if (existing !== undefined) {
    presence = selectWorkspaceContext(workspace, presence, targetPaneId, existing, true);
    return { operations, presence, workspace };
  }
  const currentPreview = presence.panes[targetPaneId]?.preview;
  const contextId = currentPreview?.url === options.url ? currentPreview.contextId : options.contextId;
  if (options.pinned) {
    if (workspace.contexts[contextId] === undefined) {
      const operation: WorkspaceOperation = {
        kind: 'workspace.context.pin',
        contextId,
        url: options.url,
        targetPaneId,
        beforeContext: null,
      };
      const next = applyWorkspaceOperation(workspace, operation);
      if (next !== workspace) {
        operations.push(operation);
        workspace = next;
      }
    }
    presence = clearWorkspacePreview(workspace, presence, targetPaneId);
    presence = selectWorkspaceContext(workspace, presence, targetPaneId, contextId, true);
  } else {
    presence = previewWorkspaceContext(workspace, presence, targetPaneId, {
      contextId,
      url: options.url,
    });
  }
  return { operations, presence: reconcileWorkspacePresence(workspace, presence), workspace };
};

const editorPaneId = (
  workspace: WorkspaceState,
  presence: WorkspacePresence,
  isEditorContext: (url: string) => boolean,
) => {
  const candidates = [presence.activePaneId, ...paneIdsInLayoutOrder(workspace)];
  return candidates.find((paneId, index) => paneId !== null
    && candidates.indexOf(paneId) === index
    && paneHasEditorContext(workspace, presence, paneId, isEditorContext)) ?? undefined;
};

const paneHasEditorContext = (
  workspace: WorkspaceState,
  presence: WorkspacePresence,
  paneId: string,
  isEditorContext: (url: string) => boolean,
) => {
  const pane = workspace.nodes[paneId];
  if (pane?.kind !== 'pane') return false;
  const ids = [...pane.contexts];
  const preview = presence.panes[paneId]?.preview;
  if (preview !== null && preview !== undefined) ids.push(preview.contextId);
  return ids.some((contextId) => {
    const url = contextUrl(workspace, presence, paneId, contextId);
    return url !== undefined && isEditorContext(url);
  });
};

const contextUrl = (
  workspace: WorkspaceState,
  presence: WorkspacePresence,
  paneId: string,
  contextId: string,
) => workspace.contexts[contextId]?.url
  ?? (presence.panes[paneId]?.preview?.contextId === contextId
    ? presence.panes[paneId]?.preview?.url
    : undefined);
