import type { Cell, CellTone, GridBuffer, GridMetrics, Rect, SnappedGrid } from './types';

const blankCell: Cell = { char: ' ' };

export function snapPixelsToGrid(widthPx: number, heightPx: number, metrics: GridMetrics): SnappedGrid {
  const columns = Math.max(1, Math.floor(widthPx / metrics.chPx));
  const rows = Math.max(1, Math.floor(heightPx / metrics.linePx));
  const width = columns * metrics.chPx;
  const height = rows * metrics.linePx;

  return {
    columns,
    rows,
    widthPx: width,
    heightPx: height,
    ghostRightPx: Math.max(0, Math.round(widthPx - width)),
    ghostBottomPx: Math.max(0, Math.round(heightPx - height))
  };
}

export function createBuffer(columns: number, rows: number): GridBuffer {
  return {
    columns,
    rows,
    cells: Array.from({ length: columns * rows }, () => blankCell)
  };
}

export function setCell(buffer: GridBuffer, x: number, y: number, char: string, tone?: CellTone): GridBuffer {
  if (x < 0 || y < 0 || x >= buffer.columns || y >= buffer.rows) {
    return buffer;
  }

  const cells = [...buffer.cells];
  cells[y * buffer.columns + x] = tone === undefined ? { char } : { char, tone };
  return { ...buffer, cells };
}

export function paintCell(buffer: GridBuffer, x: number, y: number, char: string, tone?: CellTone): void {
  if (x < 0 || y < 0 || x >= buffer.columns || y >= buffer.rows) {
    return;
  }

  (buffer.cells as Cell[])[y * buffer.columns + x] = tone === undefined ? { char } : { char, tone };
}

export function clampRect(rect: Rect, bounds: Rect): Rect {
  const x = Math.max(bounds.x, rect.x);
  const y = Math.max(bounds.y, rect.y);
  const right = Math.min(bounds.x + bounds.width, rect.x + rect.width);
  const bottom = Math.min(bounds.y + bounds.height, rect.y + rect.height);

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  };
}

export function insetRect(rect: Rect, inset: number): Rect {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2)
  };
}

export function drawText(buffer: GridBuffer, rect: Rect, text: string, tone?: CellTone): void {
  const lines = wrapText(text, rect.width).slice(0, rect.height);

  lines.forEach((line, lineIndex) => {
    [...line.slice(0, rect.width)].forEach((char, charIndex) => {
      paintCell(buffer, rect.x + charIndex, rect.y + lineIndex, char, tone);
    });
  });
}

export function drawBox(buffer: GridBuffer, rect: Rect, options: { readonly title?: string; readonly tone?: CellTone } = {}): void {
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  if (rect.width === 1 || rect.height === 1) {
    fillRect(buffer, rect, '#', options.tone);
    return;
  }

  for (let x = rect.x; x < rect.x + rect.width; x += 1) {
    paintCell(buffer, x, rect.y, x === rect.x || x === rect.x + rect.width - 1 ? '+' : '-', options.tone);
    paintCell(buffer, x, rect.y + rect.height - 1, x === rect.x || x === rect.x + rect.width - 1 ? '+' : '-', options.tone);
  }

  for (let y = rect.y + 1; y < rect.y + rect.height - 1; y += 1) {
    paintCell(buffer, rect.x, y, '|', options.tone);
    paintCell(buffer, rect.x + rect.width - 1, y, '|', options.tone);
  }

  if (options.title !== undefined && rect.width > 4) {
    const title = ` ${options.title} `.slice(0, rect.width - 2);
    [...title].forEach((char, index) => paintCell(buffer, rect.x + 1 + index, rect.y, char, options.tone));
  }
}

export function fillRect(buffer: GridBuffer, rect: Rect, char: string, tone?: CellTone): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      paintCell(buffer, x, y, char, tone);
    }
  }
}

function wrapText(text: string, width: number): readonly string[] {
  if (width <= 0) {
    return [];
  }

  return text.split('\n').flatMap((line) => {
    const words = line.split(' ');
    const wrapped: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (candidate.length <= width) {
        current = candidate;
        continue;
      }

      if (current.length > 0) {
        wrapped.push(current);
      }

      if (word.length > width) {
        for (let index = 0; index < word.length; index += width) {
          wrapped.push(word.slice(index, index + width));
        }
        current = '';
      } else {
        current = word;
      }
    }

    return current.length === 0 ? wrapped : [...wrapped, current];
  });
}
