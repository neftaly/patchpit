import type { JsonValue, WriteRelation } from '@tarstate/core';
import { createWorkspace, type WorkspaceNode, type WorkspaceState } from './workspace.ts';
import {
  workspaceDocumentMetadata,
  workspaceRelations,
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

export type WorkspaceLogicalRow = {
  readonly relationId: string;
  readonly fields: Readonly<Record<string, JsonValue>>;
};

export type WorkspaceDocumentIssue = {
  readonly kind: 'node-id-collision' | 'state-cardinality';
  readonly details: Readonly<Record<string, JsonValue>>;
};

export type WorkspaceRelationRows = {
  readonly relation: WriteRelation;
  readonly keyField: string;
  readonly rows: readonly Readonly<Record<string, JsonValue>>[];
};

const workspaceStateId = 'workspace';

export const createWorkspaceDocument = (
  initialContext: string,
  documentContext?: string,
): WorkspaceDocument => workspaceDocumentFromState(createWorkspace(initialContext, documentContext));

export const workspaceFromLogicalRows = (
  rows: readonly WorkspaceLogicalRow[],
): {
  readonly workspace?: WorkspaceState;
  readonly issues: readonly WorkspaceDocumentIssue[];
} => {
  const issues: WorkspaceDocumentIssue[] = [];
  const stateRows = relationRows(rows, workspaceRelations.state.relationId);
  if (stateRows.length !== 1 || stateRows[0]?.id !== workspaceStateId) {
    return {
      issues: [{ kind: 'state-cardinality', details: { rows: stateRows.length } }],
    };
  }

  const contexts = Object.fromEntries(relationRows(rows, workspaceRelations.contexts.relationId)
    .map((row) => [row.id as string, { url: row.url as string }]));
  const paneContexts = new Map<string, { contextId: string; position: number }[]>();
  for (const row of relationRows(rows, workspaceRelations.paneContexts.relationId)) {
    const paneId = row.paneId as string;
    const current = paneContexts.get(paneId) ?? [];
    current.push({ contextId: row.contextId as string, position: row.position as number });
    paneContexts.set(paneId, current);
  }
  const nodes: Record<string, WorkspaceNode> = {};
  for (const row of relationRows(rows, workspaceRelations.panes.relationId)) {
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
  for (const row of relationRows(rows, workspaceRelations.splits.relationId)) {
    const id = row.id as string;
    if (nodes[id] !== undefined) {
      issues.push({ kind: 'node-id-collision', details: { nodeId: id } });
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
  return {
    workspace: {
      contexts,
      nodes,
      rootNodeId: stateRows[0].rootNodeId as string,
    },
    issues,
  };
};

export const workspaceRelationRows = (
  workspace: WorkspaceState,
): readonly WorkspaceRelationRows[] => {
  const contexts = sortedEntries(workspace.contexts)
    .map(([id, context]) => ({ id, url: context.url }));
  const panes: Readonly<Record<string, JsonValue>>[] = [];
  const paneContexts: Readonly<Record<string, JsonValue>>[] = [];
  const splits: Readonly<Record<string, JsonValue>>[] = [];
  for (const [id, node] of sortedEntries(workspace.nodes)) {
    if (node.kind === 'pane') {
      panes.push({ id, activeContext: node.activeContext, previewContext: node.previewContext });
      node.contexts.forEach((contextId, position) => {
        paneContexts.push({ contextId, paneId: id, position });
      });
    } else {
      splits.push({
        id,
        axis: node.axis,
        first: node.first,
        ratio: node.ratio,
        second: node.second,
      });
    }
  }
  paneContexts.sort((left, right) => compareStrings(
    left.contextId as string,
    right.contextId as string,
  ));
  return [
    relationRowsFor(workspaceRelations.state, [{ id: workspaceStateId, rootNodeId: workspace.rootNodeId }]),
    relationRowsFor(workspaceRelations.contexts, contexts),
    relationRowsFor(workspaceRelations.panes, panes),
    relationRowsFor(workspaceRelations.paneContexts, paneContexts),
    relationRowsFor(workspaceRelations.splits, splits),
  ];
};

const workspaceDocumentFromState = (workspace: WorkspaceState): WorkspaceDocument => {
  const relations = new Map(workspaceRelationRows(workspace)
    .map((relation) => [relation.relation.relationId, relation]));
  return {
    '@patchpit': workspaceDocumentMetadata,
    state: objectMap(relations, workspaceRelations.state.relationId) as Record<string, WorkspaceStateRow>,
    contexts: objectMap(relations, workspaceRelations.contexts.relationId) as Record<string, WorkspaceContextRow>,
    panes: objectMap(relations, workspaceRelations.panes.relationId) as Record<string, WorkspacePaneRow>,
    paneContexts: objectMap(
      relations,
      workspaceRelations.paneContexts.relationId,
    ) as Record<string, WorkspacePaneContextRow>,
    splits: objectMap(relations, workspaceRelations.splits.relationId) as Record<string, WorkspaceSplitRow>,
  };
};

const relationRowsFor = (
  relation: (typeof workspaceRelations)[keyof typeof workspaceRelations],
  rows: readonly Readonly<Record<string, JsonValue>>[],
): WorkspaceRelationRows => {
  const [keyField, ...additionalKeyFields] = relation.declaration.key;
  if (keyField === undefined || additionalKeyFields.length > 0) {
    throw new Error(`Workspace relation requires one key field: ${relation.relationId}`);
  }
  return {
    relation: { relationId: relation.relationId, schemaView: relation.schemaView },
    keyField,
    rows,
  };
};

const objectMap = (
  relations: ReadonlyMap<string, WorkspaceRelationRows>,
  relationId: string,
): Record<string, object> => {
  const relation = relations.get(relationId);
  if (relation === undefined) throw new Error(`Workspace relation is unavailable: ${relationId}`);
  return Object.fromEntries(relation.rows.map((row) => {
    const key = row[relation.keyField];
    if (typeof key !== 'string') throw new Error(`Workspace relation key is not a string: ${relationId}`);
    return [key, Object.fromEntries(Object.entries(row)
      .filter(([field]) => field !== relation.keyField))];
  }));
};

const relationRows = (rows: readonly WorkspaceLogicalRow[], relationId: string) => rows
  .filter((row) => row.relationId === relationId)
  .map(({ fields }) => fields);

const sortedEntries = <Value>(record: Readonly<Record<string, Value>>) => Object.entries(record)
  .sort(([left], [right]) => compareStrings(left, right));
const compareStrings = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
