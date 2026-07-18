import {
  mappedRelationRows,
  type ExternalStoreDatabaseSnapshot,
} from '@tarstate/core/database/external-store';
import type { DatabaseTransactionSnapshot } from '@tarstate/core/transactions';
import {
  workspacePresenceRelations,
  workspacePresenceSourceMetadata,
  type WorkspacePresencePaneRelationRow,
  type WorkspacePresencePreviewRelationRow,
  type WorkspacePresenceRecentContextRelationRow,
} from '@patchpit/artifacts';
import type { WorkspacePaneId } from './durable-state.ts';
import type { WorkspaceViewState } from './view-state.ts';

type WorkspacePresenceStorage = {
  readonly '@patchpit': typeof workspacePresenceSourceMetadata;
  readonly panes: Readonly<Record<WorkspacePaneId, Omit<WorkspacePresencePaneRelationRow, 'paneId'>>>;
  readonly previews: Readonly<Record<WorkspacePaneId, Omit<WorkspacePresencePreviewRelationRow, 'paneId'>>>;
  readonly recentContexts: Readonly<Record<string, Omit<WorkspacePresenceRecentContextRelationRow, 'contextId'>>>;
};

type WorkspacePresenceRows = {
  readonly panes: readonly WorkspacePresencePaneRelationRow[];
  readonly previews: readonly WorkspacePresencePreviewRelationRow[];
  readonly recentContexts: readonly WorkspacePresenceRecentContextRelationRow[];
};

export const createWorkspacePresenceStorage = (): WorkspacePresenceStorage => ({
  '@patchpit': workspacePresenceSourceMetadata,
  panes: {},
  previews: {},
  recentContexts: {},
});

export const viewStateFromDatabaseSnapshot = (
  snapshot: ExternalStoreDatabaseSnapshot,
): WorkspaceViewState | undefined => snapshot.state === 'open' && snapshot.current.readiness === 'ready'
  ? viewStateFromRows({
      panes: mappedRelationRows(snapshot.current, workspacePresenceRelations.panes),
      previews: mappedRelationRows(snapshot.current, workspacePresenceRelations.previews),
      recentContexts: mappedRelationRows(snapshot.current, workspacePresenceRelations.recentContexts),
    })
  : undefined;

export const viewStateFromTransactionSnapshot = (snapshot: DatabaseTransactionSnapshot) => viewStateFromRows({
  panes: snapshot.rows(workspacePresenceRelations.panes),
  previews: snapshot.rows(workspacePresenceRelations.previews),
  recentContexts: snapshot.rows(workspacePresenceRelations.recentContexts),
});

export const transactionWithViewState = (
  snapshot: DatabaseTransactionSnapshot,
  viewState: WorkspaceViewState,
) => {
  const rows = rowsFromViewState(viewState);
  return snapshot
    .withRows(workspacePresenceRelations.panes, rows.panes)
    .withRows(workspacePresenceRelations.previews, rows.previews)
    .withRows(workspacePresenceRelations.recentContexts, rows.recentContexts);
};

const viewStateFromRows = (rows: WorkspacePresenceRows): WorkspaceViewState => {
  const previews = new Map(rows.previews.map((preview) => [preview.paneId, preview]));
  return {
    panes: Object.fromEntries(rows.panes.map((pane) => {
      const preview = previews.get(pane.paneId);
      return [pane.paneId, {
        selectedContextId: pane.selectedContextId,
        preview: preview === undefined ? null : { contextId: preview.contextId, url: preview.url },
      }];
    })),
    recentContextIds: [...rows.recentContexts]
      .sort((left, right) => left.position - right.position || left.contextId.localeCompare(right.contextId))
      .map(({ contextId }) => contextId),
  };
};

const rowsFromViewState = (viewState: WorkspaceViewState): WorkspacePresenceRows => ({
  panes: Object.entries(viewState.panes).map(([paneId, pane]) => ({
    paneId,
    selectedContextId: pane.selectedContextId,
  })),
  previews: Object.entries(viewState.panes).flatMap(([paneId, pane]) => pane.preview === null
    ? []
    : [{ paneId, contextId: pane.preview.contextId, url: pane.preview.url }]),
  recentContexts: viewState.recentContextIds.map((contextId, position) => ({ contextId, position })),
});
