import { StrictMode, useMemo, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  Canvas,
  directionalLight,
  gltf,
  pass,
  perspectiveCamera,
  scene,
  type RenderRoot
} from 'react-regl-fiber';
import { parseViewerHash, type ViewerArgs } from './args';

const canvasOptions = { alpha: false, antialias: true } as const;

declare global {
  interface Window {
    __patchpit3dViewerRoot?: Root;
  }
}

function App() {
  const args = useViewerArgs();
  const renderScene = useMemo(() => (args.src === undefined ? undefined : createGltfScene(args.src)), [args.src]);

  return (
    <main className="viewer">
      <style>{css}</style>
      {renderScene === undefined ? (
        <p className="status">{args.error ?? 'No glTF source'}</p>
      ) : (
        <Canvas aria-label={args.title ?? '3D viewer'} rootOptions={canvasOptions}>
          {renderScene}
        </Canvas>
      )}
    </main>
  );
}

function useViewerArgs(): ViewerArgs {
  const hash = useSyncExternalStore(subscribeHash, readHash, readHash);
  return useMemo(() => parseViewerHash(hash), [hash]);
}

function subscribeHash(onStoreChange: () => void): () => void {
  window.addEventListener('hashchange', onStoreChange);
  return () => window.removeEventListener('hashchange', onStoreChange);
}

function readHash(): string {
  return window.location.hash;
}

function createGltfScene(src: string): RenderRoot {
  return scene({
    children: [
      pass({
        camera: perspectiveCamera({
          position: [0, 1, 5],
          rotation: [0, 0, 0],
          fovY: Math.PI / 4,
          near: 0.1,
          far: 1000
        }),
        children: [
          directionalLight({ direction: [1, -2, -1], color: [1, 1, 1, 1] }),
          gltf({
            src,
            transform: {
              position: [0, 1, 0],
              rotation: [0, 0, 0],
              scale: [0.32, 0.32, 0.32]
            }
          })
        ]
      })
    ]
  });
}

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Expected #root element');
}

const root = window.__patchpit3dViewerRoot ?? createRoot(rootElement);
window.__patchpit3dViewerRoot = root;

root.render(
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
  height: 100%;
  min-height: 0;
}

canvas {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.status {
  align-self: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  margin: 0;
  padding: 12px;
}
`;
