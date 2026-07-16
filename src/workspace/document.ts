import type { JsonValue } from '@tarstate/core';
import { createWorkspace, type WorkspaceNode, type WorkspaceState } from './model.ts';
import {
  workspaceDocumentMetadata,
  workspaceRelations,
} from './schema.ts';

type WorkspaceStateRow = { readonly rootNodeId: string };
type WorkspacePaneRow = Record<never, never>;
type WorkspacePlacementRow = {
  readonly url: string;
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
  readonly panes: Readonly<Record<string, WorkspacePaneRow>>;
  readonly placements: Readonly<Record<string, WorkspacePlacementRow>>;
  readonly splits: Readonly<Record<string, WorkspaceSplitRow>>;
};

type WorkspaceLogicalRow = {
  readonly relationId: string;
  readonly fields: Readonly<Record<string, JsonValue>>;
};

type WorkspaceDocumentIssue = {
  readonly kind: 'node-id-collision' | 'state-cardinality';
  readonly details: Readonly<Record<string, JsonValue>>;
};

type WorkspaceRelationRows = {
  readonly relationId: string;
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

  const contexts: Record<string, { url: string }> = {};
  const paneContexts = new Map<string, { contextId: string; position: number }[]>();
  for (const row of relationRows(rows, workspaceRelations.placements.relationId)) {
    const contextId = row.contextId as string;
    const paneId = row.paneId as string;
    const current = paneContexts.get(paneId) ?? [];
    current.push({ contextId, position: row.position as number });
    paneContexts.set(paneId, current);
    contexts[contextId] = { url: row.url as string };
  }
  const nodes: Record<string, WorkspaceNode> = {};
  for (const row of relationRows(rows, workspaceRelations.panes.relationId)) {
    const id = row.id as string;
    nodes[id] = {
      kind: 'pane',
      contexts: [...paneContexts.get(id) ?? []]
        .sort((left, right) => left.position - right.position || left.contextId.localeCompare(right.contextId))
        .map(({ contextId }) => contextId),
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

const workspaceRelationRows = (
  workspace: WorkspaceState,
): readonly WorkspaceRelationRows[] => {
  const panes: Readonly<Record<string, JsonValue>>[] = [];
  const placements: Readonly<Record<string, JsonValue>>[] = [];
  const splits: Readonly<Record<string, JsonValue>>[] = [];
  for (const [id, node] of sortedEntries(workspace.nodes)) {
    if (node.kind === 'pane') {
      panes.push({ id });
      node.contexts.forEach((contextId, position) => {
        placements.push({ contextId, paneId: id, position, url: workspace.contexts[contextId]!.url });
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
  placements.sort((left, right) => compareStrings(
    left.contextId as string,
    right.contextId as string,
  ));
  return [
    relationRowsFor(workspaceRelations.state, [{ id: workspaceStateId, rootNodeId: workspace.rootNodeId }]),
    relationRowsFor(workspaceRelations.panes, panes),
    relationRowsFor(workspaceRelations.placements, placements),
    relationRowsFor(workspaceRelations.splits, splits),
  ];
};

export const workspaceLogicalRows = (
  workspace: WorkspaceState,
): readonly WorkspaceLogicalRow[] => workspaceRelationRows(workspace).flatMap(({ relationId, rows }) =>
  rows.map((fields) => ({ relationId, fields })),
);

const workspaceDocumentFromState = (workspace: WorkspaceState): WorkspaceDocument => {
  const relations = new Map(workspaceRelationRows(workspace)
    .map((relation) => [relation.relationId, relation]));
  return {
    '@patchpit': workspaceDocumentMetadata,
    state: objectMap(relations, workspaceRelations.state.relationId) as Record<string, WorkspaceStateRow>,
    panes: objectMap(relations, workspaceRelations.panes.relationId) as Record<string, WorkspacePaneRow>,
    placements: objectMap(
      relations,
      workspaceRelations.placements.relationId,
    ) as Record<string, WorkspacePlacementRow>,
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
    relationId: relation.relationId,
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
