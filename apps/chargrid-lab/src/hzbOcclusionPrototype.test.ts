import { describe, expect, it } from 'vitest';
import {
  hzbDepthCellKey,
  runHzbOcclusionPrototype,
  type HzbBenchmarkCounterName,
  type HzbDepthCellRow,
  type HzbOcclusionPrototypeRows,
  type HzbVisibilityResultRow
} from './hzbOcclusionPrototype';

describe('Royal HZB occlusion prototype', () => {
  it('builds deterministic hierarchical depth rows from cell-space occluders', () => {
    const rows = runHzbOcclusionPrototype({
      candidates: [],
      frame: 7,
      grid: { columns: 8, rows: 4 },
      occluders: [
        { frontZ: 10, height: 4, occluderId: 'left-wall', width: 4, x: 0, y: 0 }
      ],
      scopeId: 'royal-test'
    });

    expect(rows.hzb_frame_input).toEqual([
      {
        baseCellSize: 1,
        baseColumns: 8,
        baseRows: 4,
        columns: 8,
        depthConvention: 'larger-front-z-wins',
        frame: 7,
        levelCount: 4,
        relation: 'hzb_frame_input',
        rows: 4,
        scopeId: 'royal-test'
      }
    ]);
    expect(levelCounts(rows)).toEqual([
      [0, 32],
      [1, 8],
      [2, 2],
      [3, 1]
    ]);

    expect(depthCell(rows, 'l1:x0:y0')).toMatchObject({
      coveredBaseCells: 4,
      coverageRatio: 1,
      frontZ: 10,
      fullyCovered: true,
      height: 2,
      minFrontZ: 10,
      occluderIds: ['left-wall'],
      totalBaseCells: 4,
      width: 2,
      x: 0,
      y: 0
    });
    expect(depthCell(rows, 'l1:x3:y1')).toMatchObject({
      coveredBaseCells: 0,
      coverageRatio: 0,
      frontZ: null,
      fullyCovered: false,
      minFrontZ: null,
      totalBaseCells: 4,
      x: 6,
      y: 2
    });
    expect(depthCell(rows, 'l3:x0:y0')).toMatchObject({
      coveredBaseCells: 16,
      coverageRatio: 0.5,
      frontZ: 10,
      fullyCovered: false,
      minFrontZ: 10,
      totalBaseCells: 32
    });
    expect(counterValue(rows, 'depth_cell_rows')).toBe(43);
    expect(counterValue(rows, 'pyramid_levels')).toBe(4);
  });

  it('culls only candidates fully covered by a front occluder', () => {
    const rows = runHzbOcclusionPrototype({
      candidates: [
        { candidateId: 'hidden-panel', height: 4, nearZ: 5, width: 4, x: 0, y: 0 },
        { candidateId: 'peeking-panel', height: 4, nearZ: 5, width: 2, x: 3, y: 0 },
        { candidateId: 'front-panel', height: 4, nearZ: 12, width: 4, x: 0, y: 0 }
      ],
      grid: { columns: 8, rows: 4 },
      occluders: [
        { frontZ: 10, height: 4, occluderId: 'left-wall', width: 4, x: 0, y: 0 }
      ]
    });
    const results = resultsById(rows);

    expect(results.get('hidden-panel')).toMatchObject({
      blockerFrontZ: 10,
      occluded: true,
      reason: 'all_samples_blocked',
      sampleCount: 1,
      selectedLevel: 2,
      visible: false
    });
    expect(results.get('peeking-panel')).toMatchObject({
      blockerFrontZ: 10,
      occluded: false,
      reason: 'uncovered_sample',
      sampleCount: 2,
      selectedLevel: 2,
      visible: true
    });
    expect(rows.hzb_occlusion_query.find((row) => row.candidateId === 'peeking-panel')).toMatchObject({
      blockingSamples: 1,
      failedCellKey: 'l2:x1:y0',
      fullyCoveredSamples: 1
    });
    expect(results.get('front-panel')).toMatchObject({
      blockerFrontZ: null,
      occluded: false,
      reason: 'depth_in_front',
      sampleCount: 1,
      selectedLevel: 2,
      visible: true
    });
    expect(counterValue(rows, 'query_cell_tests')).toBe(4);
    expect(counterValue(rows, 'occluded_results')).toBe(1);
    expect(counterValue(rows, 'visible_results')).toBe(2);
  });

  it('emits tarstate-friendly row groups, diagnostics, and benchmark counters', () => {
    const rows = runHzbOcclusionPrototype({
      candidates: [
        { candidateId: 'clipped-candidate', farZ: 0, height: 4, nearZ: 1, width: 4, x: 2, y: 2 },
        { candidateId: 'inverted-depth', farZ: 3, height: 1, nearZ: 2, width: 1, x: 0, y: 0 }
      ],
      frame: 3,
      grid: { columns: 4, rows: 4 },
      occluders: [
        { frontZ: 7, height: 4, occluderId: 'clipped-left-wall', width: 2, x: -1, y: 0 },
        { frontZ: 5, height: 1, occluderId: 'outside-wall', width: 1, x: 10, y: 10 },
        { frontZ: 100, height: 4, occluderId: 'transparent-pane', opaque: false, width: 4, x: 0, y: 0 }
      ],
      scopeId: 'rows-scope'
    });

    expect(Object.keys(rows).sort()).toEqual([
      'hzb_benchmark_counter',
      'hzb_candidate_input',
      'hzb_depth_cell',
      'hzb_diagnostic',
      'hzb_frame_input',
      'hzb_occluder_input',
      'hzb_occlusion_query',
      'hzb_visibility_result'
    ]);
    expect(rows.hzb_candidate_input).toHaveLength(2);
    expect(rows.hzb_occluder_input).toHaveLength(3);
    expect(rows.hzb_occlusion_query).toHaveLength(2);
    expect(rows.hzb_visibility_result).toHaveLength(2);
    expect(rows.hzb_diagnostic.map((diagnostic) => diagnostic.code).sort()).toEqual([
      'hzb_candidate_clipped',
      'hzb_candidate_depth_inversion',
      'hzb_empty_occluder',
      'hzb_occluder_clipped'
    ]);
    expect(rows.hzb_diagnostic.every((diagnostic) => diagnostic.relation === 'hzb_diagnostic')).toBe(true);
    expect(counterValue(rows, 'candidate_input_rows')).toBe(2);
    expect(counterValue(rows, 'diagnostic_rows')).toBe(4);
    expect(counterValue(rows, 'occluder_input_rows')).toBe(3);
    expect(counterValue(rows, 'raster_cell_tests')).toBe(4);
    expect(counterValue(rows, 'query_cell_tests')).toBe(2);
    expect(resultsById(rows).get('inverted-depth')).toMatchObject({
      occluded: true,
      reason: 'all_samples_blocked'
    });
  });
});

function depthCell(rows: HzbOcclusionPrototypeRows, key: string): HzbDepthCellRow {
  const row = rows.hzb_depth_cell.find((cell) => hzbDepthCellKey(cell) === key);
  if (row === undefined) throw new Error(`Expected depth cell ${key}`);
  return row;
}

function levelCounts(rows: HzbOcclusionPrototypeRows): readonly (readonly [number, number])[] {
  const counts = new Map<number, number>();

  for (const row of rows.hzb_depth_cell) {
    counts.set(row.level, (counts.get(row.level) ?? 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) => left - right);
}

function counterValue(rows: HzbOcclusionPrototypeRows, counter: HzbBenchmarkCounterName): number {
  const row = rows.hzb_benchmark_counter.find((candidate) => candidate.counter === counter);
  if (row === undefined) throw new Error(`Expected counter ${counter}`);
  return row.value;
}

function resultsById(rows: HzbOcclusionPrototypeRows): ReadonlyMap<string, HzbVisibilityResultRow> {
  return new Map(rows.hzb_visibility_result.map((row) => [row.candidateId, row]));
}
