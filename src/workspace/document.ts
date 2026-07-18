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

export type WorkspaceRelationRows = {
  readonly state: readonly WorkspaceStateRelationRow[];
  readonly panes: readonly WorkspacePaneRelationRow[];
  readonly placements: readonly WorkspacePlacementRelationRow[];
  readonly splits: readonly WorkspaceSplitRelationRow[];
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

export const workspaceFromRelationRows = (
  rows: WorkspaceRelationRows,
): {
  readonly workspace?: WorkspaceState;
  readonly issues: readonly WorkspaceDocumentIssue[];
} => {
  const issues: WorkspaceDocumentIssue[] = [];
  if (rows.state.length !== 1 || rows.state[0]?.id !== WORKSPACE_STATE_ID) {
    return {
      issues: [{ kind: 'state-cardinality', details: { rows: rows.state.length } }],
    };
  }

  const contexts = Object.fromEntries(rows.placements.map((row) => [
    row.contextId,
    { url: row.url },
  ]));
  const paneContexts = rows.placements.reduce((grouped, row) => {
    const { contextId, paneId } = row;
    const current = grouped.get(paneId) ?? [];
    current.push({ contextId, position: row.position });
    grouped.set(paneId, current);
    return grouped;
  }, new Map<string, { contextId: string; position: number }[]>());
  const nodes: Record<string, WorkspaceNode> = Object.fromEntries(
    rows.panes.map((row) => {
      const { id } = row;
      return [id, {
        kind: 'pane',
        contexts: [...paneContexts.get(id) ?? []]
          .sort((left, right) => left.position - right.position || left.contextId.localeCompare(right.contextId))
          .map(({ contextId }) => contextId),
      }];
    }),
  );
  issues.push(...rows.splits
    .filter((row) => nodes[row.id] !== undefined)
    .map((row) => ({ kind: 'node-id-collision' as const, details: { nodeId: row.id } })));
  Object.assign(nodes, Object.fromEntries(rows.splits.flatMap((row) => {
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
      rootNodeId: rows.state[0].rootNodeId,
    },
    issues,
  };
};

export const workspaceFromTransactionSnapshot = (snapshot: DatabaseTransactionSnapshot) =>
  workspaceFromRelationRows({
    state: snapshot.rows(workspaceRelations.state),
    panes: snapshot.rows(workspaceRelations.panes),
    placements: snapshot.rows(workspaceRelations.placements),
    splits: snapshot.rows(workspaceRelations.splits),
  });

export const workspaceTransactionWithState = (
  snapshot: DatabaseTransactionSnapshot,
  workspace: WorkspaceState,
) => {
  const rows = workspaceRelationRowsFromState(workspace);
  return snapshot
    .withRows(workspaceRelations.state, rows.state)
    .withRows(workspaceRelations.panes, rows.panes)
    .withRows(workspaceRelations.placements, rows.placements)
    .withRows(workspaceRelations.splits, rows.splits);
};

export const workspaceRelationRowsFromState = (workspace: WorkspaceState): WorkspaceRelationRows => {
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

const workspaceDocumentFromState = (workspace: WorkspaceState): WorkspaceDocument => {
  const rows = workspaceRelationRowsFromState(workspace);
  return {
    '@patchpit': workspaceDocumentMetadata,
    state: Object.fromEntries(rows.state.map(({ id, ...fields }) => [id, fields])),
    panes: Object.fromEntries(rows.panes.map(({ id, ...fields }) => [id, fields])),
    placements: Object.fromEntries(rows.placements.map(({ contextId, ...fields }) => [contextId, fields])),
    splits: Object.fromEntries(rows.splits.map(({ id, ...fields }) => [id, fields])),
  };
};

const sortedEntries = <Value>(record: Readonly<Record<string, Value>>) => Object.entries(record)
  .sort(([left], [right]) => compareStrings(left, right));
const compareStrings = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
