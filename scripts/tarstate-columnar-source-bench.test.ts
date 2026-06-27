import { describe, expect, it } from 'vitest';
import { fromColumnarSource } from '../packages/tarstate/src/columnar-source.js';
import {
  as,
  eq,
  evaluate,
  from,
  fromIndexedObjectSource,
  fromObjectSource,
  leftJoin,
  maybe,
  pipe,
  project,
  type Query,
  type RelationSource
} from '../packages/tarstate/src/index.js';
import {
  royalLensSchema,
  type RoyalLayoutBoxRow,
  type RoyalPickProbeRow,
  type RoyalPickTargetRow,
  type RoyalPointerSampleRow,
  type RoyalRenderFlagRow,
  type RoyalRenderRow
} from '../packages/tarstate/src/royal-prototype.js';

type BenchData = {
  readonly layoutBoxes: readonly RoyalLayoutBoxRow[];
  readonly renderFlags: readonly RoyalRenderFlagRow[];
  readonly pickTargets: readonly RoyalPickTargetRow[];
  readonly pointerSamples: readonly RoyalPointerSampleRow[];
};

type BenchRow = {
  readonly scenario: string;
  readonly source: string;
  readonly inputRows: number;
  readonly supportRows: number;
  readonly outputRows: number;
  readonly p50Ms: string;
  readonly p95Ms: string;
  readonly maxMs: string;
  readonly rowsPerMs: string;
};

type QuerySpec<Row> = {
  readonly name: string;
  readonly query: Query<Row>;
  readonly direct: (data: BenchData) => readonly Row[];
  readonly supportRows: (data: BenchData) => number;
};

type Sample = {
  readonly ms: number;
  readonly rows: number;
};

const SAMPLE_COUNT = 4;
const SUPPORT_ROW_COUNT = 256;

const box = as(royalLensSchema.layoutBoxes, 'box');
const flag = as(royalLensSchema.renderFlags, 'flag');
const pointer = as(royalLensSchema.pointerSamples, 'pointer');
const target = as(royalLensSchema.pickTargets, 'target');

const renderRowsByBox = pipe(
  from(box),
  leftJoin(from(flag), eq(box.boxId, flag.boxId)),
  project({
    scopeId: box.scopeId,
    boxId: box.boxId,
    label: box.label,
    primitive: box.primitive,
    tone: box.tone,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    active: maybe(flag.active),
    focused: maybe(flag.focused),
    hovered: maybe(flag.hovered)
  })
) satisfies Query<RoyalRenderRow>;

const pointerProbeRowsByTarget = pipe(
  from(pointer),
  leftJoin(from(target), eq(pointer.targetId, target.targetId)),
  project({
    scopeId: pointer.scopeId,
    sampleId: pointer.sampleId,
    sequence: pointer.sequence,
    kind: pointer.kind,
    x: pointer.x,
    y: pointer.y,
    targetId: maybe(pointer.targetId),
    targetRole: maybe(target.role),
    targetLabel: maybe(target.label)
  })
) satisfies Query<RoyalPickProbeRow>;

const querySpecs: readonly QuerySpec<unknown>[] = [
  {
    name: 'Royal render rows by layout box',
    query: renderRowsByBox,
    direct: directRenderRows,
    supportRows: (data) => data.renderFlags.length
  },
  {
    name: 'Royal pointer probe rows by target',
    query: pointerProbeRowsByTarget,
    direct: directPointerProbeRows,
    supportRows: (data) => data.pickTargets.length
  }
];

describe('tarstate columnar source benchmark', () => {
  it('compares object rows, indexed object rows, and columnar rows for Royal-shaped hot paths', async () => {
    const rows: BenchRow[] = [];

    for (const size of [1_000, 10_000, 50_000]) {
      const data = makeData(size);

      for (const spec of querySpecs) {
        rows.push(benchDirect(spec, data));
        rows.push(await benchFresh(spec, data, 'object scan fresh', sourceFromObject));
        rows.push(await benchFresh(spec, data, 'object indexed fresh', sourceFromIndexedObject));
        rows.push(await benchFresh(spec, data, 'columnar fresh', sourceFromColumnar));
        rows.push(await benchWarm(spec, data, 'object scan warm', sourceFromObject));
        rows.push(await benchWarm(spec, data, 'object indexed warm', sourceFromIndexedObject));
        rows.push(await benchWarm(spec, data, 'columnar warm', sourceFromColumnar));
      }
    }

    console.table(rows);
    expect(rows.every((row) => Number(row.outputRows) > 0 && Number(row.maxMs) >= 0)).toBe(true);
  }, 180_000);
});

function benchDirect<Row>(spec: QuerySpec<Row>, data: BenchData): BenchRow {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    const result = spec.direct(data);
    const ms = performance.now() - start;
    samples.push({ ms, rows: result.length });
  }

  return benchRow(spec, data, 'hand Map lower bound', samples);
}

async function benchFresh<Row>(
  spec: QuerySpec<Row>,
  data: BenchData,
  source: string,
  sourceFactory: (data: BenchData) => RelationSource
): Promise<BenchRow> {
  const samples: Sample[] = [];

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    const result = await evaluate(sourceFactory(data), spec.query);
    const ms = performance.now() - start;

    expect(result.diagnostics).toEqual([]);
    samples.push({ ms, rows: result.rows.length });
  }

  return benchRow(spec, data, source, samples);
}

async function benchWarm<Row>(
  spec: QuerySpec<Row>,
  data: BenchData,
  source: string,
  sourceFactory: (data: BenchData) => RelationSource
): Promise<BenchRow> {
  const samples: Sample[] = [];
  const sourceData = sourceFactory(data);

  await evaluate(sourceData, spec.query);

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now();
    const result = await evaluate(sourceData, spec.query);
    const ms = performance.now() - start;

    expect(result.diagnostics).toEqual([]);
    samples.push({ ms, rows: result.rows.length });
  }

  return benchRow(spec, data, source, samples);
}

function benchRow<Row>(
  spec: QuerySpec<Row>,
  data: BenchData,
  source: string,
  samples: readonly Sample[]
): BenchRow {
  const durations = samples.map((sample) => sample.ms).sort((left, right) => left - right);
  const p50Ms = percentile(durations, 0.5);
  const outputRows = samples.at(-1)?.rows ?? 0;

  return {
    scenario: spec.name,
    source,
    inputRows: data.layoutBoxes.length,
    supportRows: spec.supportRows(data),
    outputRows,
    p50Ms: fixed(p50Ms),
    p95Ms: fixed(percentile(durations, 0.95)),
    maxMs: fixed(Math.max(...durations)),
    rowsPerMs: fixed(outputRows / Math.max(0.001, p50Ms))
  };
}

function sourceFromObject(data: BenchData): RelationSource {
  return fromObjectSource(sourceData(data));
}

function sourceFromIndexedObject(data: BenchData): RelationSource {
  return fromIndexedObjectSource(sourceData(data));
}

function sourceFromColumnar(data: BenchData): RelationSource {
  return fromColumnarSource([
    { relation: royalLensSchema.layoutBoxes, rows: data.layoutBoxes },
    { relation: royalLensSchema.renderFlags, rows: data.renderFlags },
    { relation: royalLensSchema.pickTargets, rows: data.pickTargets },
    { relation: royalLensSchema.pointerSamples, rows: data.pointerSamples }
  ]);
}

function sourceData(data: BenchData): Record<string, readonly unknown[]> {
  return {
    layoutBoxes: data.layoutBoxes,
    renderFlags: data.renderFlags,
    pickTargets: data.pickTargets,
    pointerSamples: data.pointerSamples
  };
}

function directRenderRows(data: BenchData): readonly RoyalRenderRow[] {
  const flagsByBoxId = new Map(data.renderFlags.map((row) => [row.boxId, row]));

  return data.layoutBoxes.map((row) => {
    const matchingFlag = flagsByBoxId.get(row.boxId);

    return {
      scopeId: row.scopeId,
      boxId: row.boxId,
      label: row.label,
      primitive: row.primitive,
      tone: row.tone,
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      active: matchingFlag?.active,
      focused: matchingFlag?.focused,
      hovered: matchingFlag?.hovered
    };
  });
}

function directPointerProbeRows(data: BenchData): readonly RoyalPickProbeRow[] {
  const targetById = new Map(data.pickTargets.map((row) => [row.targetId, row]));

  return data.pointerSamples.map((row) => {
    const matchingTarget = row.targetId === undefined ? undefined : targetById.get(row.targetId);

    return {
      scopeId: row.scopeId,
      sampleId: row.sampleId,
      sequence: row.sequence,
      kind: row.kind,
      x: row.x,
      y: row.y,
      targetId: row.targetId,
      targetRole: matchingTarget?.role,
      targetLabel: matchingTarget?.label
    };
  });
}

function makeData(size: number): BenchData {
  const supportRows = Math.min(size, SUPPORT_ROW_COUNT);

  return {
    layoutBoxes: Array.from({ length: size }, (_, index) => layoutBox(index)),
    renderFlags: Array.from({ length: supportRows }, (_, index) => renderFlag(index)),
    pickTargets: Array.from({ length: supportRows }, (_, index) => pickTarget(index)),
    pointerSamples: Array.from({ length: size }, (_, index) => pointerSample(index, supportRows))
  };
}

function layoutBox(index: number): RoyalLayoutBoxRow {
  return {
    scopeId: 'royal',
    boxId: `box-${index}`,
    x: index % 120,
    y: Math.floor(index / 120),
    width: 2 + (index % 5),
    height: 1 + (index % 3),
    label: `Box ${index}`,
    primitive: index % 3 === 0 ? 'button' : 'panel',
    tone: index % 2 === 0 ? 'primary' : 'neutral',
    hasInteraction: index % 4 !== 0,
    ...(index % 7 === 0 ? { text: `Copy ${index}` } : {}),
    ...(index % 13 === 0 ? { assetId: `asset-${index}` } : {})
  };
}

function renderFlag(index: number): RoyalRenderFlagRow {
  return {
    scopeId: 'royal',
    boxId: `box-${index}`,
    active: index % 17 === 0,
    focused: index % 11 === 0,
    hovered: index % 5 === 0
  };
}

function pickTarget(index: number): RoyalPickTargetRow {
  return {
    scopeId: 'royal',
    targetId: `target-${index}`,
    boxId: `box-${index}`,
    x: index % 120,
    y: Math.floor(index / 120),
    width: 3,
    height: 2,
    role: index % 2 === 0 ? 'button' : 'slider',
    label: `Target ${index}`,
    layer: index % 4,
    disabled: index % 19 === 0,
    ...(index % 9 === 0 ? { group: 'toolbar' } : {})
  };
}

function pointerSample(index: number, supportRows: number): RoyalPointerSampleRow {
  return {
    scopeId: 'royal',
    sampleId: `pointer-${index}`,
    sequence: index,
    kind: index % 23 === 0 ? 'down' : 'move',
    x: index % 120,
    y: Math.floor(index / 120),
    ...(index % 29 === 0 ? {} : { targetId: `target-${index % supportRows}` })
  };
}

function percentile(values: readonly number[], percentileValue: number): number {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * percentileValue))] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(2);
}
