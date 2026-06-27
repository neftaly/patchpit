import { describe, expect, it } from 'vitest';
import {
  atkinsonHyperlegibleMonoPrototype,
  atkinsonHyperlegibleProportionalPrototype,
  createGridTextAnchor,
  layoutPrototypeTextRun
} from './fontPipelinePrototype';

describe('Royal font pipeline prototype', () => {
  it('keeps mono and proportional text on the same grid run while advances move glyph centers', () => {
    const text = 'mimi';
    const anchor = createGridTextAnchor({ column: 12, row: 5, text });
    const mono = layoutPrototypeTextRun({ anchor, font: atkinsonHyperlegibleMonoPrototype, text });
    const proportional = layoutPrototypeTextRun({ anchor, font: atkinsonHyperlegibleProportionalPrototype, text });

    expect(mono.gridAnchor).toEqual(proportional.gridAnchor);
    expect(mono.glyphs.map((glyph) => glyph.gridCell)).toEqual(proportional.glyphs.map((glyph) => glyph.gridCell));
    expect(mono.glyphs.map((glyph) => glyph.advanceCells)).toEqual([1, 1, 1, 1]);
    expect(proportional.glyphs.map((glyph) => glyph.advanceCells)).toEqual([1.18, 0.45, 1.18, 0.45]);
    expect(mono.glyphs.map((glyph) => glyph.center[0])).toEqual([12.5, 13.5, 14.5, 15.5]);
    expect(proportional.glyphs[0]?.center[0]).toBeCloseTo(12.96);
    expect(proportional.glyphs[1]?.center[0]).toBeCloseTo(13.775);
    expect(proportional.glyphs[2]?.center[0]).toBeCloseTo(14.59);
    expect(proportional.glyphs[3]?.center[0]).toBeCloseTo(15.405);
  });

  it('plans vector outlines only and keeps raster fallback out of the run', () => {
    const text = 'alma';
    const run = layoutPrototypeTextRun({
      anchor: createGridTextAnchor({ column: 2, row: 3, rows: 2, text }),
      font: atkinsonHyperlegibleMonoPrototype,
      text
    });

    expect(run.renderPlan).toEqual({
      mode: 'vector-outline',
      outlineProvider: 'prototype-legacy-vector-text-outline-provider',
      rasterFallback: false
    });
    expect(run.fallback).toEqual({
      raster: false,
      strategy: 'diagnostic-only',
      triedFonts: []
    });
    expect(run.diagnostics).toEqual([]);
    expect(run.glyphs.every((glyph) => glyph.outline?.format === 'rect-contours')).toBe(true);
    expect(run.glyphs.some((glyph) => (glyph.outline?.rects.length ?? 0) > 0)).toBe(true);
  });

  it('reports unsupported glyphs explicitly without falling back to raster text', () => {
    const text = 'a🙂z';
    const run = layoutPrototypeTextRun({
      anchor: createGridTextAnchor({ column: 0, row: 0, text }),
      font: atkinsonHyperlegibleMonoPrototype,
      text
    });
    const missing = run.glyphs.find((glyph) => glyph.char === '🙂');

    expect(run.renderPlan.rasterFallback).toBe(false);
    expect(run.fallback.raster).toBe(false);
    expect(missing).toMatchObject({
      advanceCells: 1,
      char: '🙂',
      cluster: 1,
      glyphId: '.notdef',
      status: 'missing'
    });
    expect(missing?.outline).toBeUndefined();
    expect(run.diagnostics).toContainEqual({
      char: '🙂',
      cluster: 1,
      code: 'unsupported-glyph',
      fontFamily: 'Atkinson Hyperlegible Mono',
      message: 'Unsupported glyph "🙂" in Atkinson Hyperlegible Mono; no fallback font or raster path was used.',
      severity: 'warning'
    });
  });
});
