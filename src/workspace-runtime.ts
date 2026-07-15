import type { DocHandle } from '@automerge/automerge-repo';
import {
  AutomergeAtomicSource,
  automergeRepoSourceRuntime,
  type AutomergeSourceCommand,
} from '@tarstate/automerge';
import {
  canonicalizeJson,
  createIssue,
  projectStorage,
  sha256Json,
  type BindingProjection,
  type Issue,
  type JsonValue,
  type SourceBasis,
  type SourceSnapshot,
} from '@tarstate/core';
import {
  applyWorkspaceOperation,
  createWorkspace,
  type WorkspaceNode,
  type WorkspaceOperation,
  type WorkspaceState,
} from './workspace.ts';
import {
  workspaceDocumentMetadata,
  workspaceRelations,
  workspaceStorageMapping,
} from './workspace-schema.ts';

type WorkspaceStateRow = { readonly rootNodeId: string };
type WorkspaceContextRow = { readonly url: string };
type WorkspacePaneRow = {
  readonly activeContext: string;
  readonly previewContext: string | null;
};
type WorkspacePaneContextRow = {
  readonly paneId: string;
  readonly position: number;
};
type WorkspaceSplitRow = {
  readonly axis: 'horizontal' | 'vertical';
  readonly first: string;
  readonly ratio: number;
  readonly second: string;
};

export type WorkspaceDocument = {
  readonly '@patchpit': typeof workspaceDocumentMetadata;
  readonly state: Readonly<Record<string, WorkspaceStateRow>>;
  readonly contexts: Readonly<Record<string, WorkspaceContextRow>>;
  readonly panes: Readonly<Record<string, WorkspacePaneRow>>;
  readonly paneContexts: Readonly<Record<string, WorkspacePaneContextRow>>;
  readonly splits: Readonly<Record<string, WorkspaceSplitRow>>;
};

export type WorkspaceProjection = {
  readonly state: 'ready';
  readonly workspace: WorkspaceState;
  readonly basis: SourceBasis;
  readonly issues: readonly Issue[];
} | {
  readonly state: 'incomplete' | 'invalid';
  readonly basis?: SourceBasis;
  readonly issues: readonly Issue[];
};

export type WorkspaceOperationResult = {
  readonly outcome: 'committed' | 'unchanged' | 'rejected' | 'unknown';
  readonly issues: readonly Issue[];
};

const workspaceStateId = 'workspace';
const maxStaleRetries = 2;
type WorkspaceSourceSnapshot = SourceSnapshot<WorkspaceDocument>;

export const createWorkspaceDocument = (
  initialContext: string,
  documentContext?: string,
): WorkspaceDocument => workspaceDocumentFromState(createWorkspace(initialContext, documentContext));

export const openWorkspace = (handle: DocHandle<WorkspaceDocument>) => {
  const source = new AutomergeAtomicSource({
    runtime: automergeRepoSourceRuntime({ handle }),
    operationEpoch: `${handle.url}:workspace-operations:${crypto.randomUUID()}`,
    ownsRuntime: true,
  });
  let nextOperationId = 0;
  let pending = Promise.resolve();
  let cachedKey: string | undefined;
  let cachedProjection: WorkspaceProjection | undefined;

  const getSnapshot = () => {
    const snapshot = source.snapshot();
    const key = `${snapshot.state}:${snapshot.freshness}:${canonicalizeJson(snapshot.basis as JsonValue)}`;
    if (key !== cachedKey || cachedProjection === undefined) {
      cachedKey = key;
      cachedProjection = projectWorkspace(snapshot);
    }
    return cachedProjection;
  };

  const act = (operation: WorkspaceOperation) => {
    const queued = pending.then(async (): Promise<WorkspaceOperationResult> => {
      const intentHash = await sha256Json(operation as unknown as JsonValue);
      for (let attempt = 0; attempt <= maxStaleRetries; attempt += 1) {
        const snapshot = source.snapshot();
        const projection = projectWorkspace(snapshot);
        if (projection.state !== 'ready') {
          return { outcome: 'rejected', issues: projection.issues };
        }
        const next = applyWorkspaceOperation(projection.workspace, operation);
        if (next === projection.workspace) return { outcome: 'unchanged', issues: [] };
        const commands: readonly AutomergeSourceCommand<WorkspaceDocument>[] = [{
          description: operation.kind,
          apply: (draft) => syncWorkspaceDocument(draft as unknown as MutableWorkspaceDocument, next),
        }];
        const staged = source.stage(snapshot, commands);
        const stagedProjection = projectWorkspace({ ...snapshot, storage: staged.storage });
        if (stagedProjection.state !== 'ready') {
          return { outcome: 'rejected', issues: [...staged.issues, ...stagedProjection.issues] };
        }
        const result = await source.commit({
          operationEpoch: source.operationEpoch,
          operationId: `workspace-${nextOperationId++}`,
          intentHash,
          expectedBasis: snapshot.basis,
          commands,
        });
        if (result.outcome === 'committed') return { outcome: 'committed', issues: result.issues };
        if (result.outcome === 'unknown') return { outcome: 'unknown', issues: result.issues };
        if (attempt === maxStaleRetries || !staleBasisOnly(result.issues)) {
          return { outcome: 'rejected', issues: result.issues };
        }
      }
      return { outcome: 'rejected', issues: [] };
    });
    pending = queued.then(() => undefined, () => undefined);
    return queued;
  };

  return {
    act,
    close: () => source.close(),
    getSnapshot,
    resourceRef: handle.url,
    subscribe: (listener: () => void) => source.subscribe(listener),
  };
};

const projectWorkspace = (snapshot: WorkspaceSourceSnapshot): WorkspaceProjection => {
  if (snapshot.state !== 'ready' || snapshot.storage === undefined) {
    return {
      state: snapshot.state === 'loading' ? 'incomplete' : 'invalid',
      basis: snapshot.basis,
      issues: snapshot.issues,
    };
  }
  const projection = projectStorage(
    workspaceStorageMapping,
    snapshot.storage,
    undefined,
    snapshot.sourceId,
  );
  const issues = [...snapshot.issues, ...projection.issues];
  if (projection.completeness !== 'exact') {
    return { state: 'invalid', basis: snapshot.basis, issues };
  }
  const stateRows = relationRows(projection, workspaceRelations.state.relationId);
  if (stateRows.length !== 1 || stateRows[0]?.row.id !== workspaceStateId) {
    return {
      state: 'invalid',
      basis: snapshot.basis,
      issues: [...issues, workspaceIssue('state-cardinality', { rows: stateRows.length })],
    };
  }

  const contexts = Object.fromEntries(relationRows(projection, workspaceRelations.contexts.relationId)
    .map(({ row }) => [row.id as string, { url: row.url as string }]));
  const paneContexts = new Map<string, { contextId: string; position: number }[]>();
  for (const { row } of relationRows(projection, workspaceRelations.paneContexts.relationId)) {
    const paneId = row.paneId as string;
    const current = paneContexts.get(paneId) ?? [];
    current.push({ contextId: row.contextId as string, position: row.position as number });
    paneContexts.set(paneId, current);
  }
  const nodes: Record<string, WorkspaceNode> = {};
  for (const { row } of relationRows(projection, workspaceRelations.panes.relationId)) {
    const id = row.id as string;
    nodes[id] = {
      kind: 'pane',
      activeContext: row.activeContext as string,
      contexts: [...paneContexts.get(id) ?? []]
        .sort((left, right) => left.position - right.position || left.contextId.localeCompare(right.contextId))
        .map(({ contextId }) => contextId),
      previewContext: row.previewContext as string | null,
    };
  }
  for (const { row } of relationRows(projection, workspaceRelations.splits.relationId)) {
    const id = row.id as string;
    if (nodes[id] !== undefined) {
      issues.push(workspaceIssue('node-id-collision', { nodeId: id }));
      continue;
    }
    nodes[id] = {
      kind: 'split',
      axis: row.axis as 'horizontal' | 'vertical',
      first: row.first as string,
      ratio: row.ratio as number,
      second: row.second as string,
    };
  }
  const workspace: WorkspaceState = {
    contexts,
    nodes,
    rootNodeId: stateRows[0].row.rootNodeId as string,
  };
  issues.push(...workspaceTopologyIssues(workspace));
  return issues.some(({ severity }) => severity === 'error')
    ? { state: 'invalid', basis: snapshot.basis, issues }
    : { state: 'ready', workspace, basis: snapshot.basis, issues };
};

const workspaceDocumentFromState = (workspace: WorkspaceState): WorkspaceDocument => {
  const document: MutableWorkspaceDocument = {
    '@patchpit': workspaceDocumentMetadata,
    state: { [workspaceStateId]: { rootNodeId: workspace.rootNodeId } },
    contexts: Object.fromEntries(Object.entries(workspace.contexts)
      .map(([id, context]) => [id, { url: context.url }])),
    panes: {},
    paneContexts: {},
    splits: {},
  };
  for (const [id, node] of Object.entries(workspace.nodes)) {
    if (node.kind === 'pane') {
      document.panes[id] = {
        activeContext: node.activeContext,
        previewContext: node.previewContext,
      };
      node.contexts.forEach((contextId, position) => {
        document.paneContexts[contextId] = { paneId: id, position };
      });
    } else {
      document.splits[id] = {
        axis: node.axis,
        first: node.first,
        ratio: node.ratio,
        second: node.second,
      };
    }
  }
  return document;
};

type MutableWorkspaceDocument = {
  '@patchpit': typeof workspaceDocumentMetadata;
  state: Record<string, WorkspaceStateRow>;
  contexts: Record<string, WorkspaceContextRow>;
  panes: Record<string, WorkspacePaneRow>;
  paneContexts: Record<string, WorkspacePaneContextRow>;
  splits: Record<string, WorkspaceSplitRow>;
};

const syncWorkspaceDocument = (draft: MutableWorkspaceDocument, workspace: WorkspaceState) => {
  const next = workspaceDocumentFromState(workspace) as MutableWorkspaceDocument;
  syncRows(draft.state, next.state);
  syncRows(draft.contexts, next.contexts);
  syncRows(draft.panes, next.panes);
  syncRows(draft.paneContexts, next.paneContexts);
  syncRows(draft.splits, next.splits);
};

const syncRows = <Row extends object>(draft: Record<string, Row>, next: Record<string, Row>) => {
  for (const key of Object.keys(draft)) if (next[key] === undefined) delete draft[key];
  for (const [key, row] of Object.entries(next)) {
    const current = draft[key];
    if (current === undefined) {
      draft[key] = { ...row };
      continue;
    }
    for (const field of Object.keys(current) as (keyof Row)[]) {
      if (!(field in row)) delete current[field];
    }
    Object.assign(current, row);
  }
};

const workspaceTopologyIssues = (workspace: WorkspaceState): readonly Issue[] => {
  const issues: Issue[] = [];
  const mounted = new Set<string>();
  for (const [nodeId, node] of Object.entries(workspace.nodes)) {
    if (node.kind === 'pane') {
      if (node.contexts.length === 0) issues.push(workspaceIssue('pane-empty', { nodeId }));
      for (const contextId of node.contexts) {
        if (workspace.contexts[contextId] === undefined) {
          issues.push(workspaceIssue('pane-context-missing', { contextId, nodeId }));
        }
        if (mounted.has(contextId)) issues.push(workspaceIssue('context-mounted-twice', { contextId }));
        mounted.add(contextId);
      }
      if (!node.contexts.includes(node.activeContext)) {
        issues.push(workspaceIssue('active-context-unmounted', { contextId: node.activeContext, nodeId }));
      }
      if (node.previewContext !== null && !node.contexts.includes(node.previewContext)) {
        issues.push(workspaceIssue('preview-context-unmounted', { contextId: node.previewContext, nodeId }));
      }
    } else {
      if (workspace.nodes[node.first] === undefined || workspace.nodes[node.second] === undefined) {
        issues.push(workspaceIssue('split-child-missing', { nodeId }));
      }
      if (node.first === node.second) issues.push(workspaceIssue('split-child-duplicate', { nodeId }));
      if (node.ratio < 0.1 || node.ratio > 0.9) issues.push(workspaceIssue('split-ratio-invalid', { nodeId }));
    }
  }
  for (const contextId of Object.keys(workspace.contexts)) {
    if (!mounted.has(contextId)) issues.push(workspaceIssue('context-unmounted', { contextId }));
  }
  if (workspace.nodes[workspace.rootNodeId] === undefined) {
    issues.push(workspaceIssue('root-missing', { rootNodeId: workspace.rootNodeId }));
    return issues;
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      issues.push(workspaceIssue('layout-cycle', { nodeId }));
      return;
    }
    if (visited.has(nodeId)) {
      issues.push(workspaceIssue('layout-node-shared', { nodeId }));
      return;
    }
    const node = workspace.nodes[nodeId];
    if (node === undefined) return;
    visiting.add(nodeId);
    if (node.kind === 'split') {
      visit(node.first);
      visit(node.second);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  visit(workspace.rootNodeId);
  for (const nodeId of Object.keys(workspace.nodes)) {
    if (!visited.has(nodeId)) issues.push(workspaceIssue('layout-node-unreachable', { nodeId }));
  }
  return issues;
};

const relationRows = (projection: BindingProjection, relationId: string) =>
  projection.relations.get(relationId)?.rows ?? [];

const workspaceIssue = (kind: string, details: Readonly<Record<string, JsonValue>>) => createIssue({
  code: `patchpit.workspace.${kind}`,
  phase: 'parse',
  severity: 'error',
  details,
});

const staleBasisOnly = (issues: readonly Issue[]) => issues.length > 0
  && issues.every(({ code }) => code.endsWith('expected_basis_stale'));
