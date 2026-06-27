import {
  composeSources,
  evaluate,
  fromObjectSource,
  type Query,
  type QueryResult,
  type RelationSource
} from '../../../packages/tarstate/src/index';
import type {
  CapabilityRow,
  DiagnosticRow,
  EffectIntentRow,
  EffectResultRow,
  EventRow,
  FullscreenRow,
  ResourceRow,
  ViewportRow
} from './schema';

export type CapabilityLabRows = {
  readonly resources: readonly ResourceRow[];
  readonly capabilities: readonly CapabilityRow[];
  readonly effectIntents: readonly EffectIntentRow[];
  readonly effectResults: readonly EffectResultRow[];
  readonly diagnostics: readonly DiagnosticRow[];
  readonly events: readonly EventRow[];
  readonly viewport: readonly ViewportRow[];
  readonly fullscreen: readonly FullscreenRow[];
};

export type CapabilityLabSnapshot = {
  readonly rows: CapabilityLabRows;
  readonly source: RelationSource;
};

export type CapabilityIntentInput = {
  readonly resourceId: string;
  readonly capabilityId: string;
  readonly kind: string;
  readonly payload?: unknown;
};

export type CapabilityLabStore = {
  readonly getState: () => CapabilityLabSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly dispatch: (intent: CapabilityIntentInput) => string;
  readonly query: <Row>(query: Query<Row>) => Promise<QueryResult<Row>>;
};

export type ResourceProbeRow = ResourceRow & {
  readonly latestResult: EffectResultRow | undefined;
};

export type CapabilityLabProbe = {
  readonly relationNames: readonly (keyof CapabilityLabRows)[];
  readonly fullscreenActive: boolean;
  readonly fullscreenAvailable: boolean;
  readonly fullscreenMode: FullscreenRow['mode'];
  readonly fullscreenActivationRequired: boolean;
  readonly fullscreenActivationActive: boolean;
  readonly fullscreenLastOutcome: NonNullable<FullscreenRow['lastOutcome']>;
  readonly resources: readonly ResourceProbeRow[];
  readonly diagnostics: readonly DiagnosticRow[];
  readonly recentEvents: readonly EventRow[];
  readonly recentResults: readonly EffectResultRow[];
};

export type CapabilityLabRawState = CapabilityLabRows & {
  readonly clock: number;
  readonly nextIntentSequence: number;
};

export type StoreController = {
  readonly appendDiagnostic: (input: Omit<DiagnosticRow, 'diagnosticId' | 'createdAt'>) => void;
  readonly appendEvent: (input: Omit<EventRow, 'eventId' | 'createdAt'>) => void;
  readonly appendResult: (input: Omit<EffectResultRow, 'resultId' | 'createdAt'>) => void;
  readonly markIntent: (intentId: string, status: EffectIntentRow['status']) => void;
  readonly replaceResource: (resource: ResourceRow) => void;
  readonly setFullscreen: (row: FullscreenRow) => void;
  readonly setViewport: (row: ViewportRow) => void;
  readonly updateResourceStatus: (resourceId: string, status: ResourceRow['status']) => void;
};

export type StoreBundle = {
  readonly store: CapabilityLabStore;
  readonly controller: StoreController;
};

type MutableRows = {
  resources: ResourceRow[];
  capabilities: CapabilityRow[];
  effectIntents: EffectIntentRow[];
  effectResults: EffectResultRow[];
  diagnostics: DiagnosticRow[];
  events: EventRow[];
  viewport: ViewportRow[];
  fullscreen: FullscreenRow[];
};

type MutableState = MutableRows & {
  clock: number;
  nextIntentSequence: number;
};

const maxEphemeralRows = 32;

export function createCapabilityLabStore(initialRows: CapabilityLabRows): StoreBundle {
  let state = mutableState(initialRows);
  const listeners = new Set<() => void>();

  const commit = (nextState: MutableState) => {
    state = nextState;
    for (const listener of listeners) {
      listener();
    }
  };

  const update = (change: (draft: MutableState) => void) => {
    const draft = cloneState(state);
    change(draft);
    commit(draft);
  };

  const snapshot = (): CapabilityLabSnapshot => {
    const rows = freezeRows(state);
    return {
      rows,
      source: composeSources(fromObjectSource(rows))
    };
  };

  const controller: StoreController = {
    appendDiagnostic: (input) => update((draft) => {
      draft.diagnostics.push({ ...input, diagnosticId: `diag-${draft.clock}`, createdAt: tick(draft) });
      draft.diagnostics = draft.diagnostics.slice(-maxEphemeralRows);
    }),
    appendEvent: (input) => update((draft) => {
      draft.events.push({ ...input, eventId: `event-${draft.clock}`, createdAt: tick(draft) });
      draft.events = draft.events.slice(-maxEphemeralRows);
    }),
    appendResult: (input) => update((draft) => {
      draft.effectResults.push({ ...input, resultId: `result-${draft.clock}`, createdAt: tick(draft) });
      draft.effectResults = draft.effectResults.slice(-maxEphemeralRows);
    }),
    markIntent: (intentId, status) => update((draft) => {
      draft.effectIntents = draft.effectIntents.map((intent) =>
        intent.intentId === intentId ? { ...intent, status } : intent
      );
    }),
    replaceResource: (resource) => update((draft) => {
      draft.resources = upsertBy(draft.resources, resource, 'resourceId');
    }),
    setFullscreen: (row) => update((draft) => {
      draft.fullscreen = upsertBy(draft.fullscreen, row, 'fullscreenId');
    }),
    setViewport: (row) => update((draft) => {
      draft.viewport = upsertBy(draft.viewport, row, 'viewportId');
    }),
    updateResourceStatus: (resourceId, status) => update((draft) => {
      draft.resources = draft.resources.map((resource) =>
        resource.resourceId === resourceId ? { ...resource, status } : resource
      );
    })
  };

  const store: CapabilityLabStore = {
    getState: snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (input) => {
      const intentId = `intent-${state.nextIntentSequence}`;
      update((draft) => {
        draft.effectIntents.push({
          intentId,
          resourceId: input.resourceId,
          capabilityId: input.capabilityId,
          kind: input.kind,
          payloadJson: stringifyPayload(input.payload),
          status: 'pending',
          createdAt: tick(draft)
        });
        draft.nextIntentSequence += 1;
      });
      return intentId;
    },
    query: async (query) => evaluate(snapshot().source, query)
  };

  return { store, controller };
}

export function createCapabilityLabProbe(snapshot: CapabilityLabSnapshot): CapabilityLabProbe {
  const latestResultByResource = new Map<string, EffectResultRow>();

  for (const result of snapshot.rows.effectResults) {
    latestResultByResource.set(result.resourceId, result);
  }

  const fullscreenRow = snapshot.rows.fullscreen[0];

  return {
    relationNames: Object.keys(snapshot.rows) as (keyof CapabilityLabRows)[],
    fullscreenActive: fullscreenRow?.active ?? false,
    fullscreenAvailable: fullscreenRow?.available ?? false,
    fullscreenMode: fullscreenRow?.mode ?? 'simulated',
    fullscreenActivationRequired: fullscreenRow?.activationRequired ?? false,
    fullscreenActivationActive: fullscreenRow?.activationActive ?? false,
    fullscreenLastOutcome: fullscreenRow?.lastOutcome ?? 'none',
    resources: snapshot.rows.resources.map((resource) => ({
      ...resource,
      latestResult: latestResultByResource.get(resource.resourceId)
    })),
    diagnostics: snapshot.rows.diagnostics,
    recentEvents: snapshot.rows.events.slice(-8),
    recentResults: snapshot.rows.effectResults.slice(-8)
  };
}

function mutableState(rows: CapabilityLabRows): MutableState {
  return {
    resources: [...rows.resources],
    capabilities: [...rows.capabilities],
    effectIntents: [...rows.effectIntents],
    effectResults: [...rows.effectResults],
    diagnostics: [...rows.diagnostics],
    events: [...rows.events],
    viewport: [...rows.viewport],
    fullscreen: [...rows.fullscreen],
    clock: 1,
    nextIntentSequence: rows.effectIntents.length + 1
  };
}

function cloneState(state: MutableState): MutableState {
  return {
    resources: [...state.resources],
    capabilities: [...state.capabilities],
    effectIntents: [...state.effectIntents],
    effectResults: [...state.effectResults],
    diagnostics: [...state.diagnostics],
    events: [...state.events],
    viewport: [...state.viewport],
    fullscreen: [...state.fullscreen],
    clock: state.clock,
    nextIntentSequence: state.nextIntentSequence
  };
}

function freezeRows(state: MutableState): CapabilityLabRows {
  return {
    resources: Object.freeze([...state.resources]),
    capabilities: Object.freeze([...state.capabilities]),
    effectIntents: Object.freeze([...state.effectIntents]),
    effectResults: Object.freeze([...state.effectResults]),
    diagnostics: Object.freeze([...state.diagnostics]),
    events: Object.freeze([...state.events]),
    viewport: Object.freeze([...state.viewport]),
    fullscreen: Object.freeze([...state.fullscreen])
  };
}

function tick(state: MutableState): number {
  const next = state.clock;
  state.clock += 1;
  return next;
}

function stringifyPayload(input: unknown): string {
  return input === undefined ? '{}' : JSON.stringify(input);
}

function upsertBy<Row extends Record<Key, string>, Key extends keyof Row>(
  rows: Row[],
  row: Row,
  key: Key
): Row[] {
  const index = rows.findIndex((candidate) => candidate[key] === row[key]);

  if (index === -1) {
    return [...rows, row];
  }

  const next = [...rows];
  next[index] = row;
  return next;
}
