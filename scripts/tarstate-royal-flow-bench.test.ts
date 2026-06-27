import { describe, expect, it } from 'vitest';
import { evaluate } from '@tarstate/core';
import {
  createRoyalLensSnapshot,
  royalQueries,
  type CapabilityDiagnosticInput,
  type CapabilityRuntimeState,
  type EffectResultInput,
  type RoyalInteractionState,
  type RoyalLayoutRuntimeState,
  type RoyalLensStores,
  type RoyalPointerSampleInput,
  type WritableStore
} from '@royal/tarstate-lens';
import { buildPickTargets, layoutWithYoga } from '../apps/chargrid-lab/src/royalChargridPrimitives.js';
import { createKitchenSinkSpec, desktopGrid } from '../apps/chargrid-lab/src/yogaRoyal.js';

type BenchRow = {
  readonly scenario: string;
  readonly source: string;
  readonly events: number;
  readonly resultRows: number;
  readonly medianMs: string;
  readonly p95Ms: string;
  readonly maxMs: string;
  readonly heapDeltaMb: string;
};

type Sample = {
  readonly heapDeltaMb: number;
  readonly ms: number;
  readonly rows: number;
};

type BenchScenario = {
  readonly events: number;
  readonly name: string;
  readonly runDirect: () => number;
  readonly runTarstate: () => Promise<number>;
};

describe('tarstate Royal capability flow benchmark', () => {
  it('compares direct selectors with capability runtime plus tarstate projection', async () => {
    const rows: BenchRow[] = [];

    for (const scenario of makeScenarios()) {
      rows.push(await benchScenario(scenario, 'direct selectors', scenario.runDirect));
      rows.push(await benchScenario(scenario, 'capability runtime + tarstate', scenario.runTarstate));
    }

    console.table(rows);
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => Number(row.maxMs) >= 0)).toBe(true);
  }, 120_000);
});

function makeScenarios(): readonly BenchScenario[] {
  const stores = createScenarioStores();
  const coalesced = coalescePointerSamples(makePointerSamples(10_000, stores.layoutStore.getState()), 96);
  const highRateStores = createScenarioStores({
    capability: {
      diagnostics: coalesced.dropped === 0
        ? []
        : [
            {
              diagnosticId: 'diagnostic-pointer-drop',
              code: 'backpressure_dropped',
              capabilityId: 'capability:pointer',
              message: `coalesced ${coalesced.dropped} pointer samples`,
              relationName: 'pointerSamples',
              resourceId: 'canvas:main',
              resultId: 'result-pointer-drop',
              sequence: 10_000
            }
          ],
      intents: [],
      results: []
    },
    interaction: {
      pointerSamples: coalesced.samples
    }
  });
  const effectLoopStores = createScenarioStores({
    capability: makeEffectLoopState(1_000)
  });

  return [
    {
      name: 'fullscreen-ish low frequency effect result',
      events: 1,
      runDirect: () => directCapabilityResults(stores.capabilityStore.getState()),
      runTarstate: () => tarstateRows(stores, royalQueries.capabilityResultRows)
    },
    {
      name: 'pointer high-rate event coalescing',
      events: 10_000,
      runDirect: () => directPointerProbeRows(highRateStores.layoutStore.getState(), highRateStores.interactionStore.getState()),
      runTarstate: () => tarstateRows(highRateStores, royalQueries.pickProbeRows)
    },
    {
      name: 'Royal render state projection',
      events: stores.layoutStore.getState().boxes.length,
      runDirect: () => directRenderRows(stores.layoutStore.getState(), stores.interactionStore.getState()),
      runTarstate: () => tarstateRows(stores, royalQueries.renderRows)
    },
    {
      name: 'cross-store pointer target join',
      events: highRateStores.interactionStore.getState().pointerSamples.length,
      runDirect: () => directPointerProbeRows(highRateStores.layoutStore.getState(), highRateStores.interactionStore.getState()),
      runTarstate: () => tarstateRows(highRateStores, royalQueries.pickProbeRows)
    },
    {
      name: 'effect result loop fast resultId join',
      events: 1_000,
      runDirect: () => directCapabilityResults(effectLoopStores.capabilityStore.getState()),
      runTarstate: () => tarstateRows(effectLoopStores, royalQueries.capabilityResultRows)
    },
    {
      name: 'effect result loop scoped slow join',
      events: 1_000,
      runDirect: () => directCapabilityResults(effectLoopStores.capabilityStore.getState()),
      runTarstate: () => tarstateRows(effectLoopStores, royalQueries.scopedCapabilityResultRows)
    }
  ];
}

async function benchScenario(
  scenario: BenchScenario,
  source: string,
  run: () => number | Promise<number>
): Promise<BenchRow> {
  const samples: Sample[] = [];

  for (let index = 0; index < 7; index += 1) {
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    const rows = await run();
    const ms = performance.now() - start;
    const afterHeap = process.memoryUsage().heapUsed;

    expect(rows).toBeGreaterThanOrEqual(0);
    samples.push({
      heapDeltaMb: (afterHeap - beforeHeap) / 1024 / 1024,
      ms,
      rows
    });
  }

  const sorted = samples.map((sample) => sample.ms).sort((left, right) => left - right);

  return {
    scenario: scenario.name,
    source,
    events: scenario.events,
    resultRows: samples.at(-1)?.rows ?? 0,
    medianMs: fixed(percentile(sorted, 0.5)),
    p95Ms: fixed(percentile(sorted, 0.95)),
    maxMs: fixed(Math.max(...samples.map((sample) => sample.ms))),
    heapDeltaMb: fixed(Math.max(...samples.map((sample) => sample.heapDeltaMb)))
  };
}

async function tarstateRows<Row>(stores: RoyalLensStores, query: Parameters<typeof evaluate<Row>>[1]): Promise<number> {
  const snapshot = createRoyalLensSnapshot(stores);
  const result = await evaluate(snapshot.source, query);

  return result.rows.length;
}

function directRenderRows(layout: RoyalLayoutRuntimeState, interaction: RoyalInteractionState): number {
  const activeId = interaction.activeId;
  const focusedIds = new Set(
    [interaction.activeId, interaction.focusedId, interaction.hoveredId].filter((input): input is string => input !== undefined)
  );

  return layout.boxes.map((layoutBox) => ({
    boxId: layoutBox.id,
    active: activeId === layoutBox.id,
    focused: focusedIds.has(layoutBox.id),
    hovered: interaction.hoveredId === layoutBox.id
  })).length;
}

function directPointerProbeRows(layout: RoyalLayoutRuntimeState, interaction: RoyalInteractionState): number {
  const targetById = new Map(layout.pickTargets.map((target) => [target.id, target]));

  return interaction.pointerSamples.map((sample) => ({
    sampleId: sample.sampleId,
    targetRole: sample.targetId === undefined ? undefined : targetById.get(sample.targetId)?.interaction.role
  })).length;
}

function directCapabilityResults(capability: CapabilityRuntimeState): number {
  const diagnosticByResource = new Map(capability.diagnostics.map((diagnostic) => [diagnostic.resourceId, diagnostic]));

  return capability.results.map((result) => ({
    resultId: result.resultId,
    diagnosticCode: diagnosticByResource.get(result.resourceId)?.code
  })).length;
}

function createScenarioStores(overrides: {
  readonly capability?: Partial<CapabilityRuntimeState>;
  readonly interaction?: Partial<RoyalInteractionState>;
} = {}): {
  readonly capabilityStore: WritableStore<CapabilityRuntimeState>;
  readonly layoutStore: WritableStore<RoyalLayoutRuntimeState>;
  readonly interactionStore: WritableStore<RoyalInteractionState>;
} {
  const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
  const pickTargets = buildPickTargets(boxes);
  const capabilityBase = makeCapabilityState([
    {
      resultId: 'result-fullscreen',
      intentId: 'intent-fullscreen',
      capabilityId: 'capability:fullscreen',
      resourceId: 'canvas:main',
      status: 'failed',
      message: 'requestFullscreen requires activation',
      sequence: 2
    }
  ], [
    {
      diagnosticId: 'diagnostic-fullscreen',
      code: 'activation_required',
      capabilityId: 'capability:fullscreen',
      message: 'requestFullscreen requires activation',
      resourceId: 'canvas:main',
      resultId: 'result-fullscreen',
      sequence: 2
    }
  ]);

  return {
    capabilityStore: createStore<CapabilityRuntimeState>({
      ...capabilityBase,
      ...overrides.capability
    }),
    layoutStore: createStore<RoyalLayoutRuntimeState>({
      scopeId: 'royal',
      compact: false,
      grid: desktopGrid,
      boxes,
      pickTargets
    }),
    interactionStore: createStore<RoyalInteractionState>({
      scopeId: 'royal',
      activeId: 'button-primary',
      activationCount: 1,
      focusedId: 'button-primary',
      hoveredId: 'helmet',
      geometryFailures: [],
      geometryStatus: 'ready',
      pointerSamples: makePointerSamples(120, { scopeId: 'royal', compact: false, grid: desktopGrid, boxes, pickTargets }),
      ...overrides.interaction
    })
  };
}

function makeCapabilityState(
  results: readonly EffectResultInput[],
  diagnostics: readonly CapabilityDiagnosticInput[]
): CapabilityRuntimeState {
  return {
    scopeId: 'royal',
    diagnostics,
    intents: results.map((result) => ({
      intentId: result.intentId,
      capabilityId: result.capabilityId,
      kind: 'request_effect',
      resourceId: result.resourceId,
      payloadKind: 'opaque',
      sequence: result.sequence - 1
    })),
    results
  };
}

function makeEffectLoopState(size: number): CapabilityRuntimeState {
  const results: EffectResultInput[] = [];
  const diagnostics: CapabilityDiagnosticInput[] = [];

  for (let index = 0; index < size; index += 1) {
    const failed = index % 8 === 0;
    const resourceId = `resource:${index % 64}`;
    results.push({
      resultId: `result-${index}`,
      intentId: `intent-${index}`,
      capabilityId: 'capability:royal-render',
      resourceId,
      status: failed ? 'failed' : 'ok',
      ...(failed ? { message: 'resource was unavailable' } : {}),
      sequence: index * 2 + 1
    });

    if (failed) {
      diagnostics.push({
        diagnosticId: `diagnostic-${index}`,
        code: index % 16 === 0 ? 'resource_lost' : 'partial_failure',
        capabilityId: 'capability:royal-render',
        message: 'resource was unavailable',
        resourceId,
        resultId: `result-${index}`,
        sequence: index * 2 + 1
      });
    }
  }

  return makeCapabilityState(results, diagnostics);
}

function makePointerSamples(size: number, layout: RoyalLayoutRuntimeState): readonly RoyalPointerSampleInput[] {
  const targetIds = layout.pickTargets.map((target) => target.id);

  return Array.from({ length: size }, (_, index) => {
    const targetId = targetIds[index % Math.max(1, targetIds.length)];

    return {
      sampleId: `pointer-${index}`,
      sequence: index,
      kind: index % 24 === 0 ? 'down' : 'move',
      x: index % layout.grid.columns,
      y: (index * 3) % layout.grid.rows,
      targetId
    };
  });
}

function coalescePointerSamples(
  samples: readonly RoyalPointerSampleInput[],
  windowSize: number
): { readonly dropped: number; readonly samples: readonly RoyalPointerSampleInput[] } {
  return {
    dropped: Math.max(0, samples.length - windowSize),
    samples: samples.slice(Math.max(0, samples.length - windowSize))
  };
}

function createStore<State extends object>(initialState: State): WritableStore<State> {
  let state = initialState;

  return {
    getState: () => state,
    setState: (updater) => {
      state = typeof updater === 'function' ? (updater as (previous: State) => State)(state) : updater;
    }
  };
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}
