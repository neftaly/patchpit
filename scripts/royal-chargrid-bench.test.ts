import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { RenderNodeKind, type RenderNode } from '@royal/renderer-core';
import {
  buildPickTargets,
  createGltfPickGeometry,
  createOrthographicUiScene,
  layoutWithYoga,
  pickTargetAtPoint,
  type CellGrid,
  type CellPoint,
  type CellRect,
  type GltfJson,
  type GltfPickGeometry,
  type LayoutBox,
  type PickTarget
} from '../apps/chargrid-lab/src/royalChargridPrimitives.js';
import {
  createKitchenSinkSpec,
  desktopGrid,
  mobileGrid
} from '../apps/chargrid-lab/src/yogaRoyal.js';

type LayoutBenchRow = {
  readonly scenario: string;
  readonly layoutP50Ms: string;
  readonly layoutP95Ms: string;
  readonly boxCount: number;
  readonly pickTargetCount: number;
  readonly integerCellViolations: number;
};

type RenderBenchRow = {
  readonly scenario: string;
  readonly sceneBuildP50Ms: string;
  readonly sceneBuildP95Ms: string;
  readonly renderNodeCount: number;
  readonly meshNodes: number;
  readonly vectorTextNodes: number;
  readonly gltfNodes: number;
  readonly directionalLightNodes: number;
};

type PickBenchRow = {
  readonly scenario: string;
  readonly samples: number;
  readonly totalMs: string;
  readonly samplesPerSecond: string;
  readonly p50Ms: string;
  readonly p95Ms: string;
  readonly p99Ms: string;
  readonly hits: number;
  readonly uniqueHitTargets: number;
};

type TimedSample<T> = {
  readonly ms: number;
  readonly value: T;
};

const layoutRuns = 13;
const renderRuns = 13;
const pickSamples = 1_024;

describe('Royal chargrid benchmark gates', () => {
  it('royal-chargrid-layout-kitchen-sink', () => {
    const rows: LayoutBenchRow[] = [
      benchLayoutScenario('desktop kitchen sink', desktopGrid, false),
      benchLayoutScenario('mobile kitchen sink', mobileGrid, true)
    ];

    console.table(rows);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.boxCount >= 14)).toBe(true);
    expect(rows.every((row) => row.pickTargetCount >= 8)).toBe(true);
    expect(rows.every((row) => row.integerCellViolations === 0)).toBe(true);
    expect(rows.every((row) => Number(row.layoutP95Ms) < 250)).toBe(true);
  });

  it('royal-chargrid-render-rows', () => {
    const rows: RenderBenchRow[] = [
      benchRenderScenario('desktop kitchen sink', desktopGrid, false),
      benchRenderScenario('mobile kitchen sink', mobileGrid, true)
    ];

    console.table(rows);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.renderNodeCount >= row.meshNodes + row.vectorTextNodes + row.gltfNodes)).toBe(true);
    expect(rows.every((row) => row.meshNodes > 0)).toBe(true);
    expect(rows.every((row) => row.vectorTextNodes >= 8)).toBe(true);
    expect(rows.every((row) => row.gltfNodes === 1)).toBe(true);
    expect(rows.every((row) => Number(row.sceneBuildP95Ms) < 250)).toBe(true);
  });

  it('royal-chargrid-picking-hot-path', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const targets = buildPickTargets(boxes);
    const geometryById = loadKitchenSinkGeometry(boxes);
    const points = deterministicPointerSamples(desktopGrid, targets, pickSamples);
    const timings: number[] = [];
    const hitTargetIds = new Set<string>();
    let hits = 0;

    const startedAt = performance.now();
    for (const point of points) {
      const sampleStartedAt = performance.now();
      const hit = pickTargetAtPoint(desktopGrid, boxes, targets, point, geometryById);
      timings.push(performance.now() - sampleStartedAt);

      if (hit !== undefined) {
        hits += 1;
        hitTargetIds.add(hit.target.id);
      }
    }

    const totalMs = performance.now() - startedAt;
    const sorted = timings.slice().sort((left: number, right: number) => left - right);
    const row: PickBenchRow = {
      scenario: 'desktop kitchen sink',
      samples: points.length,
      totalMs: fixed(totalMs),
      samplesPerSecond: fixed(points.length / Math.max(totalMs / 1000, 0.000001)),
      p50Ms: fixed(percentile(sorted, 0.5)),
      p95Ms: fixed(percentile(sorted, 0.95)),
      p99Ms: fixed(percentile(sorted, 0.99)),
      hits,
      uniqueHitTargets: hitTargetIds.size
    };

    console.table([row]);
    expect(points).toHaveLength(pickSamples);
    expect(targets.length).toBeGreaterThanOrEqual(8);
    expect(hits).toBeGreaterThan(0);
    expect(hitTargetIds.size).toBeGreaterThan(1);
    expect(Number(row.samplesPerSecond)).toBeGreaterThan(25);
    expect(Number(row.p99Ms)).toBeLessThan(250);
  }, 120_000);
});

function benchLayoutScenario(scenario: string, grid: CellGrid, compact: boolean): LayoutBenchRow {
  const samples = sampleTiming(layoutRuns, () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(compact), grid);
    const targets = buildPickTargets(boxes);
    return {
      boxes,
      integerCellViolations: countIntegerCellViolations(grid, boxes),
      targets
    };
  });
  const last = samples.at(-1)?.value;
  if (last === undefined) throw new Error(`No layout samples for ${scenario}`);

  const sorted = sortedMs(samples);
  return {
    scenario,
    layoutP50Ms: fixed(percentile(sorted, 0.5)),
    layoutP95Ms: fixed(percentile(sorted, 0.95)),
    boxCount: last.boxes.length,
    pickTargetCount: last.targets.length,
    integerCellViolations: last.integerCellViolations
  };
}

function benchRenderScenario(scenario: string, grid: CellGrid, compact: boolean): RenderBenchRow {
  const boxes = layoutWithYoga(createKitchenSinkSpec(compact), grid);
  const samples = sampleTiming(renderRuns, () => countRenderNodes(createOrthographicUiScene(grid, boxes).children[0]?.children ?? []));
  const last = samples.at(-1)?.value;
  if (last === undefined) throw new Error(`No render samples for ${scenario}`);

  const sorted = sortedMs(samples);
  return {
    scenario,
    sceneBuildP50Ms: fixed(percentile(sorted, 0.5)),
    sceneBuildP95Ms: fixed(percentile(sorted, 0.95)),
    renderNodeCount: last.total,
    meshNodes: last.byKind[RenderNodeKind.Mesh] ?? 0,
    vectorTextNodes: last.byKind[RenderNodeKind.VectorText] ?? 0,
    gltfNodes: last.byKind[RenderNodeKind.Gltf] ?? 0,
    directionalLightNodes: last.byKind[RenderNodeKind.DirectionalLight] ?? 0
  };
}

function sampleTiming<T>(runs: number, run: () => T): readonly TimedSample<T>[] {
  const samples: TimedSample<T>[] = [];

  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    const value = run();
    samples.push({
      ms: performance.now() - startedAt,
      value
    });
  }

  return samples;
}

function countIntegerCellViolations(grid: CellGrid, boxes: readonly LayoutBox[]): number {
  return boxes.reduce((violations, box) => {
    const coordinates = [box.x, box.y, box.width, box.height];
    const hasFractionalCell = coordinates.some((coordinate) => !Number.isInteger(coordinate));
    const escapesGrid =
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.width > grid.columns ||
      box.y + box.height > grid.rows;

    return violations + (hasFractionalCell || escapesGrid ? 1 : 0);
  }, 0);
}

function countRenderNodes(nodes: readonly RenderNode[]): {
  readonly byKind: Readonly<Partial<Record<RenderNodeKind, number>>>;
  readonly total: number;
} {
  const byKind: Partial<Record<RenderNodeKind, number>> = {};

  for (const node of nodes) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
  }

  return {
    byKind,
    total: nodes.length
  };
}

function deterministicPointerSamples(
  grid: CellGrid,
  targets: readonly PickTarget[],
  count: number
): readonly CellPoint[] {
  const random = createSeededRandom(0x6b17_2026);
  const samples: CellPoint[] = [];

  for (const target of targets) {
    samples.push(centerPoint(target.bounds.rect));
  }

  while (samples.length < count) {
    const target = targets[Math.floor(random() * targets.length)];
    if (target !== undefined && random() < 0.72) {
      samples.push(jitteredPointInRect(target.bounds.rect, random));
    } else {
      samples.push({
        x: random() * grid.columns,
        y: random() * grid.rows
      });
    }
  }

  return samples.slice(0, count);
}

function centerPoint(rect: CellRect): CellPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function jitteredPointInRect(rect: CellRect, random: () => number): CellPoint {
  return {
    x: rect.x + random() * Math.max(rect.width, 0.001),
    y: rect.y + random() * Math.max(rect.height, 0.001)
  };
}

function loadKitchenSinkGeometry(boxes: readonly LayoutBox[]): ReadonlyMap<string, GltfPickGeometry> {
  const geometryById = new Map<string, GltfPickGeometry>();
  const needsHelmet = boxes.some((box) => box.id === 'helmet' && box.primitive === 'gltfPreview');
  if (!needsHelmet) return geometryById;

  const gltfUrl = new URL('../fixtures/DamagedHelmet/DamagedHelmet.gltf', import.meta.url);
  const binUrl = new URL('../fixtures/DamagedHelmet/DamagedHelmet.bin', import.meta.url);
  const json = JSON.parse(readFileSync(gltfUrl, 'utf8')) as GltfJson;
  const bin = readFileSync(binUrl);
  const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  geometryById.set('helmet', createGltfPickGeometry(json, [buffer]));
  return geometryById;
}

function sortedMs(samples: readonly TimedSample<unknown>[]): readonly number[] {
  return samples.map((sample) => sample.ms).sort((left: number, right: number) => left - right);
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? 0;
}

function fixed(value: number): string {
  return value.toFixed(3);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}
