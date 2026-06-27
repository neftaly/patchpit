export type HzbDepthConvention = 'larger-front-z-wins';

export type HzbRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type HzbGridInput = {
  readonly baseCellSize?: number;
  readonly columns: number;
  readonly rows: number;
};

export type HzbOccluderInput = HzbRect & {
  readonly frontZ: number;
  readonly occluderId: string;
  readonly opaque?: boolean;
};

export type HzbCandidateInput = HzbRect & {
  readonly candidateId: string;
  readonly depthBias?: number;
  readonly farZ?: number;
  readonly maxQueryLevel?: number;
  readonly nearZ: number;
};

export type HzbOcclusionPrototypeInput = {
  readonly candidates: readonly HzbCandidateInput[];
  readonly frame?: number;
  readonly grid: HzbGridInput;
  readonly maxQueryLevel?: number;
  readonly occluders: readonly HzbOccluderInput[];
  readonly scopeId?: string;
};

export type HzbFrameInputRow = {
  readonly baseCellSize: number;
  readonly baseColumns: number;
  readonly baseRows: number;
  readonly columns: number;
  readonly depthConvention: HzbDepthConvention;
  readonly frame: number;
  readonly levelCount: number;
  readonly relation: 'hzb_frame_input';
  readonly rows: number;
  readonly scopeId: string;
};

export type HzbOccluderInputRow = HzbRect & {
  readonly frontZ: number;
  readonly frame: number;
  readonly occluderId: string;
  readonly opaque: boolean;
  readonly ordinal: number;
  readonly relation: 'hzb_occluder_input';
  readonly scopeId: string;
};

export type HzbCandidateInputRow = HzbRect & {
  readonly candidateId: string;
  readonly depthBias: number;
  readonly farZ: number | null;
  readonly frame: number;
  readonly maxQueryLevel: number | null;
  readonly nearZ: number;
  readonly ordinal: number;
  readonly relation: 'hzb_candidate_input';
  readonly scopeId: string;
};

export type HzbDepthCellRow = HzbRect & {
  readonly cellX: number;
  readonly cellY: number;
  readonly coveredBaseCells: number;
  readonly coverageRatio: number;
  readonly frame: number;
  readonly frontZ: number | null;
  readonly fullyCovered: boolean;
  readonly level: number;
  readonly minFrontZ: number | null;
  readonly occluderIds: readonly string[];
  readonly relation: 'hzb_depth_cell';
  readonly scopeId: string;
  readonly totalBaseCells: number;
};

export type HzbOcclusionReason =
  | 'all_samples_blocked'
  | 'depth_in_front'
  | 'no_occluders'
  | 'outside_grid'
  | 'uncovered_sample';

export type HzbOcclusionQueryRow = {
  readonly blockerFrontZ: number | null;
  readonly blockingSamples: number;
  readonly candidateId: string;
  readonly coveredSamples: number;
  readonly coverageRatio: number;
  readonly failedCellKey: string | null;
  readonly frame: number;
  readonly fullyCoveredSamples: number;
  readonly reason: HzbOcclusionReason;
  readonly relation: 'hzb_occlusion_query';
  readonly sampleCount: number;
  readonly scopeId: string;
  readonly selectedLevel: number;
};

export type HzbVisibilityResultRow = HzbRect & {
  readonly blockerFrontZ: number | null;
  readonly candidateId: string;
  readonly frame: number;
  readonly occluded: boolean;
  readonly reason: HzbOcclusionReason;
  readonly relation: 'hzb_visibility_result';
  readonly sampleCount: number;
  readonly scopeId: string;
  readonly selectedLevel: number;
  readonly visible: boolean;
};

export type HzbDiagnosticCode =
  | 'hzb_candidate_clipped'
  | 'hzb_candidate_depth_inversion'
  | 'hzb_empty_candidate'
  | 'hzb_empty_occluder'
  | 'hzb_no_occluders'
  | 'hzb_occluder_clipped';

export type HzbDiagnosticSourceRelation =
  | 'hzb_candidate_input'
  | 'hzb_depth_cell'
  | 'hzb_frame_input'
  | 'hzb_occluder_input'
  | 'hzb_occlusion_query'
  | 'hzb_visibility_result';

export type HzbDiagnosticRow = {
  readonly code: HzbDiagnosticCode;
  readonly detail: unknown | null;
  readonly field: string | null;
  readonly frame: number;
  readonly key: string | null;
  readonly message: string;
  readonly relation: 'hzb_diagnostic';
  readonly scopeId: string;
  readonly severity: 'info' | 'warning';
  readonly sourceRelation: HzbDiagnosticSourceRelation;
};

export type HzbBenchmarkCounterName =
  | 'base_grid_cells'
  | 'candidate_input_rows'
  | 'depth_cell_rows'
  | 'depth_reduce_tests'
  | 'diagnostic_rows'
  | 'occluded_results'
  | 'occluder_input_rows'
  | 'pyramid_levels'
  | 'query_cell_tests'
  | 'raster_cell_tests'
  | 'visible_results';

export type HzbBenchmarkCounterRow = {
  readonly counter: HzbBenchmarkCounterName;
  readonly frame: number;
  readonly passId: 'cpu-hzb-occlusion';
  readonly relation: 'hzb_benchmark_counter';
  readonly scopeId: string;
  readonly unit: 'cell-test' | 'count' | 'row';
  readonly value: number;
};

export type HzbOcclusionPrototypeRows = {
  readonly hzb_benchmark_counter: readonly HzbBenchmarkCounterRow[];
  readonly hzb_candidate_input: readonly HzbCandidateInputRow[];
  readonly hzb_depth_cell: readonly HzbDepthCellRow[];
  readonly hzb_diagnostic: readonly HzbDiagnosticRow[];
  readonly hzb_frame_input: readonly HzbFrameInputRow[];
  readonly hzb_occluder_input: readonly HzbOccluderInputRow[];
  readonly hzb_occlusion_query: readonly HzbOcclusionQueryRow[];
  readonly hzb_visibility_result: readonly HzbVisibilityResultRow[];
};

type NormalizedGrid = {
  readonly baseCellSize: number;
  readonly baseColumns: number;
  readonly baseRows: number;
  readonly columns: number;
  readonly rows: number;
};

type MutableCounters = {
  depthReduceTests: number;
  queryCellTests: number;
  rasterCellTests: number;
};

type QueryEvaluation = {
  readonly query: HzbOcclusionQueryRow;
  readonly result: HzbVisibilityResultRow;
};

const depthConvention: HzbDepthConvention = 'larger-front-z-wins';

export function runHzbOcclusionPrototype(input: HzbOcclusionPrototypeInput): HzbOcclusionPrototypeRows {
  const scopeId = input.scopeId ?? 'royal';
  const frame = nonNegativeInteger(input.frame ?? 1, 'frame');
  const grid = normalizeGrid(input.grid);
  const diagnostics: HzbDiagnosticRow[] = [];
  const counters: MutableCounters = {
    depthReduceTests: 0,
    queryCellTests: 0,
    rasterCellTests: 0
  };
  const occluderRows = createOccluderInputRows(scopeId, frame, input.occluders);
  const candidateRows = createCandidateInputRows(scopeId, frame, input.candidates);
  const levels = buildDepthPyramid(scopeId, frame, grid, occluderRows, diagnostics, counters);
  const levelCount = levels.length;
  const hasRasterizedOccluders = levels[0]?.some((cell) => cell.coveredBaseCells > 0) ?? false;
  const frameRow: HzbFrameInputRow = {
    baseCellSize: grid.baseCellSize,
    baseColumns: grid.baseColumns,
    baseRows: grid.baseRows,
    columns: grid.columns,
    depthConvention,
    frame,
    levelCount,
    relation: 'hzb_frame_input',
    rows: grid.rows,
    scopeId
  };
  const evaluations = candidateRows.map((candidate) =>
    evaluateCandidate(
      scopeId,
      frame,
      grid,
      candidate,
      levels,
      diagnostics,
      counters,
      input.maxQueryLevel,
      hasRasterizedOccluders
    )
  );
  const depthRows = levels.flat();
  const queryRows = evaluations.map((evaluation) => evaluation.query);
  const resultRows = evaluations.map((evaluation) => evaluation.result);

  if (!occluderRows.some((occluder) => occluder.opaque) || !hasRasterizedOccluders) {
    diagnostics.push({
      code: 'hzb_no_occluders',
      detail: null,
      field: 'occluders',
      frame,
      key: null,
      message: 'no opaque occluder wrote any base HZB cell',
      relation: 'hzb_diagnostic',
      scopeId,
      severity: 'info',
      sourceRelation: 'hzb_occluder_input'
    });
  }

  return {
    hzb_benchmark_counter: createBenchmarkCounterRows(scopeId, frame, {
      baseGridCells: grid.baseColumns * grid.baseRows,
      candidateInputRows: candidateRows.length,
      depthCellRows: depthRows.length,
      depthReduceTests: counters.depthReduceTests,
      diagnosticRows: diagnostics.length,
      occludedResults: resultRows.filter((row) => row.occluded).length,
      occluderInputRows: occluderRows.length,
      pyramidLevels: levelCount,
      queryCellTests: counters.queryCellTests,
      rasterCellTests: counters.rasterCellTests,
      visibleResults: resultRows.filter((row) => row.visible).length
    }),
    hzb_candidate_input: candidateRows,
    hzb_depth_cell: depthRows,
    hzb_diagnostic: diagnostics,
    hzb_frame_input: [frameRow],
    hzb_occluder_input: occluderRows,
    hzb_occlusion_query: queryRows,
    hzb_visibility_result: resultRows
  };
}

export function hzbDepthCellKey(cell: Pick<HzbDepthCellRow, 'cellX' | 'cellY' | 'level'>): string {
  return `l${cell.level}:x${cell.cellX}:y${cell.cellY}`;
}

function normalizeGrid(input: HzbGridInput): NormalizedGrid {
  const columns = positiveInteger(input.columns, 'grid.columns');
  const rows = positiveInteger(input.rows, 'grid.rows');
  const baseCellSize = positiveInteger(input.baseCellSize ?? 1, 'grid.baseCellSize');

  return {
    baseCellSize,
    baseColumns: Math.ceil(columns / baseCellSize),
    baseRows: Math.ceil(rows / baseCellSize),
    columns,
    rows
  };
}

function createOccluderInputRows(
  scopeId: string,
  frame: number,
  occluders: readonly HzbOccluderInput[]
): readonly HzbOccluderInputRow[] {
  return occluders.map((occluder, ordinal) => ({
    frontZ: finiteNumber(occluder.frontZ, `occluders[${ordinal}].frontZ`),
    frame,
    height: finiteNumber(occluder.height, `occluders[${ordinal}].height`),
    occluderId: nonEmptyString(occluder.occluderId, `occluders[${ordinal}].occluderId`),
    opaque: occluder.opaque ?? true,
    ordinal,
    relation: 'hzb_occluder_input',
    scopeId,
    width: finiteNumber(occluder.width, `occluders[${ordinal}].width`),
    x: finiteNumber(occluder.x, `occluders[${ordinal}].x`),
    y: finiteNumber(occluder.y, `occluders[${ordinal}].y`)
  }));
}

function createCandidateInputRows(
  scopeId: string,
  frame: number,
  candidates: readonly HzbCandidateInput[]
): readonly HzbCandidateInputRow[] {
  return candidates.map((candidate, ordinal) => ({
    candidateId: nonEmptyString(candidate.candidateId, `candidates[${ordinal}].candidateId`),
    depthBias: finiteNumber(candidate.depthBias ?? 0, `candidates[${ordinal}].depthBias`),
    farZ: candidate.farZ === undefined ? null : finiteNumber(candidate.farZ, `candidates[${ordinal}].farZ`),
    frame,
    height: finiteNumber(candidate.height, `candidates[${ordinal}].height`),
    maxQueryLevel: candidate.maxQueryLevel === undefined
      ? null
      : nonNegativeInteger(candidate.maxQueryLevel, `candidates[${ordinal}].maxQueryLevel`),
    nearZ: finiteNumber(candidate.nearZ, `candidates[${ordinal}].nearZ`),
    ordinal,
    relation: 'hzb_candidate_input',
    scopeId,
    width: finiteNumber(candidate.width, `candidates[${ordinal}].width`),
    x: finiteNumber(candidate.x, `candidates[${ordinal}].x`),
    y: finiteNumber(candidate.y, `candidates[${ordinal}].y`)
  }));
}

function buildDepthPyramid(
  scopeId: string,
  frame: number,
  grid: NormalizedGrid,
  occluders: readonly HzbOccluderInputRow[],
  diagnostics: HzbDiagnosticRow[],
  counters: MutableCounters
): readonly (readonly HzbDepthCellRow[])[] {
  const base = createEmptyBaseRows(scopeId, frame, grid);
  rasterizeOccluders(grid, base, occluders, diagnostics, counters);
  const levels: HzbDepthCellRow[][] = [base];

  while (levels[levels.length - 1]!.length > 1) {
    levels.push(reduceDepthLevel(scopeId, frame, levels[levels.length - 1]!, counters));
  }

  return levels;
}

function createEmptyBaseRows(scopeId: string, frame: number, grid: NormalizedGrid): HzbDepthCellRow[] {
  const rows: HzbDepthCellRow[] = [];

  for (let cellY = 0; cellY < grid.baseRows; cellY += 1) {
    for (let cellX = 0; cellX < grid.baseColumns; cellX += 1) {
      const bounds = baseCellBounds(grid, cellX, cellY);
      rows.push({
        ...bounds,
        cellX,
        cellY,
        coveredBaseCells: 0,
        coverageRatio: 0,
        frame,
        frontZ: null,
        fullyCovered: false,
        level: 0,
        minFrontZ: null,
        occluderIds: [],
        relation: 'hzb_depth_cell',
        scopeId,
        totalBaseCells: 1
      });
    }
  }

  return rows;
}

function rasterizeOccluders(
  grid: NormalizedGrid,
  base: HzbDepthCellRow[],
  occluders: readonly HzbOccluderInputRow[],
  diagnostics: HzbDiagnosticRow[],
  counters: MutableCounters
): void {
  const gridRect = { x: 0, y: 0, width: grid.columns, height: grid.rows };

  for (const occluder of occluders) {
    if (!occluder.opaque) continue;

    const clipped = intersectRect(occluder, gridRect);

    if (clipped === undefined) {
      diagnostics.push(diagnosticForRect({
        code: 'hzb_empty_occluder',
        field: 'width',
        frame: occluder.frame,
        key: occluder.occluderId,
        message: `occluder ${occluder.occluderId} does not cover the grid`,
        rect: occluder,
        scopeId: occluder.scopeId,
        severity: 'warning',
        sourceRelation: 'hzb_occluder_input'
      }));
      continue;
    }

    if (!sameRect(clipped, occluder)) {
      diagnostics.push(diagnosticForRect({
        code: 'hzb_occluder_clipped',
        field: 'x',
        frame: occluder.frame,
        key: occluder.occluderId,
        message: `occluder ${occluder.occluderId} was clipped to the grid`,
        rect: clipped,
        scopeId: occluder.scopeId,
        severity: 'info',
        sourceRelation: 'hzb_occluder_input'
      }));
    }

    const range = baseCellRangeForRect(grid, clipped);

    for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
      for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
        counters.rasterCellTests += 1;
        const center = baseCellCenter(grid, cellX, cellY);

        if (!containsPoint(clipped, center)) continue;

        const offset = cellY * grid.baseColumns + cellX;
        const current = base[offset];
        if (current === undefined) throw new Error(`missing base HZB cell at ${cellX}, ${cellY}`);

        if (current.frontZ === null || occluder.frontZ > current.frontZ) {
          base[offset] = {
            ...current,
            coveredBaseCells: 1,
            coverageRatio: 1,
            frontZ: occluder.frontZ,
            fullyCovered: true,
            minFrontZ: occluder.frontZ,
            occluderIds: [occluder.occluderId]
          };
        } else if (occluder.frontZ === current.frontZ && !current.occluderIds.includes(occluder.occluderId)) {
          base[offset] = {
            ...current,
            occluderIds: [...current.occluderIds, occluder.occluderId].sort()
          };
        }
      }
    }
  }
}

function reduceDepthLevel(
  scopeId: string,
  frame: number,
  previous: readonly HzbDepthCellRow[],
  counters: MutableCounters
): HzbDepthCellRow[] {
  const previousWidth = maxCellX(previous) + 1;
  const previousHeight = maxCellY(previous) + 1;
  const nextWidth = Math.ceil(previousWidth / 2);
  const nextHeight = Math.ceil(previousHeight / 2);
  const level = previous[0]!.level + 1;
  const next: HzbDepthCellRow[] = [];

  for (let cellY = 0; cellY < nextHeight; cellY += 1) {
    for (let cellX = 0; cellX < nextWidth; cellX += 1) {
      const children = childCells(previous, previousWidth, previousHeight, cellX, cellY);
      counters.depthReduceTests += children.length;
      next.push(aggregateDepthCell(scopeId, frame, level, cellX, cellY, children));
    }
  }

  return next;
}

function aggregateDepthCell(
  scopeId: string,
  frame: number,
  level: number,
  cellX: number,
  cellY: number,
  children: readonly HzbDepthCellRow[]
): HzbDepthCellRow {
  const first = children[0];
  if (first === undefined) throw new Error('cannot aggregate an empty HZB cell');

  const x = Math.min(...children.map((cell) => cell.x));
  const y = Math.min(...children.map((cell) => cell.y));
  const maxX = Math.max(...children.map((cell) => cell.x + cell.width));
  const maxY = Math.max(...children.map((cell) => cell.y + cell.height));
  const coveredBaseCells = children.reduce((total, cell) => total + cell.coveredBaseCells, 0);
  const totalBaseCells = children.reduce((total, cell) => total + cell.totalBaseCells, 0);
  const frontZ = maxNumberOrNull(children.map((cell) => cell.frontZ));
  const minFrontZ = minNumberOrNull(children.map((cell) => cell.minFrontZ));
  const occluderIds = [...new Set(children.flatMap((cell) => cell.occluderIds))].sort();

  return {
    cellX,
    cellY,
    coveredBaseCells,
    coverageRatio: coveredBaseCells / totalBaseCells,
    frame,
    frontZ,
    fullyCovered: coveredBaseCells === totalBaseCells,
    height: maxY - y,
    level,
    minFrontZ,
    occluderIds,
    relation: 'hzb_depth_cell',
    scopeId,
    totalBaseCells,
    width: maxX - x,
    x,
    y
  };
}

function evaluateCandidate(
  scopeId: string,
  frame: number,
  grid: NormalizedGrid,
  candidate: HzbCandidateInputRow,
  levels: readonly (readonly HzbDepthCellRow[])[],
  diagnostics: HzbDiagnosticRow[],
  counters: MutableCounters,
  prototypeMaxQueryLevel: number | undefined,
  hasRasterizedOccluders: boolean
): QueryEvaluation {
  const gridRect = { x: 0, y: 0, width: grid.columns, height: grid.rows };
  const clipped = intersectRect(candidate, gridRect);

  if (candidate.farZ !== null && candidate.farZ > candidate.nearZ) {
    diagnostics.push({
      code: 'hzb_candidate_depth_inversion',
      detail: { farZ: candidate.farZ, nearZ: candidate.nearZ },
      field: 'farZ',
      frame,
      key: candidate.candidateId,
      message: `candidate ${candidate.candidateId} has farZ in front of nearZ for ${depthConvention}`,
      relation: 'hzb_diagnostic',
      scopeId,
      severity: 'warning',
      sourceRelation: 'hzb_candidate_input'
    });
  }

  if (clipped === undefined) {
    diagnostics.push(diagnosticForRect({
      code: 'hzb_empty_candidate',
      field: 'width',
      frame,
      key: candidate.candidateId,
      message: `candidate ${candidate.candidateId} does not cover the grid`,
      rect: candidate,
      scopeId,
      severity: 'warning',
      sourceRelation: 'hzb_candidate_input'
    }));

    return emptyCandidateEvaluation(scopeId, frame, candidate, 'outside_grid');
  }

  if (!sameRect(clipped, candidate)) {
    diagnostics.push(diagnosticForRect({
      code: 'hzb_candidate_clipped',
      field: 'x',
      frame,
      key: candidate.candidateId,
      message: `candidate ${candidate.candidateId} was clipped to the grid`,
      rect: clipped,
      scopeId,
      severity: 'info',
      sourceRelation: 'hzb_candidate_input'
    }));
  }

  const selectedLevel = selectQueryLevel(candidate, levels.length - 1, prototypeMaxQueryLevel);
  const levelRows = levels[selectedLevel];
  if (levelRows === undefined) throw new Error(`missing HZB level ${selectedLevel}`);

  const levelWidth = maxCellX(levelRows) + 1;
  const range = levelCellRangeForRect(levelRows, levelWidth, clipped);
  const samples: HzbDepthCellRow[] = [];

  for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
    for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
      const row = levelRows[cellY * levelWidth + cellX];
      if (row !== undefined && rectsIntersect(row, clipped)) {
        samples.push(row);
      }
    }
  }

  counters.queryCellTests += samples.length;

  if (samples.length === 0) {
    return emptyCandidateEvaluation(scopeId, frame, candidate, 'outside_grid');
  }

  const blockingThreshold = candidate.nearZ + candidate.depthBias;
  let firstFailedCell: HzbDepthCellRow | undefined;
  let blockingSamples = 0;
  const blockerFrontZs: number[] = [];

  for (const sample of samples) {
    const blocksCandidate =
      sample.fullyCovered &&
      sample.minFrontZ !== null &&
      sample.minFrontZ >= blockingThreshold;

    if (blocksCandidate) {
      blockingSamples += 1;
      blockerFrontZs.push(sample.minFrontZ);
      continue;
    }

    firstFailedCell ??= sample;
  }

  const coveredSamples = samples.filter((sample) => sample.coveredBaseCells > 0).length;
  const fullyCoveredSamples = samples.filter((sample) => sample.fullyCovered).length;
  const occluded = blockingSamples === samples.length;
  const reason = occluded
    ? 'all_samples_blocked'
    : !hasRasterizedOccluders
      ? 'no_occluders'
    : fullyCoveredSamples < samples.length
      ? 'uncovered_sample'
      : 'depth_in_front';
  const blockerFrontZ = blockerFrontZs.length === 0 ? null : Math.min(...blockerFrontZs);
  const sampleCount = samples.length;
  const query: HzbOcclusionQueryRow = {
    blockerFrontZ,
    blockingSamples,
    candidateId: candidate.candidateId,
    coveredSamples,
    coverageRatio: fullyCoveredSamples / sampleCount,
    failedCellKey: firstFailedCell === undefined ? null : hzbDepthCellKey(firstFailedCell),
    frame,
    fullyCoveredSamples,
    reason,
    relation: 'hzb_occlusion_query',
    sampleCount,
    scopeId,
    selectedLevel
  };

  return {
    query,
    result: {
      blockerFrontZ,
      candidateId: candidate.candidateId,
      frame,
      height: clipped.height,
      occluded,
      reason,
      relation: 'hzb_visibility_result',
      sampleCount,
      scopeId,
      selectedLevel,
      visible: !occluded,
      width: clipped.width,
      x: clipped.x,
      y: clipped.y
    }
  };
}

function emptyCandidateEvaluation(
  scopeId: string,
  frame: number,
  candidate: HzbCandidateInputRow,
  reason: HzbOcclusionReason
): QueryEvaluation {
  return {
    query: {
      blockerFrontZ: null,
      blockingSamples: 0,
      candidateId: candidate.candidateId,
      coveredSamples: 0,
      coverageRatio: 0,
      failedCellKey: null,
      frame,
      fullyCoveredSamples: 0,
      reason,
      relation: 'hzb_occlusion_query',
      sampleCount: 0,
      scopeId,
      selectedLevel: 0
    },
    result: {
      blockerFrontZ: null,
      candidateId: candidate.candidateId,
      frame,
      height: 0,
      occluded: false,
      reason,
      relation: 'hzb_visibility_result',
      sampleCount: 0,
      scopeId,
      selectedLevel: 0,
      visible: true,
      width: 0,
      x: candidate.x,
      y: candidate.y
    }
  };
}

function selectQueryLevel(
  candidate: HzbCandidateInputRow,
  pyramidMaxLevel: number,
  prototypeMaxQueryLevel: number | undefined
): number {
  const projectedExtent = Math.max(candidate.width, candidate.height, 1);
  const projectedLevel = Math.floor(Math.log2(projectedExtent));
  const candidateMaxQueryLevel = candidate.maxQueryLevel ?? Number.POSITIVE_INFINITY;
  const inputMaxQueryLevel = prototypeMaxQueryLevel === undefined
    ? Number.POSITIVE_INFINITY
    : nonNegativeInteger(prototypeMaxQueryLevel, 'maxQueryLevel');
  const maxAllowedLevel = Math.min(pyramidMaxLevel, candidateMaxQueryLevel, inputMaxQueryLevel);

  return clampInteger(projectedLevel, 0, maxAllowedLevel);
}

function createBenchmarkCounterRows(
  scopeId: string,
  frame: number,
  values: {
    readonly baseGridCells: number;
    readonly candidateInputRows: number;
    readonly depthCellRows: number;
    readonly depthReduceTests: number;
    readonly diagnosticRows: number;
    readonly occludedResults: number;
    readonly occluderInputRows: number;
    readonly pyramidLevels: number;
    readonly queryCellTests: number;
    readonly rasterCellTests: number;
    readonly visibleResults: number;
  }
): readonly HzbBenchmarkCounterRow[] {
  return [
    counterRow(scopeId, frame, 'base_grid_cells', values.baseGridCells, 'count'),
    counterRow(scopeId, frame, 'occluder_input_rows', values.occluderInputRows, 'row'),
    counterRow(scopeId, frame, 'candidate_input_rows', values.candidateInputRows, 'row'),
    counterRow(scopeId, frame, 'pyramid_levels', values.pyramidLevels, 'count'),
    counterRow(scopeId, frame, 'depth_cell_rows', values.depthCellRows, 'row'),
    counterRow(scopeId, frame, 'raster_cell_tests', values.rasterCellTests, 'cell-test'),
    counterRow(scopeId, frame, 'depth_reduce_tests', values.depthReduceTests, 'cell-test'),
    counterRow(scopeId, frame, 'query_cell_tests', values.queryCellTests, 'cell-test'),
    counterRow(scopeId, frame, 'visible_results', values.visibleResults, 'row'),
    counterRow(scopeId, frame, 'occluded_results', values.occludedResults, 'row'),
    counterRow(scopeId, frame, 'diagnostic_rows', values.diagnosticRows, 'row')
  ];
}

function counterRow(
  scopeId: string,
  frame: number,
  counter: HzbBenchmarkCounterName,
  value: number,
  unit: HzbBenchmarkCounterRow['unit']
): HzbBenchmarkCounterRow {
  return {
    counter,
    frame,
    passId: 'cpu-hzb-occlusion',
    relation: 'hzb_benchmark_counter',
    scopeId,
    unit,
    value
  };
}

function diagnosticForRect(input: {
  readonly code: HzbDiagnosticCode;
  readonly field: string;
  readonly frame: number;
  readonly key: string;
  readonly message: string;
  readonly rect: HzbRect;
  readonly scopeId: string;
  readonly severity: HzbDiagnosticRow['severity'];
  readonly sourceRelation: HzbDiagnosticSourceRelation;
}): HzbDiagnosticRow {
  return {
    code: input.code,
    detail: {
      height: input.rect.height,
      width: input.rect.width,
      x: input.rect.x,
      y: input.rect.y
    },
    field: input.field,
    frame: input.frame,
    key: input.key,
    message: input.message,
    relation: 'hzb_diagnostic',
    scopeId: input.scopeId,
    severity: input.severity,
    sourceRelation: input.sourceRelation
  };
}

function baseCellBounds(grid: NormalizedGrid, cellX: number, cellY: number): HzbRect {
  const x = cellX * grid.baseCellSize;
  const y = cellY * grid.baseCellSize;

  return {
    height: Math.min(grid.baseCellSize, grid.rows - y),
    width: Math.min(grid.baseCellSize, grid.columns - x),
    x,
    y
  };
}

function baseCellCenter(grid: NormalizedGrid, cellX: number, cellY: number): { readonly x: number; readonly y: number } {
  const bounds = baseCellBounds(grid, cellX, cellY);

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function baseCellRangeForRect(
  grid: NormalizedGrid,
  rect: HzbRect
): { readonly maxX: number; readonly maxY: number; readonly minX: number; readonly minY: number } {
  return {
    maxX: clampInteger(Math.ceil((rect.x + rect.width) / grid.baseCellSize) - 1, 0, grid.baseColumns - 1),
    maxY: clampInteger(Math.ceil((rect.y + rect.height) / grid.baseCellSize) - 1, 0, grid.baseRows - 1),
    minX: clampInteger(Math.floor(rect.x / grid.baseCellSize), 0, grid.baseColumns - 1),
    minY: clampInteger(Math.floor(rect.y / grid.baseCellSize), 0, grid.baseRows - 1)
  };
}

function levelCellRangeForRect(
  levelRows: readonly HzbDepthCellRow[],
  levelWidth: number,
  rect: HzbRect
): { readonly maxX: number; readonly maxY: number; readonly minX: number; readonly minY: number } {
  const levelHeight = Math.ceil(levelRows.length / levelWidth);
  const first = levelRows[0];
  if (first === undefined) throw new Error('cannot query an empty HZB level');
  const span = first.width;

  return {
    maxX: clampInteger(Math.ceil((rect.x + rect.width) / span) - 1, 0, levelWidth - 1),
    maxY: clampInteger(Math.ceil((rect.y + rect.height) / first.height) - 1, 0, levelHeight - 1),
    minX: clampInteger(Math.floor(rect.x / span), 0, levelWidth - 1),
    minY: clampInteger(Math.floor(rect.y / first.height), 0, levelHeight - 1)
  };
}

function childCells(
  previous: readonly HzbDepthCellRow[],
  previousWidth: number,
  previousHeight: number,
  cellX: number,
  cellY: number
): readonly HzbDepthCellRow[] {
  const children: HzbDepthCellRow[] = [];

  for (let offsetY = 0; offsetY < 2; offsetY += 1) {
    for (let offsetX = 0; offsetX < 2; offsetX += 1) {
      const childX = cellX * 2 + offsetX;
      const childY = cellY * 2 + offsetY;

      if (childX >= previousWidth || childY >= previousHeight) continue;

      const child = previous[childY * previousWidth + childX];
      if (child !== undefined) children.push(child);
    }
  }

  return children;
}

function intersectRect(left: HzbRect, right: HzbRect): HzbRect | undefined {
  if (left.width <= 0 || left.height <= 0 || right.width <= 0 || right.height <= 0) return undefined;

  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  const width = maxX - x;
  const height = maxY - y;

  if (width <= 0 || height <= 0) return undefined;

  return { height, width, x, y };
}

function containsPoint(rect: HzbRect, point: { readonly x: number; readonly y: number }): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

function rectsIntersect(left: HzbRect, right: HzbRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function sameRect(left: HzbRect, right: HzbRect): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function maxCellX(rows: readonly Pick<HzbDepthCellRow, 'cellX'>[]): number {
  return rows.reduce((max, row) => Math.max(max, row.cellX), 0);
}

function maxCellY(rows: readonly Pick<HzbDepthCellRow, 'cellY'>[]): number {
  return rows.reduce((max, row) => Math.max(max, row.cellY), 0);
}

function maxNumberOrNull(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length === 0 ? null : Math.max(...numbers);
}

function minNumberOrNull(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length === 0 ? null : Math.min(...numbers);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

function finiteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }

  return value;
}

function nonEmptyString(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`);
  }

  return value;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
