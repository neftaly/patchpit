import type { CSSProperties } from 'react';
import type { GridBuffer, GridMetrics, GridNode } from './types';
import { paintScene } from './paint';

export function renderChargrid(root: GridNode, columns: number, rows: number): GridBuffer {
  return paintScene(root, columns, rows);
}

export function ChargridView({
  buffer,
  metrics
}: {
  readonly buffer: GridBuffer;
  readonly metrics: GridMetrics;
}) {
  const style = {
    '--grid-columns': String(buffer.columns),
    '--grid-rows': String(buffer.rows),
    '--grid-ch': `${metrics.chPx}px`,
    '--line': `${metrics.linePx}px`
  } as CSSProperties;

  return (
    <div aria-label={`${buffer.columns} by ${buffer.rows} character grid`} className="chargrid" role="img" style={style}>
      {buffer.cells.map((cell, index) => (
        <span className={cell.tone === undefined ? 'cell' : `cell ${cell.tone}`} key={index}>
          {cell.char}
        </span>
      ))}
    </div>
  );
}
