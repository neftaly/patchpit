import { ExternalStoreRuntime, type AtomicExternalStore } from '@tarstate/core/database/external-store';
import {
  workspacePresenceSourceMetadata,
  type WorkspacePresencePaneRelationRow,
  type WorkspacePresencePreviewRelationRow,
  type WorkspacePresenceSessionRelationRow,
} from '@patchpit/artifacts';
import {
  createWorkspaceViewState,
  reconcileWorkspaceViewState,
  type WorkspaceViewState,
} from './view-state.ts';
import type { WorkspacePaneId, WorkspaceState } from './durable-state.ts';

type WorkspacePresenceStorage = {
  readonly '@patchpit': typeof workspacePresenceSourceMetadata;
  readonly session: Omit<WorkspacePresenceSessionRelationRow, 'id'>;
  readonly panes: Readonly<Record<WorkspacePaneId, Omit<WorkspacePresencePaneRelationRow, 'paneId'>>>;
  readonly previews: Readonly<Record<WorkspacePaneId, Omit<WorkspacePresencePreviewRelationRow, 'paneId'>>>;
};

export const openWorkspacePresence = (options: {
  readonly sourceId: string;
  readonly workspace: WorkspaceState;
  readonly activePaneId?: WorkspacePaneId | null;
}) => {
  const initialViewState = createWorkspaceViewState(options.workspace, options.activePaneId);
  const store = createAtomicStore(presenceStorageFromViewState(initialViewState));
  const runtime = new ExternalStoreRuntime(options.sourceId, store);
  let cachedStorage = store.getState();
  let cachedViewState = initialViewState;
  const getSnapshot = () => {
    const storage = store.getState();
    if (storage !== cachedStorage) {
      cachedStorage = storage;
      cachedViewState = viewStateFromPresenceStorage(storage);
    }
    return cachedViewState;
  };
  return {
    getSnapshot,
    subscribe: (listener: () => void) => runtime.subscribe(listener),
    update: (workspace: WorkspaceState, update: (viewState: WorkspaceViewState) => WorkspaceViewState) => {
      const snapshot = runtime.snapshot();
      if (snapshot.state !== 'ready' || snapshot.storage === undefined) return false;
      const result = runtime.commit(snapshot.basis, (current) => {
        const currentViewState = current === cachedStorage
          ? cachedViewState
          : viewStateFromPresenceStorage(current);
        const reconciled = reconcileWorkspaceViewState(workspace, currentViewState);
        const next = update(reconciled);
        const changed = next !== currentViewState;
        return {
          state: changed ? presenceStorageFromViewState(next) : current,
          changed,
          result: changed,
        };
      });
      return result.outcome === 'committed' && result.result;
    },
    close: () => runtime.close(),
  };
};

// Temporary black-box lowering for Tarstate's missing relational external-store
// opener. Patchpit owns this product shape; generic projection and transaction
// machinery must replace this conversion rather than grow alongside it.
const presenceStorageFromViewState = (viewState: WorkspaceViewState): WorkspacePresenceStorage => {
  const panes = Object.entries(viewState.panes);
  return {
    '@patchpit': workspacePresenceSourceMetadata,
    session: { activePaneId: viewState.activePaneId },
    panes: Object.fromEntries(panes.map(([paneId, pane]) => [
      paneId,
      { activeContextId: pane.activeContextId },
    ])),
    previews: Object.fromEntries(panes.flatMap(([paneId, pane]) => pane.preview === null
      ? []
      : [[paneId, { contextId: pane.preview.contextId, url: pane.preview.url }]])),
  };
};

const viewStateFromPresenceStorage = (storage: WorkspacePresenceStorage): WorkspaceViewState => ({
  activePaneId: storage.session.activePaneId,
  panes: Object.fromEntries(Object.entries(storage.panes).map(([paneId, pane]) => {
    const preview = storage.previews[paneId];
    return [paneId, {
      activeContextId: pane.activeContextId,
      preview: preview === undefined ? null : {
        contextId: preview.contextId,
        url: preview.url,
      },
    }];
  })),
});

const createAtomicStore = <State>(initial: State): AtomicExternalStore<State> => {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update: (apply) => {
      const result = apply(state);
      if (result.changed) {
        state = result.state;
        for (const listener of listeners) listener();
      }
      return result.result;
    },
  };
};
