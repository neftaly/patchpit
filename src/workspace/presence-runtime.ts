import {
  createMemoryAtomicExternalStore,
  openExternalStoreDatabase,
} from '@tarstate/core/database/external-store';
import { workspacePresenceSourceMetadata } from '@patchpit/artifacts';
import {
  createWorkspaceViewState,
  reconcileWorkspaceViewState,
  type WorkspaceViewState,
} from './view-state.ts';
import {
  createWorkspacePresenceStorage,
  transactionWithViewState,
  viewStateFromDatabaseSnapshot,
  viewStateFromTransactionSnapshot,
} from './presence-source.ts';
import type { WorkspaceState } from './durable-state.ts';

export const openWorkspacePresence = async (options: {
  readonly sourceId: string;
  readonly workspace: WorkspaceState;
  readonly recentContextIds?: readonly string[];
}) => {
  const initialViewState = createWorkspaceViewState(options.workspace, options.recentContextIds);
  const store = createMemoryAtomicExternalStore(createWorkspacePresenceStorage());
  const opened = await openExternalStoreDatabase({
    sourceId: options.sourceId,
    store,
    declaration: workspacePresenceSourceMetadata.declaration,
    embeddedArtifacts: workspacePresenceSourceMetadata.schemas,
    authorityScope: 'patchpit.workspace.presence',
  });
  if (!opened.success) {
    throw new Error('Patchpit workspace presence is unavailable', { cause: opened.issues });
  }
  const database = opened.value;
  const initialized = await database.transact(
    { kind: 'patchpit.workspace.presence.initialize' },
    (snapshot) => transactionWithViewState(snapshot, initialViewState),
  ).catch((error: unknown) => {
    database.close();
    throw error;
  });
  if (initialized.outcome !== 'committed') {
    database.close();
    throw new Error('Patchpit workspace presence could not be initialized', { cause: initialized });
  }
  let cachedDatabaseSnapshot = database.getSnapshot();
  const projectedInitialViewState = viewStateFromDatabaseSnapshot(cachedDatabaseSnapshot);
  if (projectedInitialViewState === undefined) {
    database.close();
    throw new Error('Patchpit workspace presence did not become ready', {
      cause: cachedDatabaseSnapshot.state === 'open' ? cachedDatabaseSnapshot.current.issues : undefined,
    });
  }
  let cachedViewState = projectedInitialViewState;
  const getSnapshot = () => {
    const snapshot = database.getSnapshot();
    if (snapshot !== cachedDatabaseSnapshot) {
      cachedDatabaseSnapshot = snapshot;
      cachedViewState = viewStateFromDatabaseSnapshot(snapshot) ?? cachedViewState;
    }
    return cachedViewState;
  };
  return {
    close: () => database.close(),
    getSnapshot,
    subscribe: (listener: () => void) => database.subscribe(listener),
    update: async (
      workspace: WorkspaceState,
      update: (viewState: WorkspaceViewState) => WorkspaceViewState,
    ) => {
      if (database.getSnapshot().state === 'closed') return false;
      const receipt = await database.transact(
        { kind: 'patchpit.workspace.presence.update' },
        (snapshot) => {
          const current = viewStateFromTransactionSnapshot(snapshot);
          const next = update(reconcileWorkspaceViewState(workspace, current));
          return next === current ? snapshot : transactionWithViewState(snapshot, next);
        },
      );
      return receipt.outcome === 'committed';
    },
  };
};
