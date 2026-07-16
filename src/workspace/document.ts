import type { JsonValue } from '@tarstate/core';
import type { DatabaseTransactionSnapshot } from '@tarstate/core/transactions';
import { createWorkspace, type WorkspaceNode, type WorkspaceState } from './durable-state.ts';
import {
  workspaceDocumentMetadata,
  workspaceRelations,
  type WorkspacePaneRelationRow,
  type WorkspacePlacementRelationRow,
  type WorkspaceSplitRelationRow,
  type WorkspaceStateRelationRow,
} from './schema.ts';

export type WorkspaceDocument = {
  readonly '@patchpit': typeof workspaceDocumentMetadata;
  readonly state: Readonly<Record<string, Omit<WorkspaceStateRelationRow, 'id'>>>;
  readonly panes: Readonly<Record<string, Omit<WorkspacePaneRelationRow, 'id'>>>;
  readonly placements: Readonly<Record<string, Omit<WorkspacePlacementRelationRow, 'contextId'>>>;
  readonly splits: Readonly<Record<string, Omit<WorkspaceSplitRelationRow, 'id'>>>;
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

const WORKSPACE_STATE_ID = 'workspace';

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
  const stateRows = relationRows<WorkspaceStateRelationRow>(rows, workspaceRelations.state.relationId);
  if (stateRows.length !== 1 || stateRows[0]?.id !== WORKSPACE_STATE_ID) {
    return {
      issues: [{ kind: 'state-cardinality', details: { rows: stateRows.length } }],
    };
  }

  const placements = relationRows<WorkspacePlacementRelationRow>(
    rows,
    workspaceRelations.placements.relationId,
  );
  const contexts = Object.fromEntries(placements.map((row) => [
    row.contextId,
    { url: row.url },
  ]));
  const paneContexts = placements.reduce((grouped, row) => {
    const { contextId, paneId } = row;
    const current = grouped.get(paneId) ?? [];
    current.push({ contextId, position: row.position });
    grouped.set(paneId, current);
    return grouped;
  }, new Map<string, { contextId: string; position: number }[]>());
  const nodes: Record<string, WorkspaceNode> = Object.fromEntries(
    relationRows<WorkspacePaneRelationRow>(rows, workspaceRelations.panes.relationId).map((row) => {
      const { id } = row;
      return [id, {
        kind: 'pane',
        contexts: [...paneContexts.get(id) ?? []]
          .sort((left, right) => left.position - right.position || left.contextId.localeCompare(right.contextId))
          .map(({ contextId }) => contextId),
      }];
    }),
  );
  const splits = relationRows<WorkspaceSplitRelationRow>(rows, workspaceRelations.splits.relationId);
  issues.push(...splits
    .filter((row) => nodes[row.id] !== undefined)
    .map((row) => ({ kind: 'node-id-collision' as const, details: { nodeId: row.id } })));
  Object.assign(nodes, Object.fromEntries(splits.flatMap((row) => {
    const { id } = row;
    return nodes[id] === undefined
      ? [[id, {
          kind: 'split',
          axis: row.axis,
          first: row.first,
          ratio: row.ratio,
          second: row.second,
        } satisfies WorkspaceNode]]
      : [];
  })));
  return {
    workspace: {
      contexts,
      nodes,
      rootNodeId: stateRows[0].rootNodeId,
    },
    issues,
  };
};

export const workspaceFromTransactionSnapshot = (snapshot: DatabaseTransactionSnapshot) =>
  workspaceFromLogicalRows([
    ...snapshot.rows(workspaceRelations.state).map((fields) => ({
      relationId: workspaceRelations.state.relationId,
      fields,
    })),
    ...snapshot.rows(workspaceRelations.panes).map((fields) => ({
      relationId: workspaceRelations.panes.relationId,
      fields,
    })),
    ...snapshot.rows(workspaceRelations.placements).map((fields) => ({
      relationId: workspaceRelations.placements.relationId,
      fields,
    })),
    ...snapshot.rows(workspaceRelations.splits).map((fields) => ({
      relationId: workspaceRelations.splits.relationId,
      fields,
    })),
  ]);

export const workspaceTransactionWithState = (
  snapshot: DatabaseTransactionSnapshot,
  workspace: WorkspaceState,
) => {
  const rows = workspaceRowsFromState(workspace);
  return snapshot
    .withRows(workspaceRelations.state, rows.state)
    .withRows(workspaceRelations.panes, rows.panes)
    .withRows(workspaceRelations.placements, rows.placements)
    .withRows(workspaceRelations.splits, rows.splits);
};

const workspaceRelationRows = (
  workspace: WorkspaceState,
): readonly WorkspaceRelationRows[] => {
  const rows = workspaceRowsFromState(workspace);
  return [
    relationRowsFor(workspaceRelations.state, rows.state),
    relationRowsFor(workspaceRelations.panes, rows.panes),
    relationRowsFor(workspaceRelations.placements, rows.placements),
    relationRowsFor(workspaceRelations.splits, rows.splits),
  ];
};

const workspaceRowsFromState = (workspace: WorkspaceState) => {
  const nodes = sortedEntries(workspace.nodes);
  const panes = nodes.flatMap(([id, node]) => node.kind === 'pane' ? [{ id }] : []);
  const placements = nodes.flatMap(([id, node]) => node.kind === 'pane'
    ? node.contexts.map((contextId, position) => ({
        contextId,
        paneId: id,
        position,
        url: workspace.contexts[contextId]!.url,
      }))
    : []);
  const splits = nodes.flatMap(([id, node]) => node.kind === 'split'
    ? [{ id, axis: node.axis, first: node.first, ratio: node.ratio, second: node.second }]
    : []);
  placements.sort((left, right) => compareStrings(left.contextId, right.contextId));
  return {
    state: [{ id: WORKSPACE_STATE_ID, rootNodeId: workspace.rootNodeId }],
    panes,
    placements,
    splits,
  };
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
    state: objectMap(relations, workspaceRelations.state.relationId) as WorkspaceDocument['state'],
    panes: objectMap(relations, workspaceRelations.panes.relationId) as WorkspaceDocument['panes'],
    placements: objectMap(
      relations,
      workspaceRelations.placements.relationId,
    ) as WorkspaceDocument['placements'],
    splits: objectMap(relations, workspaceRelations.splits.relationId) as WorkspaceDocument['splits'],
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

const relationRows = <Row extends Readonly<Record<string, JsonValue>>>(
  rows: readonly WorkspaceLogicalRow[],
  relationId: string,
): readonly Row[] => rows
  .filter((row) => row.relationId === relationId)
  .map(({ fields }) => fields as Row);

const sortedEntries = <Value>(record: Readonly<Record<string, Value>>) => Object.entries(record)
  .sort(([left], [right]) => compareStrings(left, right));
const compareStrings = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
