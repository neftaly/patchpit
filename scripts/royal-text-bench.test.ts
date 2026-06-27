import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  vectorText,
  vectorTextGlyphRects,
  type VectorTextGlyph
} from '@royal/renderer-core';
import {
  atkinsonLikeProportionalGridFont,
  layoutVectorGlyphGridRun
} from '../apps/chargrid-lab/src/vectorGlyphGridPrototype.js';
import {
  breakShapedRunIntoLines,
  royalProportionalDemoFont,
  shapePrototypeText,
  type ShapedGlyphRun
} from '../apps/chargrid-lab/src/flexTypographyPrototype.js';
import {
  atkinsonHyperlegibleMonoPrototype,
  createGridTextAnchor,
  layoutPrototypeTextRun
} from '../apps/chargrid-lab/src/fontPipelinePrototype.js';

type TextBenchSurface =
  | 'chargrid-vector-layout'
  | 'flex-line-break'
  | 'prototype-shaper'
  | 'renderer-core-vector-rects';

type TextBenchRow = {
  readonly rowKind: 'text-typography-bench';
  readonly scenario: string;
  readonly surface: TextBenchSurface;
  readonly inputChars: number;
  readonly glyphs: number;
  readonly rects: number;
  readonly quads: number;
  readonly lines: number;
  readonly diagnostics: number;
  readonly unsupportedGlyphs: number;
  readonly kernedPairs: number;
  readonly ligatures: number;
  readonly badness: string;
  readonly msPerOp: string;
  readonly heapDeltaKbPerOp: string;
};

type Measurement<T> = {
  readonly heapDeltaKbPerOp: number;
  readonly msPerOp: number;
  readonly value: T;
};

const white = [1, 1, 1, 1] as const;
const cellMetrics = { heightPx: 18, widthPx: 10 } as const;

describe('Royal text and typography benchmark rows', () => {
  it('reports isolated vector, shaping, kerning, and wrapping costs', () => {
    const rows = [
      benchRendererVectorRects('short labels', supportedLowerText(36), 1_000),
      benchRendererVectorRects('1k lowercase glyph rects', supportedLowerText(1_000), 25),
      benchRendererVectorRects('10k lowercase glyph rects', supportedLowerText(10_000), 5),
      benchVectorGridLayout('1k grid glyph layout', supportedLowerText(1_000), 10),
      benchVectorGridLayout('10k grid glyph layout', supportedLowerText(10_000), 3),
      benchPrototypeShaper('kerning-heavy short run', kerningHeavyText(240), 500),
      benchPrototypeShaper('1k shaped glyphs', kerningHeavyText(1_000), 30),
      benchPrototypeShaper('10k shaped glyphs', kerningHeavyText(10_000), 5),
      benchLineBreaking('wrapping and badness', wrappingText(420), 80, 50)
    ];

    console.table(rows);

    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.rowKind === 'text-typography-bench')).toBe(true);
    expect(rows.every((row) => row.inputChars >= row.glyphs)).toBe(true);
    expect(rows.every((row) => row.glyphs >= 0 && row.rects >= 0 && row.quads >= 0)).toBe(true);
    expect(rows.every((row) => Number.isFinite(Number(row.msPerOp)) && Number(row.msPerOp) >= 0)).toBe(true);
    expect(rows.every((row) => Number.isFinite(Number(row.heapDeltaKbPerOp)))).toBe(true);
    expect(rows.some((row) => row.rects > 0 && row.quads === row.rects)).toBe(true);
    expect(rows.some((row) => row.kernedPairs > 0)).toBe(true);
    expect(rows.some((row) => row.ligatures > 0)).toBe(true);
    expect(rows.some((row) => row.lines > 1 && Number(row.badness) > 0)).toBe(true);
    expect(rows.every((row) => row.unsupportedGlyphs === 0)).toBe(true);
  }, 120_000);
});

describe('Royal text edge cases', () => {
  it('keeps empty text empty across vector, grid, shaping, and wrapping paths', () => {
    const node = vectorText({
      cellHeight: 1,
      color: white,
      glyphs: []
    });
    const gridRun = layoutVectorGlyphGridRun({
      anchor: { column: 0, row: 0 },
      cellMetrics,
      font: atkinsonLikeProportionalGridFont,
      grid: { columns: 1, rows: 1 },
      text: ''
    });
    const shaped = shapePrototypeText({
      font: royalProportionalDemoFont,
      fontSizePx: 16,
      text: ''
    });
    const broken = breakShapedRunIntoLines({
      maxLineWidthPx: 80,
      run: shaped
    });

    expect(vectorTextGlyphRects(node)).toEqual([]);
    expect(gridRun.glyphs).toEqual([]);
    expect(gridRun.diagnostics).toEqual([]);
    expect(gridRun.pixelBounds).toEqual({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 });
    expect(shaped.glyphs).toEqual([]);
    expect(shaped.totalAdvancePx).toBe(0);
    expect(broken.lines).toEqual([]);
    expect(broken.totalBadness).toBe(0);
    expect(broken.atoms).toHaveLength(1);
  });

  it('reports unsupported glyphs as diagnostics without enabling raster fallback', () => {
    const unsupportedGlyph = String.fromCodePoint(0x1f642);
    const text = `a${unsupportedGlyph}z`;
    const run = layoutPrototypeTextRun({
      anchor: createGridTextAnchor({
        alignInline: 'start',
        column: 0,
        row: 0,
        text
      }),
      font: atkinsonHyperlegibleMonoPrototype,
      text
    });

    const unsupported = run.diagnostics.filter((diagnostic) => diagnostic.code === 'unsupported-glyph');
    const missingGlyph = run.glyphs.find((glyph) => glyph.status === 'missing');

    expect(run.glyphs).toHaveLength(3);
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toMatchObject({
      char: unsupportedGlyph,
      cluster: 1,
      severity: 'warning'
    });
    expect(missingGlyph).toMatchObject({
      char: unsupportedGlyph,
      cluster: 1,
      glyphId: '.notdef',
      status: 'missing'
    });
    expect(run.fallback).toEqual({
      raster: false,
      strategy: 'diagnostic-only',
      triedFonts: []
    });
    expect(run.renderPlan.rasterFallback).toBe(false);
  });

  it('keeps unbreakable overflow measurable with finite line badness', () => {
    const run = shapePrototypeText({
      font: royalProportionalDemoFont,
      fontSizePx: 18,
      text: 'AVATARAVATARAVATAR'
    });
    const broken = breakShapedRunIntoLines({
      maxLineWidthPx: 20,
      run
    });

    expect(broken.lines).toHaveLength(1);
    expect(broken.lines[0]?.text).toBe('AVATARAVATARAVATAR');
    expect(broken.lines[0]?.remainingPx).toBeLessThan(0);
    expect(Number.isFinite(broken.totalBadness)).toBe(true);
    expect(broken.totalBadness).toBeGreaterThan(1_000_000);
  });
});

function benchRendererVectorRects(scenario: string, text: string, iterations: number): TextBenchRow {
  const node = vectorText({
    cellHeight: 1,
    color: white,
    glyphs: vectorGlyphsFor(text)
  });
  const measurement = measure(iterations, () => vectorTextGlyphRects(node));

  return benchRow({
    scenario,
    surface: 'renderer-core-vector-rects',
    inputChars: Array.from(text).length,
    glyphs: node.glyphs.length,
    rects: measurement.value.length,
    quads: measurement.value.length,
    measurement
  });
}

function benchVectorGridLayout(scenario: string, text: string, iterations: number): TextBenchRow {
  const inputChars = Array.from(text).length;
  const measurement = measure(iterations, () => layoutVectorGlyphGridRun({
    anchor: { column: 1, row: 0 },
    cellMetrics,
    font: atkinsonLikeProportionalGridFont,
    grid: { columns: inputChars + 2, rows: 2 },
    text
  }));
  const unsupportedGlyphs = measurement.value.diagnostics.filter((diagnostic) => diagnostic.code === 'missing-glyph').length;

  return benchRow({
    scenario,
    surface: 'chargrid-vector-layout',
    inputChars,
    glyphs: measurement.value.glyphs.length,
    diagnostics: measurement.value.diagnostics.length,
    unsupportedGlyphs,
    measurement
  });
}

function benchPrototypeShaper(scenario: string, text: string, iterations: number): TextBenchRow {
  const measurement = measure(iterations, () => shapePrototypeText({
    font: royalProportionalDemoFont,
    fontSizePx: 18,
    text
  }));
  const featureCounts = countShapingFeatures(measurement.value);

  return benchRow({
    scenario,
    surface: 'prototype-shaper',
    inputChars: Array.from(text).length,
    glyphs: measurement.value.glyphs.length,
    kernedPairs: featureCounts.kernedPairs,
    ligatures: featureCounts.ligatures,
    measurement
  });
}

function benchLineBreaking(
  scenario: string,
  text: string,
  maxLineWidthPx: number,
  iterations: number
): TextBenchRow {
  const run = shapePrototypeText({
    font: royalProportionalDemoFont,
    fontSizePx: 16,
    text
  });
  const measurement = measure(iterations, () => breakShapedRunIntoLines({
    maxLineWidthPx,
    run
  }));
  const featureCounts = countShapingFeatures(run);

  return benchRow({
    scenario,
    surface: 'flex-line-break',
    inputChars: Array.from(text).length,
    glyphs: run.glyphs.length,
    lines: measurement.value.lines.length,
    kernedPairs: featureCounts.kernedPairs,
    ligatures: featureCounts.ligatures,
    badness: measurement.value.totalBadness,
    measurement
  });
}

function benchRow(input: {
  readonly badness?: number;
  readonly diagnostics?: number;
  readonly glyphs: number;
  readonly inputChars: number;
  readonly kernedPairs?: number;
  readonly ligatures?: number;
  readonly lines?: number;
  readonly measurement: Measurement<unknown>;
  readonly quads?: number;
  readonly rects?: number;
  readonly scenario: string;
  readonly surface: TextBenchSurface;
  readonly unsupportedGlyphs?: number;
}): TextBenchRow {
  return {
    rowKind: 'text-typography-bench',
    scenario: input.scenario,
    surface: input.surface,
    inputChars: input.inputChars,
    glyphs: input.glyphs,
    rects: input.rects ?? 0,
    quads: input.quads ?? 0,
    lines: input.lines ?? 0,
    diagnostics: input.diagnostics ?? 0,
    unsupportedGlyphs: input.unsupportedGlyphs ?? 0,
    kernedPairs: input.kernedPairs ?? 0,
    ligatures: input.ligatures ?? 0,
    badness: fixed(input.badness ?? 0),
    msPerOp: fixed(input.measurement.msPerOp),
    heapDeltaKbPerOp: fixed(input.measurement.heapDeltaKbPerOp)
  };
}

function measure<T>(iterations: number, run: () => T): Measurement<T> {
  expect(iterations).toBeGreaterThan(0);

  run();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  let value: T | undefined;

  for (let index = 0; index < iterations; index += 1) {
    value = run();
  }

  const ms = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;

  if (value === undefined) throw new Error('Measurement did not run.');
  return {
    heapDeltaKbPerOp: (heapAfter - heapBefore) / 1024 / iterations,
    msPerOp: ms / iterations,
    value
  };
}

function vectorGlyphsFor(text: string): readonly VectorTextGlyph[] {
  return Array.from(text).map((char, index) => ({
    center: [index + 0.5, 0, 0] as const,
    char,
    span: 1
  }));
}

function countShapingFeatures(run: ShapedGlyphRun): {
  readonly kernedPairs: number;
  readonly ligatures: number;
} {
  let kernedPairs = 0;
  let ligatures = 0;

  for (const glyph of run.glyphs) {
    for (const feature of glyph.features) {
      if (feature.tag === 'kern') kernedPairs += 1;
      if (feature.tag === 'liga') ligatures += 1;
    }
  }

  return { kernedPairs, ligatures };
}

function supportedLowerText(length: number): string {
  return repeatToLength('royal text mimi wave grid proof ', length);
}

function kerningHeavyText(length: number): string {
  return repeatToLength('AVAWAToYoWA ffi fi fl ', length);
}

function wrappingText(length: number): string {
  return repeatToLength('AVATAR affinity wraps softly, flex typography keeps WA kerning and ffi ligatures. ', length);
}

function repeatToLength(seed: string, length: number): string {
  const chars = Array.from(seed);
  let text = '';

  while (Array.from(text).length < length) {
    text += chars.join('');
  }

  return Array.from(text).slice(0, length).join('');
}

function fixed(value: number): string {
  return value.toFixed(4);
}
