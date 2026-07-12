import type { DocHandle } from '@automerge/automerge-repo';
import { automergeRepoSourceRuntime } from '@tarstate/automerge';
import { sha256Json } from '@tarstate/core';
import { createWorkspace, type WorkspaceNode, type WorkspaceState } from './workspace.ts';
import { workspaceDocumentMetadata } from './workspace-schema.ts';

export type WorkspaceDocument = WorkspaceState & {
  readonly '@patchpit': typeof workspaceDocumentMetadata;
};

type WorkspaceDraft = {
  contexts: Record<string, { url: string }>;
  nodes: Record<string, MutableWorkspaceNode>;
  rootNodeId: string;
};
type MutableWorkspaceNode = {
  kind: 'pane';
  activeContext: string;
  contexts: string[];
  previewContext: string | null;
} | {
  kind: 'split';
  axis: 'horizontal' | 'vertical';
  first: string;
  ratio: number;
  second: string;
};

export const createWorkspaceDocument = (
  initialContext: string,
  documentContext?: string,
): WorkspaceDocument => ({
  '@patchpit': workspaceDocumentMetadata,
  ...createWorkspace(initialContext, documentContext),
});

export const openWorkspace = (handle: DocHandle<WorkspaceDocument>) => {
  const runtime = automergeRepoSourceRuntime({ handle });
  const operationEpoch = `${runtime.sourceId}:operations:${crypto.randomUUID()}`;
  let nextOperationId = 0;
  let pending = Promise.resolve();

  const update = (change: (workspace: WorkspaceState) => WorkspaceState) => {
    const operation = pending.then(async () => {
      const snapshot = runtime.snapshot();
      const next = change(snapshot.storage);
      if (next === snapshot.storage) return;
      const operationId = `workspace-${nextOperationId++}`;
      const result = await runtime.commit({
        operationEpoch,
        operationId,
        intentHash: await sha256Json({ kind: 'patchpit.workspace-update', operationId }),
        expectedBasis: snapshot.basis,
        commands: [{ apply: (draft) => syncWorkspace(draft as unknown as WorkspaceDraft, next) }],
      });
      if (result.outcome !== 'committed') throw new Error(`Workspace update rejected: ${operationId}`);
    });
    pending = operation.catch(() => undefined);
    return operation;
  };

  return {
    close: () => runtime.close(),
    getSnapshot: () => runtime.snapshot().storage,
    resourceRef: handle.url,
    subscribe: (listener: () => void) => runtime.subscribe(listener),
    update,
  };
};

const syncWorkspace = (draft: WorkspaceDraft, next: WorkspaceState) => {
  draft.rootNodeId = next.rootNodeId;
  for (const contextId of Object.keys(draft.contexts)) {
    if (next.contexts[contextId] === undefined) delete draft.contexts[contextId];
  }
  for (const [contextId, context] of Object.entries(next.contexts)) {
    const current = draft.contexts[contextId];
    if (current === undefined) draft.contexts[contextId] = { ...context };
    else current.url = context.url;
  }
  syncNodes(draft.nodes, next.nodes);
};

const syncNodes = (
  draft: Record<string, MutableWorkspaceNode>,
  next: Readonly<Record<string, WorkspaceNode>>,
) => {
  for (const nodeId of Object.keys(draft)) if (next[nodeId] === undefined) delete draft[nodeId];
  for (const [nodeId, node] of Object.entries(next)) {
    const current = draft[nodeId];
    if (current === undefined || current.kind !== node.kind) {
      draft[nodeId] = node.kind === 'pane' ? { ...node, contexts: [...node.contexts] } : { ...node };
    } else if (current.kind === 'pane' && node.kind === 'pane') {
      current.activeContext = node.activeContext;
      current.previewContext = node.previewContext;
      if (current.contexts.length !== node.contexts.length
        || current.contexts.some((context, index) => context !== node.contexts[index])) {
        current.contexts.splice(0, current.contexts.length, ...node.contexts);
      }
    } else if (current.kind === 'split' && node.kind === 'split') {
      current.axis = node.axis;
      current.first = node.first;
      current.ratio = node.ratio;
      current.second = node.second;
    }
  }
};
