import { describe, expect, it } from 'vitest';
import {
  as,
  boolean as bool,
  composeSources,
  defineSchema,
  eq,
  evaluate,
  from,
  fromIndexedObjectSource,
  fromObjectSource,
  id,
  leftJoin,
  maybe,
  number,
  pipe,
  project,
  ref,
  relation,
  string,
  where
} from '../packages/tarstate/src/index.js';

type RendererResource = {
  readonly resourceId: string;
  readonly kind: string;
  readonly status: string;
  readonly frame: number;
};

type AppObject = {
  readonly objectId: string;
  readonly workspaceId: string;
  readonly rendererId: string;
  readonly title: string;
};

type StoreVisibility = {
  readonly objectId: string;
  readonly storeId: string;
  readonly visible: boolean;
};

type PointerWindow = {
  readonly windowId: string;
  readonly resourceId: string;
  readonly lastX: number;
  readonly lastY: number;
  readonly sampleCount: number;
  readonly droppedSamples: number;
};

type PointerEventRow = {
  readonly eventId: string;
  readonly resourceId: string;
  readonly x: number;
  readonly y: number;
  readonly time: number;
};

type EffectIntent = {
  readonly intentId: string;
  readonly resourceId: string;
  readonly kind: string;
  readonly requestedAt: number;
};

type EffectResult = {
  readonly intentId: string;
  readonly ok: boolean;
  readonly code: string;
  readonly completedAt: number;
};

type RuntimeDiagnostic = {
  readonly diagnosticId: string;
  readonly code: string;
  readonly targetId: string;
};

type BenchData = {
  readonly objects: readonly AppObject[];
  readonly resources: readonly RendererResource[];
  readonly visibility: readonly StoreVisibility[];
  readonly pointerEvents: readonly PointerSample[];
  readonly fullscreenIntents: readonly EffectIntent[];
};

type PointerSample = {
  readonly resourceId: string;
  readonly x: number;
  readonly y: number;
  readonly time: number;
};

type RawRenderer = {
  readonly rawHandleBrand: 'adapter-only-renderer';
  readonly rendererIndex: number;
  fullscreen: boolean;
};

type CapabilityProjectionRow = {
  readonly objectId: string;
  readonly title: string;
  readonly rendererStatus: string | undefined;
  readonly visible: boolean | undefined;
};

type Sample = {
  readonly ms: number;
  readonly outputRows: number;
};

type BenchRow = {
  readonly scenario: string;
  readonly source: string;
  readonly inputRows: number;
  readonly outputRows: number;
  readonly p50Ms: string;
  readonly p95Ms: string;
  readonly maxMs: string;
  readonly rowsPerMs: string;
};

const SAMPLE_COUNT = 7;
const NAIVE_SAMPLE_COUNT = 3;
const NAIVE_POINTER_REPLAY_LIMIT = 200;
const POINTER_WINDOW_SIZE = 16;
const POINTER_WINDOWS_LIMIT = 512;

const schema = defineSchema({
  appObjects: relation<AppObject>({
    key: 'objectId',
    fields: {
      objectId: id('object'),
      workspaceId: id('workspace'),
      rendererId: ref('rendererResources.resourceId'),
      title: string()
    }
  }),
  rendererResources: relation<RendererResource>({
    ephemeral: true,
    key: 'resourceId',
    fields: {
      resourceId: id('resource'),
      kind: string(),
      status: string(),
      frame: number()
    }
  }),
  storeVisibility: relation<StoreVisibility>({
    key: ['objectId', 'storeId'],
    fields: {
      objectId: ref('appObjects.objectId'),
      storeId: id('store'),
      visible: bool()
    }
  }),
  pointerWindows: relation<PointerWindow>({
    ephemeral: true,
    key: 'windowId',
    fields: {
      windowId: id('pointer-window'),
      resourceId: ref('rendererResources.resourceId'),
      lastX: number(),
      lastY: number(),
      sampleCount: number(),
      droppedSamples: number()
    }
  }),
  pointerEvents: relation<PointerEventRow>({
    ephemeral: true,
    key: 'eventId',
    fields: {
      eventId: id('pointer-event'),
      resourceId: ref('rendererResources.resourceId'),
      x: number(),
      y: number(),
      time: number()
    }
  }),
  effectIntents: relation<EffectIntent>({
    ephemeral: true,
    key: 'intentId',
    fields: {
      intentId: id('effect-intent'),
      resourceId: ref('rendererResources.resourceId'),
      kind: string(),
      requestedAt: number()
    }
  }),
  effectResults: relation<EffectResult>({
    ephemeral: true,
    key: 'intentId',
    fields: {
      intentId: ref('effectIntents.intentId'),
      ok: bool(),
      code: string(),
      completedAt: number()
    }
  }),
  diagnostics: relation<RuntimeDiagnostic>({
    ephemeral: true,
    key: 'diagnosticId',
    fields: {
      diagnosticId: id('diagnostic'),
      code: string(),
      targetId: string()
    }
  })
});

const object = as(schema.appObjects, 'object');
const resource = as(schema.rendererResources, 'resource');
const visibility = as(schema.storeVisibility, 'visibility');
const pointerEvent = as(schema.pointerEvents, 'pointerEvent');
const intent = as(schema.effectIntents, 'intent');
const result = as(schema.effectResults, 'result');

const visibleRendererRows = pipe(
  from(object),
  where(eq(object.workspaceId, 'workspace-main')),
  leftJoin(from(resource), eq(object.rendererId, resource.resourceId)),
  leftJoin(from(visibility), eq(object.objectId, visibility.objectId)),
  project({
    objectId: object.objectId,
    title: object.title,
    rendererStatus: maybe(resource.status),
    visible: maybe(visibility.visible)
  })
);

const fullscreenResultRows = pipe(
  from(intent),
  leftJoin(from(result), eq(intent.intentId, result.intentId)),
  project({
    intentId: intent.intentId,
    resourceId: intent.resourceId,
    code: maybe(result.code),
    ok: maybe(result.ok)
  })
);

const pointerEventProjectionRows = pipe(
  from(pointerEvent),
  leftJoin(from(resource), eq(pointerEvent.resourceId, resource.resourceId)),
  project({
    eventId: pointerEvent.eventId,
    resourceId: pointerEvent.resourceId,
    rendererStatus: maybe(resource.status),
    x: pointerEvent.x,
    y: pointerEvent.y
  })
);

describe('tarstate capability runtime benchmark', () => {
  it('reports direct lower bound versus non-leaky capability runtime plus tarstate projection', async () => {
    const rows: BenchRow[] = [];

    for (const size of [500, 2_000, 5_000]) {
      const data = makeData(size);

      rows.push(benchDirectProjection('cross-store renderer projection', data));
      rows.push(await benchCapabilityProjection('cross-store renderer projection', data, 'tarstate scan', fromObjectSource));
      rows.push(
        await benchCapabilityProjection(
          'cross-store renderer projection',
          data,
          'capability runtime + tarstate indexed',
          fromIndexedObjectSource
        )
      );
      rows.push(benchDirectPointerStream('high-rate pointer coalescing', data));
      rows.push(await benchNaiveCapabilityPointerStream('high-rate pointer full-snapshot replay', data));
      rows.push(benchCapabilityPointerStream('capability runtime pointer coalescing', data));
      rows.push(benchDirectEffectLoop('fullscreen effect result loop', data));
      rows.push(await benchNaiveCapabilityEffectLoop('fullscreen effect per-intent projection', data));
      rows.push(await benchCapabilityEffectLoop('capability runtime + tarstate result query', data));
    }

    console.table(rows);
    expect(rows.every((row) => row.outputRows > 0)).toBe(true);
    expect(rows.every((row) => Number(row.rowsPerMs) > 0)).toBe(true);
  }, 120_000);
});

async function benchCapabilityProjection(
  scenario: string,
  data: BenchData,
  source: string,
  sourceFactory: typeof fromObjectSource
): Promise<BenchRow> {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const runtime = CapabilityRuntime.fromSnapshot(data.resources);
    const sourceData = composeSources(
      sourceFactory({ appObjects: data.objects }),
      sourceFactory({ rendererResources: runtime.resourceRows() }),
      sourceFactory({ storeVisibility: data.visibility })
    );
    const start = performance.now();
    const evaluated = await evaluate(sourceData, visibleRendererRows);
    const ms = performance.now() - start;

    expect(evaluated.diagnostics).toEqual([]);
    samples.push({ ms, outputRows: evaluated.rows.length });
  }

  return benchRow({ scenario, source, inputRows: data.objects.length, samples });
}

function benchDirectProjection(scenario: string, data: BenchData): BenchRow {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    const rows = directProjection(data);
    const ms = performance.now() - start;

    samples.push({ ms, outputRows: rows.length });
  }

  return benchRow({ scenario, source: 'direct map/filter lower bound', inputRows: data.objects.length, samples });
}

function benchCapabilityPointerStream(scenario: string, data: BenchData): BenchRow {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const runtime = CapabilityRuntime.fromSnapshot(data.resources);
    const start = performance.now();
    runtime.ingestPointerSamples(data.pointerEvents, POINTER_WINDOW_SIZE, POINTER_WINDOWS_LIMIT);
    const ms = performance.now() - start;

    samples.push({ ms, outputRows: data.pointerEvents.length });
    expect(runtime.pointerWindowRows().length).toBeLessThanOrEqual(POINTER_WINDOWS_LIMIT);
  }

  return benchRow({ scenario, source: 'opaque registry + bounded windows', inputRows: data.pointerEvents.length, samples });
}

function benchDirectPointerStream(scenario: string, data: BenchData): BenchRow {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    const rows = coalescePointerSamples(data.pointerEvents, POINTER_WINDOW_SIZE, POINTER_WINDOWS_LIMIT);
    const ms = performance.now() - start;

    samples.push({ ms, outputRows: data.pointerEvents.length });
    expect(rows.length).toBeLessThanOrEqual(POINTER_WINDOWS_LIMIT);
  }

  return benchRow({ scenario, source: 'direct coalescing lower bound', inputRows: data.pointerEvents.length, samples });
}

async function benchNaiveCapabilityPointerStream(scenario: string, data: BenchData): Promise<BenchRow> {
  const samples: Sample[] = [];
  const replayRows = Math.min(data.pointerEvents.length, NAIVE_POINTER_REPLAY_LIMIT);

  for (let index = 0; index < NAIVE_SAMPLE_COUNT; index += 1) {
    const runtime = CapabilityRuntime.fromSnapshot(data.resources);
    const eventRows: PointerEventRow[] = [];
    const start = performance.now();

    for (let eventIndex = 0; eventIndex < replayRows; eventIndex += 1) {
      const event = data.pointerEvents[eventIndex];

      if (event === undefined) {
        continue;
      }

      eventRows.push({
        eventId: `event-${eventIndex}`,
        resourceId: event.resourceId,
        x: event.x,
        y: event.y,
        time: event.time
      });

      const sourceData = composeSources(
        fromObjectSource({ pointerEvents: eventRows }),
        fromObjectSource({ rendererResources: runtime.resourceRows() })
      );
      const evaluated = await evaluate(sourceData, pointerEventProjectionRows);
      expect(evaluated.diagnostics).toEqual([]);
    }

    const ms = performance.now() - start;
    samples.push({ ms, outputRows: replayRows });
  }

  return benchRow({
    scenario,
    source: 'naive full snapshot per event',
    inputRows: replayRows,
    samples
  });
}

async function benchCapabilityEffectLoop(scenario: string, data: BenchData): Promise<BenchRow> {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const runtime = CapabilityRuntime.fromSnapshot(data.resources);
    const start = performance.now();
    runtime.applyEffectIntents(data.fullscreenIntents);
    const sourceData = composeSources(
      fromIndexedObjectSource({ effectIntents: data.fullscreenIntents }),
      fromIndexedObjectSource({ effectResults: runtime.effectResultRows() })
    );
    const evaluated = await evaluate(sourceData, fullscreenResultRows);
    const ms = performance.now() - start;

    expect(evaluated.diagnostics).toEqual([]);
    samples.push({ ms, outputRows: evaluated.rows.length });
  }

  return benchRow({ scenario, source: 'opaque effect registry + tarstate indexed', inputRows: data.fullscreenIntents.length, samples });
}

async function benchNaiveCapabilityEffectLoop(scenario: string, data: BenchData): Promise<BenchRow> {
  const samples: Sample[] = [];

  for (let index = 0; index < NAIVE_SAMPLE_COUNT; index += 1) {
    const runtime = CapabilityRuntime.fromSnapshot(data.resources);
    const applied: EffectIntent[] = [];
    const start = performance.now();

    for (const effect of data.fullscreenIntents) {
      applied.push(effect);
      runtime.applyEffectIntents([effect]);

      const sourceData = composeSources(
        fromObjectSource({ effectIntents: applied }),
        fromObjectSource({ effectResults: runtime.effectResultRows() })
      );
      const evaluated = await evaluate(sourceData, fullscreenResultRows);
      expect(evaluated.diagnostics).toEqual([]);
    }

    const ms = performance.now() - start;
    samples.push({ ms, outputRows: data.fullscreenIntents.length });
  }

  return benchRow({
    scenario,
    source: 'naive per-intent snapshot query',
    inputRows: data.fullscreenIntents.length,
    samples
  });
}

function benchDirectEffectLoop(scenario: string, data: BenchData): BenchRow {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const renderers = new Map(data.resources.map((row, rendererIndex) => [row.resourceId, { rendererIndex, fullscreen: false }]));
    const start = performance.now();
    let okCount = 0;

    for (const effect of data.fullscreenIntents) {
      const renderer = renderers.get(effect.resourceId);
      if (renderer !== undefined) {
        renderer.fullscreen = true;
        okCount += 1;
      }
    }

    const ms = performance.now() - start;
    samples.push({ ms, outputRows: okCount });
  }

  return benchRow({ scenario, source: 'direct imperative lower bound', inputRows: data.fullscreenIntents.length, samples });
}

class CapabilityRuntime {
  private readonly registry = new Map<string, RawRenderer>();
  private readonly resources: RendererResource[];
  private readonly pointerWindows: PointerWindow[] = [];
  private readonly effectResults: EffectResult[] = [];
  private readonly diagnostics: RuntimeDiagnostic[] = [];

  static fromSnapshot(resources: readonly RendererResource[]): CapabilityRuntime {
    const runtime = new CapabilityRuntime(resources);

    for (const [rendererIndex, row] of resources.entries()) {
      runtime.registry.set(row.resourceId, {
        rawHandleBrand: 'adapter-only-renderer',
        rendererIndex,
        fullscreen: false
      });
    }

    return runtime;
  }

  private constructor(resources: readonly RendererResource[]) {
    this.resources = resources.map((row) => ({ ...row }));
  }

  resourceRows(): readonly RendererResource[] {
    return this.resources;
  }

  pointerWindowRows(): readonly PointerWindow[] {
    return this.pointerWindows;
  }

  effectResultRows(): readonly EffectResult[] {
    return this.effectResults;
  }

  diagnosticRows(): readonly RuntimeDiagnostic[] {
    return this.diagnostics;
  }

  ingestPointerSamples(
    samples: readonly PointerSample[],
    windowSize: number,
    maxWindows: number
  ): readonly PointerWindow[] {
    this.pointerWindows.splice(0, this.pointerWindows.length, ...coalescePointerSamples(samples, windowSize, maxWindows));
    return this.pointerWindows;
  }

  applyEffectIntents(intents: readonly EffectIntent[]): readonly EffectResult[] {
    for (const effect of intents) {
      const rawRenderer = this.registry.get(effect.resourceId);

      if (rawRenderer === undefined) {
        this.effectResults.push({
          intentId: effect.intentId,
          ok: false,
          code: 'resource_missing',
          completedAt: effect.requestedAt + 1
        });
        this.diagnostics.push({
          diagnosticId: `diagnostic-${effect.intentId}`,
          code: 'resource_missing',
          targetId: effect.resourceId
        });
        continue;
      }

      rawRenderer.fullscreen = effect.kind === 'fullscreen.request';
      this.effectResults.push({
        intentId: effect.intentId,
        ok: true,
        code: 'ok',
        completedAt: effect.requestedAt + 1
      });
    }

    return this.effectResults;
  }
}

function directProjection(data: BenchData): CapabilityProjectionRow[] {
  const resourceById = new Map(data.resources.map((row) => [row.resourceId, row]));
  const visibilityByObjectId = new Map(data.visibility.map((row) => [row.objectId, row.visible]));
  const output: CapabilityProjectionRow[] = [];

  for (const row of data.objects) {
    if (row.workspaceId !== 'workspace-main') {
      continue;
    }

    output.push({
      objectId: row.objectId,
      title: row.title,
      rendererStatus: resourceById.get(row.rendererId)?.status,
      visible: visibilityByObjectId.get(row.objectId)
    });
  }

  return output;
}

function coalescePointerSamples(
  samples: readonly PointerSample[],
  windowSize: number,
  maxWindows: number
): PointerWindow[] {
  const windows: PointerWindow[] = [];
  let droppedSamples = 0;

  for (let index = 0; index < samples.length; index += windowSize) {
    const windowSamples = samples.slice(index, index + windowSize);
    const last = windowSamples.at(-1);

    if (last === undefined) {
      continue;
    }

    if (windows.length >= maxWindows) {
      droppedSamples += windowSamples.length;
      continue;
    }

    windows.push({
      windowId: `pointer-window-${windows.length}`,
      resourceId: last.resourceId,
      lastX: last.x,
      lastY: last.y,
      sampleCount: windowSamples.length,
      droppedSamples
    });
    droppedSamples = 0;
  }

  if (droppedSamples > 0 && windows.length > 0) {
    const lastIndex = windows.length - 1;
    const lastWindow = windows[lastIndex];

    if (lastWindow !== undefined) {
      windows[lastIndex] = {
        ...lastWindow,
        droppedSamples: lastWindow.droppedSamples + droppedSamples
      };
    }
  }

  return windows;
}

function makeData(size: number): BenchData {
  const resources = Array.from({ length: Math.ceil(size / 4) }, (_, index) => ({
    resourceId: `renderer-${index}`,
    kind: 'webgl-renderer',
    status: index % 11 === 0 ? 'recovering' : 'ready',
    frame: index * 3
  }));
  const objects = Array.from({ length: size }, (_, index) => ({
    objectId: `object-${index}`,
    workspaceId: index % 5 === 0 ? 'workspace-other' : 'workspace-main',
    rendererId: resources[index % resources.length]?.resourceId ?? 'renderer-0',
    title: `Object ${index}`
  }));

  return {
    objects,
    resources,
    visibility: objects.map((row, index) => ({
      objectId: row.objectId,
      storeId: `store-${index % 7}`,
      visible: index % 3 !== 0
    })),
    pointerEvents: Array.from({ length: size * 10 }, (_, index) => ({
      resourceId: resources[index % resources.length]?.resourceId ?? 'renderer-0',
      x: index % 1920,
      y: (index * 3) % 1080,
      time: index
    })),
    fullscreenIntents: resources.slice(0, Math.max(1, Math.floor(resources.length / 3))).map((row, index) => ({
      intentId: `fullscreen-${index}`,
      resourceId: row.resourceId,
      kind: 'fullscreen.request',
      requestedAt: index
    }))
  };
}

function benchRow(input: {
  readonly scenario: string;
  readonly source: string;
  readonly inputRows: number;
  readonly samples: readonly Sample[];
}): BenchRow {
  const durations = input.samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const p50Ms = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const maxMs = Math.max(...durations);
  const outputRows = Math.max(...input.samples.map((sample) => sample.outputRows));

  return {
    scenario: input.scenario,
    source: input.source,
    inputRows: input.inputRows,
    outputRows,
    p50Ms: fixed(p50Ms),
    p95Ms: fixed(p95Ms),
    maxMs: fixed(maxMs),
    rowsPerMs: fixed(outputRows / p50Ms)
  };
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}
