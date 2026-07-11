import * as Automerge from '@automerge/automerge';
import { staticFsAttachment } from '@patchpit/fs';
import { AutomergeSourceRuntime } from '@tarstate/automerge';
import { sha256Json } from '@tarstate/core';
import { createWorkspace, type WorkspaceNode, type WorkspaceState } from './workspace.ts';

const workspaceResourceRef = 'automerge:patchpit-workspace';

type WorkspaceDocument = WorkspaceState & {
  readonly kind: 'patchpit.workspace@1';
};

type WorkspaceDraft = {
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

export const openWorkspace = (initialContext: string, documentContext?: string) => {
  const sourceId = 'patchpit-workspace';
  const operationEpoch = `${sourceId}:operations:1`;
  const runtime = new AutomergeSourceRuntime<WorkspaceDocument>({
    sourceId,
    doc: Automerge.from({ kind: 'patchpit.workspace@1', ...createWorkspace(initialContext, documentContext) }),
  });
  let view = { workspace: runtime.snapshot().storage };
  const listeners = new Set<() => void>();
  runtime.subscribe(() => {
    view = { workspace: runtime.snapshot().storage };
    for (const listener of listeners) listener();
  });
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
    attachment: staticFsAttachment({
      sourceId: 'patchpit',
      entries: [{
        entryId: 'workspace',
        kind: 'file',
        name: 'workspace.am',
        order: 0,
        parentId: null,
        resourceRef: workspaceResourceRef,
      }],
    }),
    close: () => {
      listeners.clear();
      runtime.close();
    },
    getSnapshot: () => view,
    resourceRef: workspaceResourceRef,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update,
  };
};

const syncWorkspace = (draft: WorkspaceDraft, next: WorkspaceState) => {
  draft.rootNodeId = next.rootNodeId;
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
