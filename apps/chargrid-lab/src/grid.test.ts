import { describe, expect, it } from 'vitest';
import { createBuffer, drawBox, drawText, snapPixelsToGrid } from './grid';
import { layoutChildren } from './layout';
import { paintScene } from './paint';
import type { GridNode } from './types';

describe('chargrid helpers', () => {
  it('snaps pixels down to whole character cells and keeps ghost remainders', () => {
    expect(snapPixelsToGrid(386, 171, { chPx: 9, linePx: 18 })).toEqual({
      columns: 42,
      rows: 9,
      widthPx: 378,
      heightPx: 162,
      ghostRightPx: 8,
      ghostBottomPx: 9
    });
  });

  it('draws clipped boxes without writing outside the buffer', () => {
    const buffer = createBuffer(4, 3);
    drawBox(buffer, { x: 0, y: 0, width: 6, height: 5 }, { title: 'wide' });

    expect(buffer.cells).toHaveLength(12);
    expect(buffer.cells.slice(0, 4).map((cell) => cell.char).join('')).toBe('+ wi');
  });

  it('wraps text into the requested rectangle', () => {
    const buffer = createBuffer(8, 3);
    drawText(buffer, { x: 0, y: 0, width: 4, height: 2 }, 'alfa beta gamma');

    expect(buffer.cells.slice(0, 8).map((cell) => cell.char).join('')).toBe('alfa    ');
    expect(buffer.cells.slice(8, 16).map((cell) => cell.char).join('')).toBe('beta    ');
  });

  it('distributes flex-like grow space on the main axis', () => {
    const children: readonly GridNode[] = [
      { kind: 'text', width: 4, text: 'left' },
      { kind: 'text', grow: 1, text: 'fill' },
      { kind: 'text', width: 5, text: 'right' }
    ];

    expect(layoutChildren('row', { x: 0, y: 0, width: 20, height: 3 }, children, 1)).toEqual([
      { node: children[0], rect: { x: 0, y: 0, width: 4, height: 3 } },
      { node: children[1], rect: { x: 5, y: 0, width: 9, height: 3 } },
      { node: children[2], rect: { x: 15, y: 0, width: 5, height: 3 } }
    ]);
  });

  it('paints a composed scene to a stable cell buffer', () => {
    const root: GridNode = {
      kind: 'box',
      title: 'root',
      children: [{ kind: 'text', text: 'inside' }]
    };
    const buffer = paintScene(root, 12, 5);

    expect(buffer.columns).toBe(12);
    expect(buffer.rows).toBe(5);
    expect(buffer.cells.map((cell) => cell.char).join('')).toContain('inside');
  });
});
