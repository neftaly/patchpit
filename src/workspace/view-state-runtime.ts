import { ExternalStoreRuntime, type AtomicExternalStore } from '@tarstate/core/database/external-store';
import {
  createWorkspaceViewState,
  reconcileWorkspaceViewState,
  type WorkspaceViewState,
} from './view-state.ts';
import type { WorkspacePaneId, WorkspaceState } from './durable-state.ts';

export const openWorkspaceViewState = (options: {
  readonly sourceId: string;
  readonly workspace: WorkspaceState;
  readonly activePaneId?: WorkspacePaneId | null;
}) => {
  const store = createAtomicStore(createWorkspaceViewState(options.workspace, options.activePaneId));
  const runtime = new ExternalStoreRuntime(options.sourceId, store);
  const getSnapshot = () => runtime.snapshot().storage!;
  return {
    sourceId: options.sourceId,
    getSnapshot,
    subscribe: (listener: () => void) => runtime.subscribe(listener),
    update: (workspace: WorkspaceState, update: (viewState: WorkspaceViewState) => WorkspaceViewState) => {
      const snapshot = runtime.snapshot();
      if (snapshot.state !== 'ready' || snapshot.storage === undefined) return false;
      const result = runtime.commit(snapshot.basis, (current) => {
        const reconciled = reconcileWorkspaceViewState(workspace, current);
        const next = update(reconciled);
        return { state: next, changed: next !== current, result: next !== current };
      });
      return result.outcome === 'committed' && result.result;
    },
    close: () => runtime.close(),
  };
};

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
