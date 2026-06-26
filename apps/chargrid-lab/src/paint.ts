import { createBuffer, drawBox, drawText, fillRect, insetRect, paintCell } from './grid';
import { layoutTree } from './layout';
import type { CubeNode, GridBuffer, GridNode, MediaNode, Rect } from './types';

export function paintScene(root: GridNode, columns: number, rows: number): GridBuffer {
  const buffer = createBuffer(columns, rows);
  const bounds = { x: 0, y: 0, width: columns, height: rows };

  for (const positioned of layoutTree(root, bounds)) {
    paintNode(buffer, positioned.node, positioned.rect);
  }

  return buffer;
}

function paintNode(buffer: GridBuffer, node: GridNode, rect: Rect): void {
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  if (node.kind === 'box') {
    drawBox(buffer, rect, {
      ...(node.title === undefined ? {} : { title: node.title }),
      tone: node.tone ?? 'panel'
    });
    return;
  }

  if (node.kind === 'text') {
    drawText(buffer, rect, node.text, node.tone ?? 'ink');
    return;
  }

  if (node.kind === 'media') {
    paintMedia(buffer, rect, node);
    return;
  }

  if (node.kind === 'cube') {
    paintCube(buffer, rect, node);
  }
}

function paintMedia(buffer: GridBuffer, rect: Rect, node: MediaNode): void {
  drawBox(buffer, rect, { title: node.label, tone: 'media' });
  const inner = insetRect(rect, 1);

  for (let y = inner.y; y < inner.y + inner.height; y += 1) {
    for (let x = inner.x; x < inner.x + inner.width; x += 1) {
      const char = (x + y) % 4 === 0 ? ':' : (x - y) % 5 === 0 ? '.' : ' ';
      paintCell(buffer, x, y, char, 'media');
    }
  }

  const copy = [
    `${node.snap.columns}ch x ${node.snap.rows}ln`,
    `${node.targetWidthPx}x${node.targetHeightPx}px request`,
    `ghost +${node.snap.ghostRightPx}px / +${node.snap.ghostBottomPx}px`
  ].join('\n');

  drawText(buffer, { x: inner.x + 1, y: inner.y + 1, width: Math.max(0, inner.width - 2), height: 4 }, copy, 'accent');
}

function paintCube(buffer: GridBuffer, rect: Rect, node: CubeNode): void {
  drawBox(buffer, rect, { title: node.label, tone: 'cube' });
  const inner = insetRect(rect, 1);
  fillRect(buffer, inner, ' ', 'cube');

  const left = inner.x + Math.max(1, Math.floor(inner.width * 0.22));
  const right = inner.x + Math.max(2, Math.floor(inner.width * 0.72));
  const top = inner.y + Math.max(1, Math.floor(inner.height * 0.18));
  const bottom = inner.y + Math.max(2, Math.floor(inner.height * 0.72));
  const skewX = Math.max(2, Math.floor(inner.width * 0.16));
  const skewY = Math.max(1, Math.floor(inner.height * 0.18));

  drawLine(buffer, left, top, right, top, '-', 'cube');
  drawLine(buffer, left, bottom, right, bottom, '-', 'cube');
  drawLine(buffer, left, top, left, bottom, '|', 'cube');
  drawLine(buffer, right, top, right, bottom, '|', 'cube');

  drawLine(buffer, left, top, left + skewX, top - skewY, '/', 'cube');
  drawLine(buffer, right, top, right + skewX, top - skewY, '/', 'cube');
  drawLine(buffer, left, bottom, left + skewX, bottom - skewY, '/', 'cube');
  drawLine(buffer, right, bottom, right + skewX, bottom - skewY, '/', 'cube');

  drawLine(buffer, left + skewX, top - skewY, right + skewX, top - skewY, '-', 'cube');
  drawLine(buffer, right + skewX, top - skewY, right + skewX, bottom - skewY, '|', 'cube');
  drawLine(buffer, left + skewX, bottom - skewY, right + skewX, bottom - skewY, '-', 'cube');

  drawText(buffer, { x: inner.x + 1, y: inner.y + inner.height - 2, width: Math.max(0, inner.width - 2), height: 1 }, 'projected into whole cells', 'muted');
}

function drawLine(buffer: GridBuffer, x0: number, y0: number, x1: number, y1: number, char: string, tone: 'cube'): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx - dy;
  let x = x0;
  let y = y0;

  while (true) {
    paintCell(buffer, x, y, char, tone);

    if (x === x1 && y === y1) {
      return;
    }

    const doubleError = error * 2;
    if (doubleError > -dy) {
      error -= dy;
      x += sx;
    }

    if (doubleError < dx) {
      error += dx;
      y += sy;
    }
  }
}
