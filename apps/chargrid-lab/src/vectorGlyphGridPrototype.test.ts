import { describe, expect, it } from 'vitest';
import {
  atkinsonLikeMonoGridFont,
  atkinsonLikeProportionalGridFont,
  diagnoseVectorGlyphGridRun,
  layoutVectorGlyphGridRun
} from './vectorGlyphGridPrototype';

const grid = { columns: 14, rows: 5 } as const;
const cellMetrics = { heightPx: 20, widthPx: 12 } as const;

describe('vector glyph grid prototype', () => {
  it('keeps Atkinson-like mono vector outlines on integer char-grid origins', () => {
    const run = layoutVectorGlyphGridRun({
      anchor: { column: 2, row: 1 },
      cellMetrics,
      font: atkinsonLikeMonoGridFont,
      grid,
      text: 'rail'
    });

    expect(run.layoutPolicy).toEqual({
      advanceAffectsOrigin: false,
      bounds: 'outline-derived',
      nextOrigin: 'char-cell-layout',
      origin: 'cell-top-left'
    });
    expect(run.glyphs.map((glyph) => ({
      cellColumn: glyph.cell.column,
      originGridX: glyph.origin.grid.x,
      originPxX: glyph.origin.px.x
    }))).toEqual([
      { cellColumn: 2, originGridX: 2, originPxX: 24 },
      { cellColumn: 3, originGridX: 3, originPxX: 36 },
      { cellColumn: 4, originGridX: 4, originPxX: 48 },
      { cellColumn: 5, originGridX: 5, originPxX: 60 }
    ]);
    expect(run.glyphs.every((glyph) => glyph.outline?.format === 'vector-contours')).toBe(true);
    expect(run.glyphs.map((glyph) => glyph.proof.originResidualPx)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ]);
    expect(run.diagnostics).toEqual([]);
    expect(run.pixelBounds.left).toBeGreaterThanOrEqual(2 * cellMetrics.widthPx);
    expect(run.pixelBounds.right).toBeLessThanOrEqual(6 * cellMetrics.widthPx);
  });

  it('keeps proportional shaping grid-positioned while advances and outline bounds vary', () => {
    const text = 'mimi';
    const mono = layoutVectorGlyphGridRun({
      anchor: { column: 4, row: 1 },
      cellMetrics,
      font: atkinsonLikeMonoGridFont,
      grid,
      text
    });
    const proportional = layoutVectorGlyphGridRun({
      anchor: { column: 4, row: 1 },
      cellMetrics,
      font: atkinsonLikeProportionalGridFont,
      grid,
      text
    });

    expect(proportional.glyphs.map((glyph) => glyph.cell.column)).toEqual([4, 5, 6, 7]);
    expect(proportional.glyphs.map((glyph) => glyph.origin.px)).toEqual(mono.glyphs.map((glyph) => glyph.origin.px));
    expect(proportional.glyphs.map((glyph) => glyph.advanceCells)).toEqual([1.18, 0.45, 1.18, 0.45]);
    expect(proportional.glyphs.map((glyph) => Number(glyph.typographicPenOffsetCells.toFixed(2)))).toEqual([
      0,
      1.18,
      1.63,
      2.81
    ]);

    const firstM = glyphAt(proportional, 0);
    const firstI = glyphAt(proportional, 1);
    expect(firstM.pixelBounds.right).toBeGreaterThan(firstM.cellBoundsPx.right);
    expect(firstM.proof.cellOverflowPx.right).toBeGreaterThan(0);
    expect(firstI.pixelBounds.width).toBeLessThan(firstM.pixelBounds.width);
    expect(proportional.diagnostics.filter((diagnostic) => diagnostic.code === 'cell-overflow')).toHaveLength(2);
    expect(blockingCodes(proportional)).toEqual([]);
  });

  it('diagnoses off-grid origin and baseline drift if a renderer mutates grid-owned fields', () => {
    const run = layoutVectorGlyphGridRun({
      anchor: { column: 1, row: 2 },
      cellMetrics,
      font: atkinsonLikeMonoGridFont,
      grid,
      text: 'mi'
    });
    const drifted = {
      ...run,
      glyphs: run.glyphs.map((glyph) => glyph.cluster === 1
        ? {
            ...glyph,
            baseline: {
              gridY: glyph.baseline.gridY + 0.1,
              pxY: glyph.baseline.pxY + 2
            },
            origin: {
              grid: {
                x: glyph.origin.grid.x + 0.25,
                y: glyph.origin.grid.y
              },
              px: {
                x: glyph.origin.px.x + 3,
                y: glyph.origin.px.y
              }
            }
          }
        : glyph)
    };

    const codes = diagnoseVectorGlyphGridRun(drifted).map((diagnostic) => diagnostic.code);

    expect(codes).toContain('off-grid-origin');
    expect(codes).toContain('baseline-drift');
  });

  it('reports grid overflow without moving glyph origins off their char cells', () => {
    const run = layoutVectorGlyphGridRun({
      anchor: { column: 3, row: 1 },
      cellMetrics,
      font: atkinsonLikeProportionalGridFont,
      grid: { columns: 4, rows: 4 },
      text: 'mm'
    });

    expect(run.glyphs.map((glyph) => glyph.origin.grid.x)).toEqual([3, 4]);
    expect(run.diagnostics.map((diagnostic) => diagnostic.code)).toContain('grid-overflow');
    expect(run.diagnostics.filter((diagnostic) => diagnostic.code === 'off-grid-origin')).toEqual([]);
  });
});

type VectorGridGlyphFromLayout = ReturnType<typeof layoutVectorGlyphGridRun>['glyphs'][number];

function glyphAt(run: ReturnType<typeof layoutVectorGlyphGridRun>, cluster: number): VectorGridGlyphFromLayout {
  const glyph = run.glyphs.find((candidate) => candidate.cluster === cluster);
  if (glyph === undefined) throw new Error(`Expected glyph at cluster ${cluster}`);
  return glyph;
}

function blockingCodes(run: ReturnType<typeof layoutVectorGlyphGridRun>): readonly string[] {
  return run.diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => diagnostic.code);
}
