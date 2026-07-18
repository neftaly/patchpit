import type { JsonValue } from '@tarstate/core';
import type { DatabaseTransactionSnapshot } from '@tarstate/core/transactions';
import {
  workspaceDocumentMetadata,
  workspaceRelations,
  type WorkspacePaneRelationRow,
  type WorkspacePlacementRelationRow,
  type WorkspaceSplitRelationRow,
  type WorkspaceStateRelationRow,
} from '@patchpit/artifacts';
import { createWorkspace, type WorkspaceNode, type WorkspaceState } from './durable-state.ts';

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
): readonly WorkspaceLogicalRow[] => {
  const rows = workspaceRowsFromState(workspace);
  return [
    ...logicalRows(workspaceRelations.state.relationId, rows.state),
    ...logicalRows(workspaceRelations.panes.relationId, rows.panes),
    ...logicalRows(workspaceRelations.placements.relationId, rows.placements),
    ...logicalRows(workspaceRelations.splits.relationId, rows.splits),
  ];
};

const workspaceDocumentFromState = (workspace: WorkspaceState): WorkspaceDocument => {
  const rows = workspaceRowsFromState(workspace);
  return {
    '@patchpit': workspaceDocumentMetadata,
    state: Object.fromEntries(rows.state.map(({ id, ...fields }) => [id, fields])),
    panes: Object.fromEntries(rows.panes.map(({ id, ...fields }) => [id, fields])),
    placements: Object.fromEntries(rows.placements.map(({ contextId, ...fields }) => [contextId, fields])),
    splits: Object.fromEntries(rows.splits.map(({ id, ...fields }) => [id, fields])),
  };
};

const logicalRows = (
  relationId: string,
  rows: readonly Readonly<Record<string, JsonValue>>[],
): readonly WorkspaceLogicalRow[] => rows.map((fields) => ({ relationId, fields }));

const relationRows = <Row extends Readonly<Record<string, JsonValue>>>(
  rows: readonly WorkspaceLogicalRow[],
  relationId: string,
): readonly Row[] => rows
  .filter((row) => row.relationId === relationId)
  .map(({ fields }) => fields as Row);

const sortedEntries = <Value>(record: Readonly<Record<string, Value>>) => Object.entries(record)
  .sort(([left], [right]) => compareStrings(left, right));
const compareStrings = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
