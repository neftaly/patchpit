import Yoga, {
  Direction,
  FlexDirection,
  Gutter
} from 'yoga-layout';
import type { Config as YogaConfig, Node as YogaNode } from 'yoga-layout';
import { describe, expect, it } from 'vitest';
import {
  breakShapedRunIntoLines,
  createParagraphBreakAtoms,
  createRoyalFlexTypographyDemo,
  createRoyalFlexTypographyDemoTree,
  layoutTinyFlexTree,
  royalProportionalDemoFont,
  shapePrototypeText,
  type TinyFlexBox,
  type TinyFlexNode
} from './flexTypographyPrototype';

const byId = (boxes: readonly TinyFlexBox[]): ReadonlyMap<string, TinyFlexBox> =>
  new Map(boxes.map((box) => [box.id, box]));

const required = (boxes: ReadonlyMap<string, TinyFlexBox>, id: string): TinyFlexBox => {
  const box = boxes.get(id);
  if (box === undefined) throw new Error(`Missing box ${id}`);
  return box;
};

describe('Royal flex typography prototype', () => {
  it('lays out row, column, wrap, grow, shrink, and basis in pixel space outside the char grid', () => {
    const layout = layoutTinyFlexTree(createRoyalFlexTypographyDemoTree(), {
      height: 360,
      width: 520
    });
    const boxes = byId(layout.boxes);
    const root = required(boxes, 'root');
    const hero = required(boxes, 'hero-card');
    const metrics = required(boxes, 'metrics-card');
    const notes = required(boxes, 'notes-card');
    const body = required(boxes, 'body-copy-slot');
    const actions = required(boxes, 'action-row');
    const primary = required(boxes, 'primary-action');
    const secondary = required(boxes, 'secondary-action');

    expect(layout.space).toBe('px');
    expect(root.rect).toEqual({ x: 0, y: 0, width: 520, height: 360 });
    expect(hero.rect).toEqual({ x: 0, y: 0, width: 324, height: 168 });
    expect(metrics.rect).toEqual({ x: 340, y: 0, width: 180, height: 168 });
    expect(notes.rect).toEqual({ x: 0, y: 184, width: 520, height: 112 });
    expect(notes.flexLine).toBe(1);

    expect(body.rect).toEqual({ x: 0, y: 40, width: 324, height: 80 });
    expect(actions.rect).toEqual({ x: 0, y: 128, width: 324, height: 40 });
    expect(primary.rect).toEqual({ x: 0, y: 128, width: 220, height: 40 });
    expect(secondary.rect).toEqual({ x: 232, y: 128, width: 92, height: 40 });
    expect(layout.diagnostics).toEqual([]);
  });

  it('matches Yoga on the deliberate tiny flex subset used as a correctness target', () => {
    const tree: TinyFlexNode = {
      id: 'root',
      style: {
        alignItems: 'start',
        flexDirection: 'row',
        gap: 10
      },
      children: [
        { id: 'a', style: { flexBasis: 120, flexGrow: 1, height: 40 } },
        { id: 'b', style: { flexBasis: 180, flexGrow: 2, height: 40 } },
        { id: 'c', style: { flexBasis: 100, height: 40 } }
      ]
    };
    const layout = byId(layoutTinyFlexTree(tree, { height: 80, width: 600 }).boxes);
    const yoga = layoutYogaRowSubset();

    expect(required(layout, 'a').rect).toEqual(yoga.a);
    expect(required(layout, 'b').rect).toEqual(yoga.b);
    expect(required(layout, 'c').rect).toEqual(yoga.c);
  });

  it('keeps OpenType-like kerning and ligature decisions inside the shaped glyph run', () => {
    const kerned = shapePrototypeText({
      font: royalProportionalDemoFont,
      fontSizePx: 20,
      text: 'AV fi'
    });
    const unkerned = shapePrototypeText({
      font: { ...royalProportionalDemoFont, kerningPairs: [] },
      fontSizePx: 20,
      text: 'AV fi'
    });
    const avAdjustment = 90 * (20 / royalProportionalDemoFont.metrics.unitsPerEm);
    const first = kerned.glyphs[0];
    const second = kerned.glyphs[1];
    const unkernedSecond = unkerned.glyphs[1];
    const ligature = kerned.glyphs.find((glyph) => glyph.glyphId === 'f_i.liga');

    if (second === undefined || unkernedSecond === undefined) {
      throw new Error('Expected AV glyphs in kerned and unkerned runs');
    }

    expect(first?.features).toContainEqual({
      adjustmentUnits: -90,
      source: 'GPOS PairPos prototype',
      tag: 'kern'
    });
    expect(unkernedSecond.xOffsetPx - second.xOffsetPx).toBeCloseTo(avAdjustment, 6);
    expect(ligature).toMatchObject({
      clusterEnd: 5,
      clusterStart: 3,
      features: [{
        source: 'GSUB LigatureSubst prototype',
        tag: 'liga'
      }],
      sourceText: 'fi'
    });
    expect(kerned.shapingEngine).toBe('prototype-gsub-gpos-shaper');
    expect(kerned.totalAdvancePx).toBeLessThan(unkerned.totalAdvancePx);
  });

  it('breaks lines from UAX-style opportunities with a Knuth-Plass-like badness pass', () => {
    const run = shapePrototypeText({
      font: royalProportionalDemoFont,
      fontSizePx: 10,
      text: 'AAA BB CC DDDDD'
    });
    const broken = breakShapedRunIntoLines({
      maxLineWidthPx: 42,
      run
    });
    const atoms = createParagraphBreakAtoms(run);

    expect(broken.opportunities.map((opportunity) => opportunity.class)).toEqual(['SP', 'SP', 'SP', 'end']);
    expect(atoms.some((atom) => atom.kind === 'box')).toBe(true);
    expect(atoms.some((atom) => atom.kind === 'glue')).toBe(true);
    expect(atoms.some((atom) => atom.kind === 'penalty')).toBe(true);
    expect(broken.lines.map((line) => line.text)).toEqual(['AAA', 'BB CC', 'DDDDD']);
    expect(broken.lines.every((line) => line.widthPx <= 42)).toBe(true);
    expect(broken.totalBadness).toBeGreaterThan(0);
  });

  it('packages the Royal API gap and the Yoga versus tiny TypeScript flex decision', () => {
    const demo = createRoyalFlexTypographyDemo({ viewportWidthPx: 520 });

    expect(demo.boxes.every((box) => box.space === 'px')).toBe(true);
    expect(demo.apiPressure.map((pressure) => pressure.id)).toContain('renderer-core:shaped-text-node');
    expect(demo.apiPressure.map((pressure) => pressure.id)).toContain('text-shaper:owns-opentype');
    expect(demo.layoutDecision.useTinyTypeScriptSubsetWhen.join(' ')).toContain('row, column, wrap');
    expect(demo.layoutDecision.useWasmYogaWhen.join(' ')).toContain('WASM Yoga');
    expect(demo.textBlocks.some((block) => block.lines.length > 1)).toBe(true);
  });
});

function layoutYogaRowSubset(): Record<'a' | 'b' | 'c', TinyFlexBox['rect']> {
  const config = Yoga.Config.create();
  config.setPointScaleFactor(1);
  const root = Yoga.Node.create(config);
  root.setWidth(600);
  root.setHeight(80);
  root.setFlexDirection(FlexDirection.Row);
  root.setGap(Gutter.All, 10);

  const a = createYogaChild(config, 120, 1);
  const b = createYogaChild(config, 180, 2);
  const c = createYogaChild(config, 100, 0);

  root.insertChild(a, 0);
  root.insertChild(b, 1);
  root.insertChild(c, 2);
  root.calculateLayout(undefined, undefined, Direction.LTR);

  const result = {
    a: readYogaRect(a),
    b: readYogaRect(b),
    c: readYogaRect(c)
  };

  root.freeRecursive();
  config.free();
  return result;
}

function createYogaChild(config: YogaConfig, basis: number, grow: number): YogaNode {
  const node = Yoga.Node.create(config);
  node.setFlexBasis(basis);
  node.setFlexGrow(grow);
  node.setHeight(40);
  return node;
}

function readYogaRect(node: YogaNode): TinyFlexBox['rect'] {
  const layout = node.getComputedLayout();
  return {
    height: layout.height,
    width: layout.width,
    x: layout.left,
    y: layout.top
  };
}
