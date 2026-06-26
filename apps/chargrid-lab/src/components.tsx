import { useMemo, useState } from 'react';
import { snapPixelsToGrid } from './grid';
import { ChargridView, renderChargrid } from './renderer';
import type { GridMetrics, GridNode, SnappedGrid } from './types';

const metrics: GridMetrics = {
  chPx: 9,
  linePx: 18
};

export function ChargridLab() {
  const [mediaWidth, setMediaWidth] = useState(386);
  const [mediaHeight, setMediaHeight] = useState(171);
  const [columns, setColumns] = useState(92);
  const [rows, setRows] = useState(36);
  const mediaSnap = useMemo(() => snapPixelsToGrid(mediaWidth, mediaHeight, metrics), [mediaHeight, mediaWidth]);
  const scene = useMemo(() => createDemoScene(mediaSnap, mediaWidth, mediaHeight), [mediaHeight, mediaSnap, mediaWidth]);
  const buffer = useMemo(() => renderChargrid(scene, columns, rows), [columns, rows, scene]);

  return (
    <main className="lab">
      <section className="controls" aria-label="grid controls">
        <label>
          columns
          <input max="124" min="64" onChange={(event) => setColumns(event.currentTarget.valueAsNumber)} type="range" value={columns} />
          <output>{columns}ch</output>
        </label>
        <label>
          rows
          <input max="48" min="24" onChange={(event) => setRows(event.currentTarget.valueAsNumber)} type="range" value={rows} />
          <output>{rows}ln</output>
        </label>
        <label>
          media width
          <input max="620" min="240" onChange={(event) => setMediaWidth(event.currentTarget.valueAsNumber)} type="range" value={mediaWidth} />
          <output>{mediaSnap.columns}ch</output>
        </label>
        <label>
          media height
          <input max="360" min="120" onChange={(event) => setMediaHeight(event.currentTarget.valueAsNumber)} type="range" value={mediaHeight} />
          <output>{mediaSnap.rows}ln</output>
        </label>
      </section>
      <section className="viewport" aria-label="snapped character grid">
        <ChargridView buffer={buffer} metrics={metrics} />
      </section>
    </main>
  );
}

function createDemoScene(mediaSnap: SnappedGrid, targetWidthPx: number, targetHeightPx: number): GridNode {
  const mediaWidthCells = Math.min(46, mediaSnap.columns + 2);
  const mediaHeightCells = Math.min(16, mediaSnap.rows + 2);

  return {
    kind: 'container',
    direction: 'column',
    gap: 1,
    children: [
      {
        kind: 'box',
        title: 'chargrid tui design-system lab',
        height: 5,
        padding: 0,
        children: [
          {
            kind: 'text',
            text: 'React DOM shell -> app-local grid tree -> flex-like cell layout -> char buffer paint -> CSS ch/line cells.\nNo renderer package extraction yet; this is the lab surface for pressure-testing the model.'
          }
        ]
      },
      {
        kind: 'box',
        title: 'control row',
        height: 5,
        direction: 'row',
        gap: 2,
        children: [
          buttonText('[view grid]'),
          buttonText('[snap media]'),
          buttonText('[cube pass]'),
          {
            kind: 'text',
            grow: 1,
            text: 'focus: text wrapping, borders, fixed/fill tracks, media ghost cells'
          }
        ]
      },
      {
        kind: 'container',
        direction: 'row',
        gap: 2,
        grow: 1,
        children: [
          {
            kind: 'box',
            title: 'text + boxes',
            width: 34,
            grow: 0,
            padding: 0,
            children: [
              {
                kind: 'text',
                height: 7,
                text: 'Body copy wraps to integer character cells. Controls and panels share the same row height, so resizing never lands on half a glyph.'
              },
              {
                kind: 'box',
                title: 'nested panel',
                height: 8,
                padding: 0,
                children: [
                  {
                    kind: 'text',
                    text: '2px screen chrome outside; the renderer owns ASCII grid paint inside.'
                  }
                ]
              },
              {
                kind: 'text',
                grow: 1,
                tone: 'muted',
                text: 'Decomplection note: layout and paint stay pure so experiments do not couple to React state.'
              }
            ]
          },
          {
            kind: 'box',
            title: 'media + projected geometry',
            grow: 1,
            direction: 'column',
            gap: 1,
            children: [
              {
                kind: 'media',
                label: 'canvas/image placeholder',
                width: mediaWidthCells,
                height: mediaHeightCells,
                targetWidthPx,
                targetHeightPx,
                snap: mediaSnap
              },
              {
                kind: 'cube',
                label: '3d-ish placeholder',
                grow: 1
              }
            ]
          }
        ]
      }
    ]
  };
}

function buttonText(text: string): GridNode {
  return {
    kind: 'text',
    width: text.length,
    text,
    tone: 'accent'
  };
}
