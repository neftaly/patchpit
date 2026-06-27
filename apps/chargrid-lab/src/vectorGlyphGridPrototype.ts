export type CellGrid = {
  readonly columns: number;
  readonly rows: number;
};

export type CellMetrics = {
  readonly heightPx: number;
  readonly widthPx: number;
};

export type CellRect = {
  readonly column: number;
  readonly columns: number;
  readonly row: number;
  readonly rows: number;
};

export type GridPoint = {
  readonly x: number;
  readonly y: number;
};

export type PixelPoint = {
  readonly x: number;
  readonly y: number;
};

export type PixelBounds = {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
};

export type BoundsOverflow = {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
};

export type FontUnitBounds = {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
};

export type FontFace = {
  readonly family: string;
  readonly monospaced: boolean;
  readonly source: 'atkinson-like-mono-proof' | 'atkinson-like-proportional-proof';
  readonly style: 'normal';
  readonly weight: number;
};

export type FontMetrics = {
  readonly ascent: number;
  readonly capHeight: number;
  readonly defaultAdvance: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly missingAdvance: number;
  readonly unitsPerEm: number;
  readonly xHeight: number;
};

export type GlyphOutlineCommand =
  | {
      readonly kind: 'closePath';
    }
  | {
      readonly kind: 'lineTo' | 'moveTo';
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly controlX: number;
      readonly controlY: number;
      readonly kind: 'quadraticCurveTo';
      readonly x: number;
      readonly y: number;
    };

export type GlyphOutlineContour = {
  readonly bounds: FontUnitBounds;
  readonly commands: readonly GlyphOutlineCommand[];
};

export type GlyphOutline = {
  readonly bounds: FontUnitBounds;
  readonly contours: readonly GlyphOutlineContour[];
  readonly format: 'vector-contours';
  readonly winding: 'nonzero';
};

export type GlyphMetric = {
  readonly advanceUnits: number;
  readonly bounds: FontUnitBounds;
  readonly char: string;
  readonly glyphId: string;
  readonly leftSideBearing: number;
  readonly outline: GlyphOutline;
  readonly rightSideBearing: number;
};

export type VectorGlyphFont = {
  readonly face: FontFace;
  readonly glyphs: ReadonlyMap<string, GlyphMetric>;
  readonly metrics: FontMetrics;
};

export type GridTextAnchorInput = {
  readonly baselineCellOffset?: number;
  readonly column: number;
  readonly columns?: number;
  readonly row: number;
  readonly rows?: number;
};

export type GridTextAnchor = {
  readonly baselineCellOffset: number;
  readonly column: number;
  readonly columns: number;
  readonly row: number;
  readonly rows: number;
};

export type GlyphStatus = 'missing' | 'ready';

export type VectorGridGlyph = {
  readonly advanceCells: number;
  readonly advancePx: number;
  readonly advanceUnits: number;
  readonly baseline: {
    readonly gridY: number;
    readonly pxY: number;
  };
  readonly cell: CellRect;
  readonly cellBoundsPx: PixelBounds;
  readonly char: string;
  readonly cluster: number;
  readonly glyphId: string;
  readonly metric?: GlyphMetric;
  readonly metricBoundsPx?: PixelBounds;
  readonly origin: {
    readonly grid: GridPoint;
    readonly px: PixelPoint;
  };
  readonly outline?: GlyphOutline;
  readonly outlineBoundsPx?: PixelBounds;
  readonly pixelBounds: PixelBounds;
  readonly proof: GlyphGridProof;
  readonly status: GlyphStatus;
  readonly typographicPenOffsetCells: number;
};

export type GlyphGridProof = {
  readonly baselineResidualPx: number;
  readonly cellOverflowPx: BoundsOverflow;
  readonly expectedBaselineGridY: number;
  readonly expectedOriginPx: PixelPoint;
  readonly gridOverflowPx: BoundsOverflow;
  readonly originResidualPx: PixelPoint;
};

export type VectorGlyphLayoutPolicy = {
  readonly advanceAffectsOrigin: false;
  readonly bounds: 'outline-derived';
  readonly origin: 'cell-top-left';
  readonly nextOrigin: 'char-cell-layout';
};

export type VectorGlyphGridDiagnosticCode =
  | 'baseline-drift'
  | 'cell-overflow'
  | 'grid-overflow'
  | 'missing-glyph'
  | 'off-grid-origin'
  | 'outline-bounds-mismatch';

export type VectorGlyphGridDiagnostic = {
  readonly char?: string;
  readonly cluster?: number;
  readonly code: VectorGlyphGridDiagnosticCode;
  readonly glyphId?: string;
  readonly message: string;
  readonly overflowPx?: BoundsOverflow;
  readonly severity: 'error' | 'info' | 'warning';
};

export type VectorGlyphGridRun = {
  readonly anchor: GridTextAnchor;
  readonly cellMetrics: CellMetrics;
  readonly diagnostics: readonly VectorGlyphGridDiagnostic[];
  readonly font: VectorGlyphFont;
  readonly glyphs: readonly VectorGridGlyph[];
  readonly grid: CellGrid;
  readonly layoutPolicy: VectorGlyphLayoutPolicy;
  readonly pixelBounds: PixelBounds;
  readonly text: string;
  readonly totalAdvanceCells: number;
};

export type LayoutVectorGlyphGridInput = {
  readonly anchor: GridTextAnchorInput;
  readonly cellMetrics: CellMetrics;
  readonly font: VectorGlyphFont;
  readonly grid: CellGrid;
  readonly text: string;
};

type DiagnosticRun = Omit<VectorGlyphGridRun, 'diagnostics'> & {
  readonly diagnostics?: readonly VectorGlyphGridDiagnostic[];
};

const unitsPerEm = 1_000;
const epsilon = 0.000_001;
const supportedChars = Array.from('abcdefghijklmnopqrstuvwxyz ');

const proportionalAdvanceUnits: Readonly<Record<string, number>> = {
  ' ': 500,
  a: 860,
  b: 880,
  c: 790,
  d: 890,
  e: 840,
  f: 560,
  g: 870,
  h: 880,
  i: 450,
  j: 500,
  k: 820,
  l: 520,
  m: 1_180,
  n: 880,
  o: 880,
  p: 880,
  q: 880,
  r: 650,
  s: 760,
  t: 610,
  u: 880,
  v: 830,
  w: 1_140,
  x: 790,
  y: 830,
  z: 760
};

export const atkinsonLikeMonoGridFont: VectorGlyphFont = {
  face: {
    family: 'Atkinson Hyperlegible Mono Grid Proof',
    monospaced: true,
    source: 'atkinson-like-mono-proof',
    style: 'normal',
    weight: 400
  },
  glyphs: createGlyphMetrics(() => unitsPerEm, true),
  metrics: {
    ascent: 780,
    capHeight: 700,
    defaultAdvance: unitsPerEm,
    descent: -220,
    lineGap: 120,
    missingAdvance: unitsPerEm,
    unitsPerEm,
    xHeight: 540
  }
};

export const atkinsonLikeProportionalGridFont: VectorGlyphFont = {
  face: {
    family: 'Atkinson Hyperlegible Proportional Grid Proof',
    monospaced: false,
    source: 'atkinson-like-proportional-proof',
    style: 'normal',
    weight: 400
  },
  glyphs: createGlyphMetrics((char) => proportionalAdvanceUnits[char] ?? 820, false),
  metrics: {
    ascent: 780,
    capHeight: 700,
    defaultAdvance: 820,
    descent: -220,
    lineGap: 120,
    missingAdvance: 750,
    unitsPerEm,
    xHeight: 540
  }
};

export function layoutVectorGlyphGridRun(input: LayoutVectorGlyphGridInput): VectorGlyphGridRun {
  const anchor = resolveAnchor(input.anchor, input.text, input.font);
  const chars = Array.from(input.text);
  const glyphs: VectorGridGlyph[] = [];
  let typographicPenOffsetCells = 0;

  for (const [cluster, char] of chars.entries()) {
    const metric = input.font.glyphs.get(char);
    const advanceUnits = metric?.advanceUnits ?? input.font.metrics.missingAdvance;
    const advanceCells = advanceUnits / input.font.metrics.unitsPerEm;
    const cell: CellRect = {
      column: anchor.column + cluster,
      columns: 1,
      row: anchor.row,
      rows: anchor.rows
    };
    const origin = originForCell(cell, input.cellMetrics);
    const baseline = {
      gridY: cell.row + anchor.baselineCellOffset,
      pxY: (cell.row + anchor.baselineCellOffset) * input.cellMetrics.heightPx
    };
    const cellBoundsPx = cellRectToPixelBounds(cell, input.cellMetrics);
    const baseGlyph = {
      advanceCells,
      advancePx: advanceCells * input.cellMetrics.widthPx,
      advanceUnits,
      baseline,
      cell,
      cellBoundsPx,
      char,
      cluster,
      origin,
      typographicPenOffsetCells
    };
    const glyph = metric === undefined
      ? createMissingGlyph(baseGlyph)
      : createReadyGlyph(baseGlyph, metric, input.font, input.cellMetrics);

    glyphs.push({
      ...glyph,
      proof: createGlyphGridProof(input.grid, input.cellMetrics, anchor, glyph)
    });
    typographicPenOffsetCells += advanceCells;
  }

  const run: VectorGlyphGridRun = {
    anchor,
    cellMetrics: input.cellMetrics,
    diagnostics: [],
    font: input.font,
    glyphs,
    grid: input.grid,
    layoutPolicy: {
      advanceAffectsOrigin: false,
      bounds: 'outline-derived',
      nextOrigin: 'char-cell-layout',
      origin: 'cell-top-left'
    },
    pixelBounds: unionPixelBounds(glyphs.map((glyph) => glyph.pixelBounds)),
    text: input.text,
    totalAdvanceCells: typographicPenOffsetCells
  };

  return {
    ...run,
    diagnostics: diagnoseVectorGlyphGridRun(run)
  };
}

export function diagnoseVectorGlyphGridRun(run: DiagnosticRun): readonly VectorGlyphGridDiagnostic[] {
  const diagnostics: VectorGlyphGridDiagnostic[] = [];

  for (const glyph of run.glyphs) {
    const proof = createGlyphGridProof(run.grid, run.cellMetrics, run.anchor, glyph);

    if (glyph.status === 'missing') {
      diagnostics.push({
        char: glyph.char,
        cluster: glyph.cluster,
        code: 'missing-glyph',
        glyphId: glyph.glyphId,
        message: `No vector glyph metric exists for ${JSON.stringify(glyph.char)} in ${run.font.face.family}.`,
        severity: 'warning'
      });
    }

    if (
      !isWholeCell(glyph.origin.grid.x) ||
      !isWholeCell(glyph.origin.grid.y) ||
      !nearlyZero(glyph.origin.grid.x - glyph.cell.column) ||
      !nearlyZero(glyph.origin.grid.y - glyph.cell.row) ||
      !nearlyZero(proof.originResidualPx.x) ||
      !nearlyZero(proof.originResidualPx.y)
    ) {
      diagnostics.push({
        char: glyph.char,
        cluster: glyph.cluster,
        code: 'off-grid-origin',
        glyphId: glyph.glyphId,
        message: `Glyph ${glyph.glyphId} origin must equal cell ${glyph.cell.column},${glyph.cell.row} and pixel ${proof.expectedOriginPx.x},${proof.expectedOriginPx.y}.`,
        severity: 'error'
      });
    }

    if (!nearlyZero(proof.baselineResidualPx)) {
      diagnostics.push({
        char: glyph.char,
        cluster: glyph.cluster,
        code: 'baseline-drift',
        glyphId: glyph.glyphId,
        message: `Glyph ${glyph.glyphId} baseline drifted from grid row ${round(run.anchor.row)} plus offset ${round(run.anchor.baselineCellOffset)}.`,
        severity: 'error'
      });
    }

    if (hasOverflow(proof.cellOverflowPx)) {
      diagnostics.push({
        char: glyph.char,
        cluster: glyph.cluster,
        code: 'cell-overflow',
        glyphId: glyph.glyphId,
        message: `Glyph ${glyph.glyphId} outline extends outside its assigned cell; this is allowed only because the origin remains grid anchored.`,
        overflowPx: roundOverflow(proof.cellOverflowPx),
        severity: 'info'
      });
    }

    if (hasOverflow(proof.gridOverflowPx)) {
      diagnostics.push({
        char: glyph.char,
        cluster: glyph.cluster,
        code: 'grid-overflow',
        glyphId: glyph.glyphId,
        message: `Glyph ${glyph.glyphId} outline leaves the ${run.grid.columns} by ${run.grid.rows} cell grid.`,
        overflowPx: roundOverflow(proof.gridOverflowPx),
        severity: 'error'
      });
    }

    if (glyph.metric !== undefined && outlineBoundsMismatch(glyph.metric)) {
      diagnostics.push({
        char: glyph.char,
        cluster: glyph.cluster,
        code: 'outline-bounds-mismatch',
        glyphId: glyph.glyphId,
        message: `Glyph ${glyph.glyphId} vector contour bounds do not match its metric bounds.`,
        severity: 'error'
      });
    }
  }

  return diagnostics;
}

export function createGlyphGridProof(
  grid: CellGrid,
  cellMetrics: CellMetrics,
  anchor: GridTextAnchor,
  glyph: Pick<VectorGridGlyph, 'baseline' | 'cell' | 'origin' | 'pixelBounds'>
): GlyphGridProof {
  const expectedOriginPx = {
    x: glyph.cell.column * cellMetrics.widthPx,
    y: glyph.cell.row * cellMetrics.heightPx
  };
  const expectedBaselineGridY = glyph.cell.row + anchor.baselineCellOffset;
  const expectedBaselinePxY = expectedBaselineGridY * cellMetrics.heightPx;

  return {
    baselineResidualPx: glyph.baseline.pxY - expectedBaselinePxY,
    cellOverflowPx: overflowForBounds(glyph.pixelBounds, cellRectToPixelBounds(glyph.cell, cellMetrics)),
    expectedBaselineGridY,
    expectedOriginPx,
    gridOverflowPx: overflowForBounds(glyph.pixelBounds, cellRectToPixelBounds({
      column: 0,
      columns: grid.columns,
      row: 0,
      rows: grid.rows
    }, cellMetrics)),
    originResidualPx: {
      x: glyph.origin.px.x - expectedOriginPx.x,
      y: glyph.origin.px.y - expectedOriginPx.y
    }
  };
}

export function cellRectToPixelBounds(cell: CellRect, metrics: CellMetrics): PixelBounds {
  return createPixelBounds(
    cell.column * metrics.widthPx,
    cell.row * metrics.heightPx,
    (cell.column + cell.columns) * metrics.widthPx,
    (cell.row + cell.rows) * metrics.heightPx
  );
}

export function outlineCommandBounds(outline: GlyphOutline): FontUnitBounds {
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let sawPoint = false;

  for (const contour of outline.contours) {
    for (const command of contour.commands) {
      if (command.kind === 'closePath') continue;
      sawPoint = true;
      minX = Math.min(minX, command.x);
      minY = Math.min(minY, command.y);
      maxX = Math.max(maxX, command.x);
      maxY = Math.max(maxY, command.y);

      if (command.kind === 'quadraticCurveTo') {
        minX = Math.min(minX, command.controlX);
        minY = Math.min(minY, command.controlY);
        maxX = Math.max(maxX, command.controlX);
        maxY = Math.max(maxY, command.controlY);
      }
    }
  }

  return sawPoint
    ? { maxX, maxY, minX, minY }
    : { maxX: 0, maxY: 0, minX: 0, minY: 0 };
}

function createReadyGlyph(
  base: Omit<VectorGridGlyph, 'glyphId' | 'metric' | 'metricBoundsPx' | 'outline' | 'outlineBoundsPx' | 'pixelBounds' | 'proof' | 'status'>,
  metric: GlyphMetric,
  font: VectorGlyphFont,
  cellMetrics: CellMetrics
): Omit<VectorGridGlyph, 'proof'> {
  const metricBoundsPx = projectFontBounds(base.origin.px, base.baseline.pxY, metric.bounds, font, cellMetrics);
  const outlineBoundsPx = projectFontBounds(base.origin.px, base.baseline.pxY, metric.outline.bounds, font, cellMetrics);

  return {
    ...base,
    glyphId: metric.glyphId,
    metric,
    metricBoundsPx,
    outline: metric.outline,
    outlineBoundsPx,
    pixelBounds: outlineBoundsPx,
    status: 'ready'
  };
}

function createMissingGlyph(
  base: Omit<VectorGridGlyph, 'glyphId' | 'metric' | 'metricBoundsPx' | 'outline' | 'outlineBoundsPx' | 'pixelBounds' | 'proof' | 'status'>
): Omit<VectorGridGlyph, 'proof'> {
  return {
    ...base,
    glyphId: '.notdef',
    pixelBounds: createPixelBounds(base.origin.px.x, base.baseline.pxY, base.origin.px.x, base.baseline.pxY),
    status: 'missing'
  };
}

function resolveAnchor(input: GridTextAnchorInput, text: string, font: VectorGlyphFont): GridTextAnchor {
  return {
    baselineCellOffset: input.baselineCellOffset ?? baselineCellOffsetForFont(font),
    column: input.column,
    columns: input.columns ?? Array.from(text).length,
    row: input.row,
    rows: input.rows ?? 1
  };
}

function baselineCellOffsetForFont(font: VectorGlyphFont): number {
  return font.metrics.ascent / font.metrics.unitsPerEm;
}

function originForCell(cell: Pick<CellRect, 'column' | 'row'>, metrics: CellMetrics): VectorGridGlyph['origin'] {
  return {
    grid: {
      x: cell.column,
      y: cell.row
    },
    px: {
      x: cell.column * metrics.widthPx,
      y: cell.row * metrics.heightPx
    }
  };
}

function projectFontBounds(
  origin: PixelPoint,
  baselinePxY: number,
  bounds: FontUnitBounds,
  font: VectorGlyphFont,
  cellMetrics: CellMetrics
): PixelBounds {
  const scaleX = cellMetrics.widthPx / font.metrics.unitsPerEm;
  const scaleY = cellMetrics.heightPx / font.metrics.unitsPerEm;

  return createPixelBounds(
    origin.x + bounds.minX * scaleX,
    baselinePxY - bounds.maxY * scaleY,
    origin.x + bounds.maxX * scaleX,
    baselinePxY - bounds.minY * scaleY
  );
}

function createGlyphMetrics(advanceForChar: (char: string) => number, monospaced: boolean): ReadonlyMap<string, GlyphMetric> {
  const metrics = new Map<string, GlyphMetric>();

  for (const char of supportedChars) {
    const advanceUnits = advanceForChar(char);
    const bounds = boundsForGlyph(char, advanceUnits, monospaced);
    metrics.set(char, {
      advanceUnits,
      bounds,
      char,
      glyphId: glyphIdForChar(char),
      leftSideBearing: bounds.minX,
      outline: outlineFromBounds(char, bounds),
      rightSideBearing: advanceUnits - bounds.maxX
    });
  }

  return metrics;
}

function boundsForGlyph(char: string, advanceUnits: number, monospaced: boolean): FontUnitBounds {
  if (char === ' ') {
    return { maxX: 0, maxY: 0, minX: 0, minY: 0 };
  }

  if (monospaced) {
    if (isNarrowGlyph(char)) return { maxX: 640, maxY: 760, minX: 360, minY: -210 };
    if (isWideGlyph(char)) return { maxX: 920, maxY: 760, minX: 80, minY: -210 };
    return { maxX: 880, maxY: 760, minX: 120, minY: -210 };
  }

  if (isWideGlyph(char)) {
    return {
      maxX: Math.max(1_080, advanceUnits - 60),
      maxY: 760,
      minX: 60,
      minY: -210
    };
  }

  if (isNarrowGlyph(char)) {
    return {
      maxX: Math.max(260, advanceUnits - 150),
      maxY: 760,
      minX: 160,
      minY: -210
    };
  }

  return {
    maxX: Math.max(advanceUnits - 80, 620),
    maxY: 760,
    minX: 80,
    minY: -210
  };
}

function outlineFromBounds(char: string, bounds: FontUnitBounds): GlyphOutline {
  if (bounds.maxX === bounds.minX || bounds.maxY === bounds.minY) {
    return {
      bounds,
      contours: [],
      format: 'vector-contours',
      winding: 'nonzero'
    };
  }

  const contours = isCounterGlyph(char)
    ? [rectContour(bounds), rectContour(insetFontBounds(bounds, 180))]
    : [rectContour(bounds)];

  return {
    bounds,
    contours,
    format: 'vector-contours',
    winding: 'nonzero'
  };
}

function rectContour(bounds: FontUnitBounds): GlyphOutlineContour {
  return {
    bounds,
    commands: [
      { kind: 'moveTo', x: bounds.minX, y: bounds.minY },
      { kind: 'lineTo', x: bounds.maxX, y: bounds.minY },
      { kind: 'lineTo', x: bounds.maxX, y: bounds.maxY },
      { kind: 'lineTo', x: bounds.minX, y: bounds.maxY },
      { kind: 'closePath' }
    ]
  };
}

function insetFontBounds(bounds: FontUnitBounds, inset: number): FontUnitBounds {
  return {
    maxX: Math.max(bounds.minX, bounds.maxX - inset),
    maxY: Math.max(bounds.minY, bounds.maxY - inset),
    minX: Math.min(bounds.maxX, bounds.minX + inset),
    minY: Math.min(bounds.maxY, bounds.minY + inset)
  };
}

function glyphIdForChar(char: string): string {
  if (char === ' ') return 'space';
  const codePoint = char.codePointAt(0);
  return codePoint === undefined ? '.notdef' : `uni${codePoint.toString(16).padStart(4, '0')}`;
}

function isCounterGlyph(char: string): boolean {
  return char === 'a' || char === 'd' || char === 'e' || char === 'g' || char === 'o' || char === 'p' || char === 'q';
}

function isNarrowGlyph(char: string): boolean {
  return char === 'f' || char === 'i' || char === 'j' || char === 'l' || char === 'r' || char === 't';
}

function isWideGlyph(char: string): boolean {
  return char === 'm' || char === 'w';
}

function outlineBoundsMismatch(metric: GlyphMetric): boolean {
  const commandBounds = outlineCommandBounds(metric.outline);
  return !sameFontBounds(commandBounds, metric.outline.bounds) || !sameFontBounds(metric.outline.bounds, metric.bounds);
}

function sameFontBounds(a: FontUnitBounds, b: FontUnitBounds): boolean {
  return (
    nearlyZero(a.maxX - b.maxX) &&
    nearlyZero(a.maxY - b.maxY) &&
    nearlyZero(a.minX - b.minX) &&
    nearlyZero(a.minY - b.minY)
  );
}

function createPixelBounds(left: number, top: number, right: number, bottom: number): PixelBounds {
  const normalizedLeft = Math.min(left, right);
  const normalizedRight = Math.max(left, right);
  const normalizedTop = Math.min(top, bottom);
  const normalizedBottom = Math.max(top, bottom);

  return {
    bottom: normalizedBottom,
    height: normalizedBottom - normalizedTop,
    left: normalizedLeft,
    right: normalizedRight,
    top: normalizedTop,
    width: normalizedRight - normalizedLeft
  };
}

function unionPixelBounds(bounds: readonly PixelBounds[]): PixelBounds {
  if (bounds.length === 0) return createPixelBounds(0, 0, 0, 0);

  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;

  for (const bound of bounds) {
    bottom = Math.max(bottom, bound.bottom);
    left = Math.min(left, bound.left);
    right = Math.max(right, bound.right);
    top = Math.min(top, bound.top);
  }

  return createPixelBounds(left, top, right, bottom);
}

function overflowForBounds(bounds: PixelBounds, limit: PixelBounds): BoundsOverflow {
  return {
    bottom: Math.max(0, bounds.bottom - limit.bottom),
    left: Math.max(0, limit.left - bounds.left),
    right: Math.max(0, bounds.right - limit.right),
    top: Math.max(0, limit.top - bounds.top)
  };
}

function hasOverflow(overflow: BoundsOverflow): boolean {
  return overflow.bottom > epsilon || overflow.left > epsilon || overflow.right > epsilon || overflow.top > epsilon;
}

function isWholeCell(value: number): boolean {
  return nearlyZero(value - Math.round(value));
}

function nearlyZero(value: number): boolean {
  return Math.abs(value) <= epsilon;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roundOverflow(overflow: BoundsOverflow): BoundsOverflow {
  return {
    bottom: round(overflow.bottom),
    left: round(overflow.left),
    right: round(overflow.right),
    top: round(overflow.top)
  };
}
