import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { parseViewerHash, type ViewerArgs } from './args';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const args = readArgs();

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return undefined;
    }

    const context = canvas.getContext('2d');

    if (context === null) {
      return undefined;
    }

    const draw = () => {
      const scale = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const color = getComputedStyle(canvas).color;
      canvas.width = Math.max(1, Math.floor(rect.width * scale));
      canvas.height = Math.max(1, Math.floor(rect.height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
      drawPlaceholder(context, rect.width, rect.height, color);
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  return (
    <main className="viewer">
      <style>{css}</style>
      <header>
        <strong>{args.title ?? '3D Viewer'}</strong>
        <code>{args.assetUrl ?? args.path ?? 'no asset'}</code>
      </header>
      <canvas ref={canvasRef} />
      <pre>{JSON.stringify(args, null, 2)}</pre>
    </main>
  );
}

function readArgs(): ViewerArgs {
  return parseViewerHash(window.location.hash);
}

function drawPlaceholder(context: CanvasRenderingContext2D, width: number, height: number, color: string): void {
  context.clearRect(0, 0, width, height);
  context.strokeStyle = color;
  context.lineWidth = 2;

  const size = Math.min(width, height) * 0.34;
  const centerX = width / 2;
  const centerY = height / 2;
  const offset = size * 0.42;
  const front = rect(centerX - size / 2, centerY - size / 2, size, size);
  const back = rect(centerX - size / 2 + offset, centerY - size / 2 - offset, size, size);

  strokeLoop(context, back);
  strokeLoop(context, front);

  for (let index = 0; index < front.length; index += 1) {
    const from = front[index];
    const to = back[index];

    if (from !== undefined && to !== undefined) {
      line(context, from, to);
    }
  }
}

function rect(x: number, y: number, width: number, height: number): readonly Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ];
}

function strokeLoop(context: CanvasRenderingContext2D, points: readonly Point[]): void {
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];

    if (from !== undefined && to !== undefined) {
      line(context, from, to);
    }
  }
}

function line(context: CanvasRenderingContext2D, from: Point, to: Point): void {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

type Point = {
  readonly x: number;
  readonly y: number;
};

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Expected #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const css = `
* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
}

.viewer {
  background: Canvas;
  color: CanvasText;
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  height: 100%;
}

header {
  align-items: center;
  border-bottom: 2px solid currentColor;
  display: flex;
  gap: 12px;
  padding: 6px;
}

canvas {
  flex: 1;
  min-height: 240px;
  width: 100%;
}

pre {
  border-top: 2px solid currentColor;
  margin: 0;
  max-height: 10rem;
  overflow: auto;
  padding: 6px;
}
`;
