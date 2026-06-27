import { vectorText, vectorTextGlyphRects, vectorTextSupportedCharacters } from '@royal/renderer-core';

export type FontSourceKind = 'simulated-atkinson-mono' | 'simulated-proportional-proof';

export type FontFaceSpec = {
  readonly family: string;
  readonly monospaced: boolean;
  readonly postScriptName: string;
  readonly source: FontSourceKind;
  readonly stretch: 'normal';
  readonly style: 'normal' | 'italic';
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

export type GlyphMetric = {
  readonly advance: number;
  readonly bounds: FontUnitBounds;
  readonly glyphId: string;
  readonly leftSideBearing: number;
  readonly rightSideBearing: number;
};

export type FontUnitBounds = {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
};

export type FontPrototype = {
  readonly face: FontFaceSpec;
  readonly glyphMetrics: ReadonlyMap<string, GlyphMetric>;
  readonly metrics: FontMetrics;
};

export type TextDirection = 'ltr';

export type GridTextAnchor = {
  readonly alignInline: 'start' | 'center' | 'end';
  readonly column: number;
  readonly columns: number;
  readonly row: number;
  readonly rows: number;
};

export type GlyphGridCell = {
  readonly center: readonly [number, number];
  readonly column: number;
  readonly columns: number;
  readonly row: number;
  readonly rows: number;
};

export type TextPipelineDiagnosticCode = 'missing-outline' | 'run-overflows-anchor' | 'unsupported-glyph';

export type TextPipelineDiagnostic = {
  readonly char?: string;
  readonly cluster?: number;
  readonly code: TextPipelineDiagnosticCode;
  readonly fontFamily: string;
  readonly message: string;
  readonly severity: 'info' | 'warning' | 'error';
};

export type ShapedGlyph = {
  readonly advanceCells: number;
  readonly advanceUnits: number;
  readonly char: string;
  readonly cluster: number;
  readonly glyphId: string;
  readonly metric?: GlyphMetric;
  readonly status: 'ready' | 'missing';
};

export type ShapingResult = {
  readonly diagnostics: readonly TextPipelineDiagnostic[];
  readonly direction: TextDirection;
  readonly glyphs: readonly ShapedGlyph[];
  readonly totalAdvanceCells: number;
};

export type TextShaper = {
  readonly id: string;
  shape(input: ShapeTextInput): ShapingResult;
};

export type ShapeTextInput = {
  readonly direction?: TextDirection;
  readonly font: FontPrototype;
  readonly text: string;
};

export type GlyphOutlineRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type GlyphOutline = {
  readonly format: 'rect-contours';
  readonly rects: readonly GlyphOutlineRect[];
  readonly source: 'legacy-vector-text';
};

export type GlyphOutlineProvider = {
  readonly id: string;
  outlineForGlyph(glyph: ShapedGlyph, font: FontPrototype): GlyphOutline | undefined;
};

export type PositionedGlyph = ShapedGlyph & {
  readonly center: readonly [number, number];
  readonly gridCell: GlyphGridCell;
  readonly outline?: GlyphOutline;
  readonly penOffsetCells: number;
};

export type GlyphRun = {
  readonly diagnostics: readonly TextPipelineDiagnostic[];
  readonly direction: TextDirection;
  readonly fallback: {
    readonly raster: false;
    readonly strategy: 'diagnostic-only';
    readonly triedFonts: readonly string[];
  };
  readonly font: FontFaceSpec;
  readonly glyphs: readonly PositionedGlyph[];
  readonly gridAnchor: GridTextAnchor;
  readonly lineMetrics: {
    readonly ascentCells: number;
    readonly descentCells: number;
    readonly lineGapCells: number;
  };
  readonly renderPlan: {
    readonly mode: 'vector-outline';
    readonly outlineProvider: string;
    readonly rasterFallback: false;
  };
  readonly text: string;
  readonly totalAdvanceCells: number;
};

export type TextLayoutEngine = {
  readonly id: string;
  layout(input: LayoutTextRunInput): GlyphRun;
};

export type LayoutTextRunInput = {
  readonly anchor: GridTextAnchor;
  readonly font: FontPrototype;
  readonly outlineProvider?: GlyphOutlineProvider;
  readonly shaper?: TextShaper;
  readonly text: string;
};

const unitsPerEm = 1_000;
const supportedVectorChars = new Set(vectorTextSupportedCharacters);

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

export const atkinsonHyperlegibleMonoPrototype: FontPrototype = {
  face: {
    family: 'Atkinson Hyperlegible Mono',
    monospaced: true,
    postScriptName: 'AtkinsonHyperlegibleMono-Regular.prototype',
    source: 'simulated-atkinson-mono',
    stretch: 'normal',
    style: 'normal',
    weight: 400
  },
  metrics: {
    ascent: 820,
    capHeight: 700,
    defaultAdvance: 1_000,
    descent: -220,
    lineGap: 120,
    missingAdvance: 1_000,
    unitsPerEm,
    xHeight: 540
  },
  glyphMetrics: createGlyphMetrics(() => 1_000)
};

export const atkinsonHyperlegibleProportionalPrototype: FontPrototype = {
  face: {
    family: 'Atkinson Hyperlegible Proportional Proof',
    monospaced: false,
    postScriptName: 'AtkinsonHyperlegible-ProportionalProof.prototype',
    source: 'simulated-proportional-proof',
    stretch: 'normal',
    style: 'normal',
    weight: 400
  },
  metrics: {
    ascent: 820,
    capHeight: 700,
    defaultAdvance: 820,
    descent: -220,
    lineGap: 120,
    missingAdvance: 750,
    unitsPerEm,
    xHeight: 540
  },
  glyphMetrics: createGlyphMetrics((char) => proportionalAdvanceUnits[char] ?? 820)
};

export const simpleShaper: TextShaper = {
  id: 'prototype-simple-codepoint-shaper',
  shape: ({ direction = 'ltr', font, text }) => {
    const glyphs: ShapedGlyph[] = [];
    const diagnostics: TextPipelineDiagnostic[] = [];

    for (const [cluster, char] of Array.from(text).entries()) {
      const metric = font.glyphMetrics.get(char);

      if (metric === undefined) {
        const advanceCells = font.metrics.missingAdvance / font.metrics.unitsPerEm;
        glyphs.push({
          advanceCells,
          advanceUnits: font.metrics.missingAdvance,
          char,
          cluster,
          glyphId: '.notdef',
          status: 'missing'
        });
        diagnostics.push({
          char,
          cluster,
          code: 'unsupported-glyph',
          fontFamily: font.face.family,
          message: `Unsupported glyph ${JSON.stringify(char)} in ${font.face.family}; no fallback font or raster path was used.`,
          severity: 'warning'
        });
        continue;
      }

      glyphs.push({
        advanceCells: metric.advance / font.metrics.unitsPerEm,
        advanceUnits: metric.advance,
        char,
        cluster,
        glyphId: metric.glyphId,
        metric,
        status: 'ready'
      });
    }

    return {
      diagnostics,
      direction,
      glyphs,
      totalAdvanceCells: sumAdvances(glyphs)
    };
  }
};

export const legacyVectorOutlineProvider: GlyphOutlineProvider = {
  id: 'prototype-legacy-vector-text-outline-provider',
  outlineForGlyph: (glyph) => {
    if (glyph.status !== 'ready' || !supportedVectorChars.has(glyph.char)) return undefined;

    const rects = vectorTextGlyphRects(vectorText({
      cellHeight: 1,
      color: [1, 1, 1, 1],
      glyphs: [{
        center: [0, 0, 0],
        char: glyph.char,
        span: 1
      }]
    }));

    return {
      format: 'rect-contours',
      rects: rects.map((rect) => ({
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y
      })),
      source: 'legacy-vector-text'
    };
  }
};

export const gridAnchoredLayoutEngine: TextLayoutEngine = {
  id: 'prototype-grid-anchored-layout-engine',
  layout: ({ anchor, font, outlineProvider = legacyVectorOutlineProvider, shaper = simpleShaper, text }) => {
    const shaped = shaper.shape({ font, text });
    const diagnostics: TextPipelineDiagnostic[] = [...shaped.diagnostics];
    const inlineInsetCells = inlineInsetFor(anchor, shaped.totalAdvanceCells);

    if (inlineInsetCells < 0) {
      diagnostics.push({
        code: 'run-overflows-anchor',
        fontFamily: font.face.family,
        message: `${font.face.family} shaped ${JSON.stringify(text)} to ${roundCells(shaped.totalAdvanceCells)} cells, wider than its ${anchor.columns} column grid anchor.`,
        severity: 'info'
      });
    }

    const positioned: PositionedGlyph[] = [];
    let penOffsetCells = Math.max(0, inlineInsetCells);

    for (const glyph of shaped.glyphs) {
      const outline = outlineProvider.outlineForGlyph(glyph, font);
      const gridCell = cellForCluster(anchor, glyph.cluster);

      if (glyph.status === 'ready' && outline === undefined) {
        diagnostics.push({
          char: glyph.char,
          cluster: glyph.cluster,
          code: 'missing-outline',
          fontFamily: font.face.family,
          message: `Glyph ${glyph.glyphId} has metrics but no vector outline in ${outlineProvider.id}.`,
          severity: 'warning'
        });
      }

      positioned.push({
        ...glyph,
        center: [
          anchor.column + penOffsetCells + glyph.advanceCells / 2,
          anchor.row + anchor.rows / 2
        ],
        gridCell,
        penOffsetCells,
        ...(outline === undefined ? {} : { outline })
      });
      penOffsetCells += glyph.advanceCells;
    }

    return {
      diagnostics,
      direction: shaped.direction,
      fallback: {
        raster: false,
        strategy: 'diagnostic-only',
        triedFonts: []
      },
      font: font.face,
      glyphs: positioned,
      gridAnchor: anchor,
      lineMetrics: {
        ascentCells: font.metrics.ascent / font.metrics.unitsPerEm,
        descentCells: Math.abs(font.metrics.descent) / font.metrics.unitsPerEm,
        lineGapCells: font.metrics.lineGap / font.metrics.unitsPerEm
      },
      renderPlan: {
        mode: 'vector-outline',
        outlineProvider: outlineProvider.id,
        rasterFallback: false
      },
      text,
      totalAdvanceCells: shaped.totalAdvanceCells
    };
  }
};

export function createGridTextAnchor(input: {
  readonly alignInline?: GridTextAnchor['alignInline'];
  readonly column: number;
  readonly row: number;
  readonly rows?: number;
  readonly text: string;
}): GridTextAnchor {
  return {
    alignInline: input.alignInline ?? 'center',
    column: input.column,
    columns: Array.from(input.text).length,
    row: input.row,
    rows: input.rows ?? 1
  };
}

export function layoutPrototypeTextRun(input: LayoutTextRunInput): GlyphRun {
  return gridAnchoredLayoutEngine.layout(input);
}

function createGlyphMetrics(advanceForChar: (char: string) => number): ReadonlyMap<string, GlyphMetric> {
  const metrics = new Map<string, GlyphMetric>();

  for (const char of vectorTextSupportedCharacters) {
    const advance = advanceForChar(char);
    metrics.set(char, {
      advance,
      bounds: char === ' '
        ? { maxX: 0, maxY: 0, minX: 0, minY: 0 }
        : {
          maxX: Math.round(advance * 0.86),
          maxY: 700,
          minX: Math.round(advance * 0.07),
          minY: -40
        },
      glyphId: glyphIdForChar(char),
      leftSideBearing: char === ' ' ? 0 : Math.round(advance * 0.07),
      rightSideBearing: char === ' ' ? advance : Math.round(advance * 0.07)
    });
  }

  return metrics;
}

function glyphIdForChar(char: string): string {
  if (char === ' ') return 'space';
  const codePoint = char.codePointAt(0);
  return codePoint === undefined ? '.notdef' : `uni${codePoint.toString(16).padStart(4, '0')}`;
}

function inlineInsetFor(anchor: GridTextAnchor, totalAdvanceCells: number): number {
  const freeCells = anchor.columns - totalAdvanceCells;
  if (anchor.alignInline === 'end') return freeCells;
  if (anchor.alignInline === 'center') return freeCells / 2;
  return 0;
}

function cellForCluster(anchor: GridTextAnchor, cluster: number): GlyphGridCell {
  return {
    center: [anchor.column + cluster + 0.5, anchor.row + anchor.rows / 2],
    column: anchor.column + cluster,
    columns: 1,
    row: anchor.row,
    rows: anchor.rows
  };
}

function roundCells(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function sumAdvances(glyphs: readonly Pick<ShapedGlyph, 'advanceCells'>[]): number {
  return glyphs.reduce((sum, glyph) => sum + glyph.advanceCells, 0);
}
