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
  join,
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

type Feature = {
  readonly id: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly viewportCell: string;
  readonly styleId: string;
  readonly assetId: string;
  readonly label: string;
};

type Style = {
  readonly id: string;
  readonly fill: string;
  readonly stroke: string;
  readonly zIndex: number;
};

type Presence = {
  readonly featureId: string;
  readonly peerId: string;
  readonly selected: boolean;
  readonly cursorX: number;
  readonly cursorY: number;
};

type BenchData = {
  readonly features: readonly Feature[];
  readonly styles: readonly Style[];
  readonly presence: readonly Presence[];
  readonly viewport: Viewport;
  readonly viewportCell: string;
};

type Viewport = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

type Sample = {
  readonly ms: number;
  readonly heapDeltaMb: number;
};

type BenchRow = {
  readonly scenario: string;
  readonly features: number;
  readonly visibleRows: number;
  readonly styles: number;
  readonly presenceRows: number;
  readonly source: string;
  readonly medianMs: string;
  readonly p95Ms: string;
  readonly maxMs: string;
  readonly rowsPerMs: string;
  readonly heapDeltaMb: string;
};

const STYLE_COUNT = 32;
const CELL_COLUMNS = 16;
const CELL_ROWS = 16;
const CELL_SIZE = 1_000;
const TARGET_CELL_X = 7;
const TARGET_CELL_Y = 11;
const TARGET_VIEWPORT_CELL = cellId(TARGET_CELL_X, TARGET_CELL_Y);
const TARGET_VIEWPORT: Viewport = {
  minX: TARGET_CELL_X * CELL_SIZE + 120,
  minY: TARGET_CELL_Y * CELL_SIZE + 140,
  maxX: TARGET_CELL_X * CELL_SIZE + 820,
  maxY: TARGET_CELL_Y * CELL_SIZE + 780
};

const schema = defineSchema({
  features: relation<Feature>({
    key: 'id',
    fields: {
      id: id('feature'),
      minX: number(),
      minY: number(),
      maxX: number(),
      maxY: number(),
      viewportCell: string(),
      styleId: ref('styles.id'),
      assetId: id('asset'),
      label: string()
    }
  }),
  styles: relation<Style>({
    key: 'id',
    fields: {
      id: id('style'),
      fill: string(),
      stroke: string(),
      zIndex: number()
    }
  }),
  presence: relation<Presence>({
    key: ['featureId', 'peerId'],
    ephemeral: true,
    fields: {
      featureId: ref('features.id'),
      peerId: id('peer'),
      selected: bool(),
      cursorX: number(),
      cursorY: number()
    }
  })
});

const feature = as(schema.features, 'feature');
const style = as(schema.styles, 'style');
const presence = as(schema.presence, 'presence');

const renderReadyRows = pipe(
  from(feature),
  where(eq(feature.viewportCell, TARGET_VIEWPORT_CELL)),
  join(from(style), eq(feature.styleId, style.id)),
  leftJoin(from(presence), eq(feature.id, presence.featureId)),
  project({
    featureId: feature.id,
    minX: feature.minX,
    minY: feature.minY,
    maxX: feature.maxX,
    maxY: feature.maxY,
    assetId: feature.assetId,
    label: feature.label,
    fill: style.fill,
    stroke: style.stroke,
    zIndex: style.zIndex,
    selected: maybe(presence.selected),
    peerId: maybe(presence.peerId)
  })
);

describe('tarstate geo benchmark', () => {
  it('reports geo-shaped render query latency and heap pressure', async () => {
    const rows: BenchRow[] = [];

    for (const size of [10_000, 50_000]) {
      const data = makeGeoData(size);
      rows.push(await benchHandBbox('hand bbox + map joins lower bound', data));
      rows.push(await benchQuery('tarstate cell filter + joins', data, 'scan', fromObjectSource));
      rows.push(await benchQuery('tarstate cell filter + joins', data, 'lookup hook', fromIndexedObjectSource));
    }

    console.table(rows);
    expect(rows.every((row) => Number(row.medianMs) > 0)).toBe(true);
  }, 120_000);
});

async function benchQuery(
  scenario: string,
  data: BenchData,
  sourceName: string,
  sourceFactory: typeof fromObjectSource
): Promise<BenchRow> {
  const samples: (Sample & { readonly visibleRows: number })[] = [];

  for (let index = 0; index < 5; index += 1) {
    samples.push(await runQueryOnce(data, sourceFactory));
  }

  return benchRow({
    scenario,
    source: sourceName,
    data,
    visibleRows: samples.at(-1)?.visibleRows ?? 0,
    samples
  });
}

async function runQueryOnce(
  data: BenchData,
  sourceFactory: typeof fromObjectSource
): Promise<Sample & { readonly visibleRows: number }> {
  const source = composeSources(
    sourceFactory({ features: data.features }),
    sourceFactory({ styles: data.styles }),
    sourceFactory({ presence: data.presence })
  );
  const beforeHeap = process.memoryUsage().heapUsed;
  const start = performance.now();
  const result = await evaluate(source, renderReadyRows);
  const ms = performance.now() - start;
  const afterHeap = process.memoryUsage().heapUsed;

  expect(result.diagnostics).toEqual([]);
  expect(result.rows).toHaveLength(data.features.filter((item) => item.viewportCell === data.viewportCell).length);

  return {
    ms,
    heapDeltaMb: (afterHeap - beforeHeap) / 1024 / 1024,
    visibleRows: result.rows.length
  };
}

async function benchHandBbox(scenario: string, data: BenchData): Promise<BenchRow> {
  const samples: Sample[] = [];
  let visibleRows = 0;

  for (let index = 0; index < 5; index += 1) {
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = handRenderRows(data);
    const ms = performance.now() - start;
    const afterHeap = process.memoryUsage().heapUsed;

    samples.push({ ms, heapDeltaMb: (afterHeap - beforeHeap) / 1024 / 1024 });
    visibleRows = result.length;
  }

  return benchRow({
    scenario,
    source: 'hand',
    data,
    visibleRows,
    samples
  });
}

function handRenderRows(data: BenchData): {
  readonly featureId: string;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly assetId: string;
  readonly label: string;
  readonly fill: string;
  readonly stroke: string;
  readonly zIndex: number;
  readonly selected: boolean | undefined;
  readonly peerId: string | undefined;
}[] {
  const stylesById = new Map(data.styles.map((item) => [item.id, item]));
  const presenceByFeatureId = new Map(data.presence.map((item) => [item.featureId, item]));

  return data.features.flatMap((item) => {
    if (!overlaps(item, data.viewport)) {
      return [];
    }

    const matchingStyle = stylesById.get(item.styleId);
    if (matchingStyle === undefined) {
      return [];
    }

    const matchingPresence = presenceByFeatureId.get(item.id);
    return [
      {
        featureId: item.id,
        minX: item.minX,
        minY: item.minY,
        maxX: item.maxX,
        maxY: item.maxY,
        assetId: item.assetId,
        label: item.label,
        fill: matchingStyle.fill,
        stroke: matchingStyle.stroke,
        zIndex: matchingStyle.zIndex,
        selected: matchingPresence?.selected,
        peerId: matchingPresence?.peerId
      }
    ];
  });
}

function benchRow(input: {
  readonly scenario: string;
  readonly source: string;
  readonly data: BenchData;
  readonly visibleRows: number;
  readonly samples: readonly Sample[];
}): BenchRow {
  const durations = input.samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const medianMs = percentile(durations, 0.5);
  const p95Ms = percentile(durations, 0.95);
  const maxMs = Math.max(...input.samples.map((sample) => sample.ms));
  const heapDeltaMb = Math.max(...input.samples.map((sample) => sample.heapDeltaMb));

  return {
    scenario: input.scenario,
    features: input.data.features.length,
    visibleRows: input.visibleRows,
    styles: input.data.styles.length,
    presenceRows: input.data.presence.length,
    source: input.source,
    medianMs: fixed(medianMs),
    p95Ms: fixed(p95Ms),
    maxMs: fixed(maxMs),
    rowsPerMs: fixed(input.visibleRows / medianMs),
    heapDeltaMb: fixed(heapDeltaMb)
  };
}

function makeGeoData(size: number): BenchData {
  const styles = Array.from({ length: STYLE_COUNT }, (_, index) => ({
    id: `style-${index}`,
    fill: `fill-${index % 8}`,
    stroke: `stroke-${index % 6}`,
    zIndex: index
  }));
  const features = Array.from({ length: size }, (_, index) => makeFeature(index));
  const targetRows = features.filter((item) => item.viewportCell === TARGET_VIEWPORT_CELL);
  const presenceRows = targetRows
    .filter((_, index) => index % 3 === 0)
    .slice(0, 750)
    .map((item, index) => ({
      featureId: item.id,
      peerId: `peer-${index % 24}`,
      selected: index % 2 === 0,
      cursorX: item.minX + 4,
      cursorY: item.minY + 6
    }));

  return {
    features,
    styles,
    presence: presenceRows,
    viewport: TARGET_VIEWPORT,
    viewportCell: TARGET_VIEWPORT_CELL
  };
}

function makeFeature(index: number): Feature {
  const cellX = (index * 17) % CELL_COLUMNS;
  const cellY = (index * 23 + Math.floor(index / CELL_COLUMNS)) % CELL_ROWS;
  const localX = (index * 37) % 840;
  const localY = (index * 53) % 840;
  const width = 24 + (index % 90);
  const height = 18 + (index % 110);
  const minX = cellX * CELL_SIZE + localX;
  const minY = cellY * CELL_SIZE + localY;

  return {
    id: `feature-${index}`,
    minX,
    minY,
    maxX: minX + width,
    maxY: minY + height,
    viewportCell: cellId(cellX, cellY),
    styleId: `style-${index % STYLE_COUNT}`,
    assetId: `asset-${index % 128}`,
    label: `Feature ${index}`
  };
}

function overlaps(feature: Feature, viewport: Viewport): boolean {
  return (
    feature.minX <= viewport.maxX &&
    feature.maxX >= viewport.minX &&
    feature.minY <= viewport.maxY &&
    feature.maxY >= viewport.minY
  );
}

function cellId(x: number, y: number): string {
  return `cell-${x}-${y}`;
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}
