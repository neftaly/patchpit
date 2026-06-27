import { RenderNodeKind } from './kind';
import type { Rgba, Vec3 } from './primitives';

export type VectorTextCell = {
  readonly center: readonly [number, number];
  readonly column: number;
  readonly span: number;
};

export type VectorTextGlyph = {
  readonly cell?: VectorTextCell;
  readonly center: Vec3;
  readonly char: string;
  readonly span: number;
};

export type VectorTextRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export interface VectorTextNode {
  readonly kind: RenderNodeKind.VectorText;
  readonly cellHeight: number;
  readonly color: Rgba;
  readonly glyphs: readonly VectorTextGlyph[];
}

export interface VectorTextOptions {
  readonly cellHeight?: number;
  readonly color: Rgba;
  readonly glyphs: readonly VectorTextGlyph[];
}

const glyphRows = 7;
const glyphColumns = 5;
const glyphFill = 0.78;

const glyphPatterns = {
  ' ': [
    '00000',
    '00000',
    '00000',
    '00000',
    '00000',
    '00000',
    '00000'
  ],
  a: [
    '01110',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001'
  ],
  b: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10001',
    '10001',
    '11110'
  ],
  c: [
    '01111',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '01111'
  ],
  d: [
    '11110',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '11110'
  ],
  e: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '11111'
  ],
  f: [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '10000'
  ],
  g: [
    '01111',
    '10000',
    '10000',
    '10111',
    '10001',
    '10001',
    '01111'
  ],
  h: [
    '10001',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001'
  ],
  i: [
    '11111',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100',
    '11111'
  ],
  j: [
    '00111',
    '00010',
    '00010',
    '00010',
    '10010',
    '10010',
    '01100'
  ],
  k: [
    '10001',
    '10010',
    '10100',
    '11000',
    '10100',
    '10010',
    '10001'
  ],
  l: [
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '11111'
  ],
  m: [
    '10001',
    '11011',
    '10101',
    '10101',
    '10001',
    '10001',
    '10001'
  ],
  n: [
    '10001',
    '11001',
    '10101',
    '10011',
    '10001',
    '10001',
    '10001'
  ],
  o: [
    '01110',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01110'
  ],
  p: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10000',
    '10000',
    '10000'
  ],
  q: [
    '01110',
    '10001',
    '10001',
    '10001',
    '10101',
    '10010',
    '01101'
  ],
  r: [
    '11110',
    '10001',
    '10001',
    '11110',
    '10100',
    '10010',
    '10001'
  ],
  s: [
    '01111',
    '10000',
    '10000',
    '01110',
    '00001',
    '00001',
    '11110'
  ],
  t: [
    '11111',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100',
    '00100'
  ],
  u: [
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01110'
  ],
  v: [
    '10001',
    '10001',
    '10001',
    '10001',
    '10001',
    '01010',
    '00100'
  ],
  w: [
    '10001',
    '10001',
    '10001',
    '10101',
    '10101',
    '10101',
    '01010'
  ],
  x: [
    '10001',
    '10001',
    '01010',
    '00100',
    '01010',
    '10001',
    '10001'
  ],
  y: [
    '10001',
    '10001',
    '01010',
    '00100',
    '00100',
    '00100',
    '00100'
  ],
  z: [
    '11111',
    '00001',
    '00010',
    '00100',
    '01000',
    '10000',
    '11111'
  ]
} as const satisfies Record<string, readonly string[]>;

export const vectorTextSupportedCharacters = Object.freeze(Object.keys(glyphPatterns));

const patternFor = (char: string): readonly string[] => {
  const pattern = glyphPatterns[char as keyof typeof glyphPatterns];
  if (pattern !== undefined) return pattern;
  throw new Error(`Unsupported vector glyph: ${JSON.stringify(char)}`);
};

export const vectorText = (options: VectorTextOptions): VectorTextNode => {
  for (const glyph of options.glyphs) patternFor(glyph.char);

  return {
    kind: RenderNodeKind.VectorText,
    cellHeight: options.cellHeight ?? 1,
    color: options.color,
    glyphs: options.glyphs
  };
};

export const vectorTextGlyphRects = (node: VectorTextNode): readonly VectorTextRect[] => {
  const rects: VectorTextRect[] = [];
  const cellHeight = Math.max(0.0001, node.cellHeight);

  for (const glyph of node.glyphs) {
    const pattern = patternFor(glyph.char);
    const span = Math.max(0.0001, glyph.span);
    const columnWidth = span / glyphColumns;
    const rowHeight = cellHeight / glyphRows;
    const rectWidth = columnWidth * glyphFill;
    const rectHeight = rowHeight * glyphFill;
    const left = glyph.center[0] - span / 2;
    const top = glyph.center[1] + cellHeight / 2;

    for (let row = 0; row < glyphRows; row += 1) {
      const cells = pattern[row];
      if (cells === undefined) continue;
      for (let column = 0; column < glyphColumns; column += 1) {
        if (cells[column] !== '1') continue;
        rects.push({
          height: rectHeight,
          width: rectWidth,
          x: left + column * columnWidth + (columnWidth - rectWidth) / 2,
          y: top - (row + 1) * rowHeight + (rowHeight - rectHeight) / 2,
          z: glyph.center[2]
        });
      }
    }
  }

  return rects;
};
