import { describe, expect, it } from 'vitest';
import {
  createCanvasSurface,
  createHeadlessSurface,
  createManualRoyalScheduler,
  createMemoryRoyalBackend,
  createRoyalFrameworkAdapter,
  createWritableSceneStore,
  microtaskRoyalScheduler,
  prototypeBackendCapability,
  royalSceneSnapshot,
  stableCoreCapability,
  syncRoyalScheduler,
  type RoyalFrameworkAdapter,
  type RoyalViewport
} from './frameworkAdapterApiPrototype';

type PrototypeScene = {
  readonly id: string;
  readonly revision: number;
};

const viewport: RoyalViewport = {
  devicePixelRatio: 2,
  height: 480,
  width: 640
};

const scene = (id: string, revision = 0): PrototypeScene => ({ id, revision });

const createAdapter = (
  framework: 'headless' | 'react' | 'solid' | 'vanilla',
  packageName: string,
  backend = createMemoryRoyalBackend<PrototypeScene>([
    stableCoreCapability('render-root'),
    prototypeBackendCapability('gpu-pick', 'unknown', 'backend not selected in adapter prototype')
  ])
): RoyalFrameworkAdapter<PrototypeScene> =>
  createRoyalFrameworkAdapter({
    backend,
    capabilities: [
      {
        feature: `${framework}-lifecycle`,
        owner: 'adapter',
        stage: 'prototype',
        status: 'available'
      }
    ],
    exposesJsxRuntime: framework === 'react',
    framework,
    jsxImportSource: framework === 'react' ? packageName : null,
    ownsHostDom: framework === 'react' || framework === 'solid',
    packageName,
    supportsHeadless: true
  });

describe('Royal framework adapter API prototype', () => {
  it('keeps multiple roots independent and disposes them separately', () => {
    const backend = createMemoryRoyalBackend<PrototypeScene>();
    const adapter = createAdapter('vanilla', '@royal/vanilla', backend);
    const scheduler = createManualRoyalScheduler();
    const left = adapter.mount({
      scheduler,
      source: royalSceneSnapshot(scene('left'), 'left-scene'),
      surface: createCanvasSurface({ id: 'left-canvas', viewport })
    });
    const right = adapter.mount({
      scheduler,
      source: royalSceneSnapshot(scene('right'), 'right-scene'),
      surface: createCanvasSurface({ id: 'right-canvas', viewport })
    });

    expect(backend.activeRootCount()).toBe(2);
    expect(scheduler.pendingCount).toBe(2);

    scheduler.flush();

    expect(backend.events).toEqual([
      { rootId: 'left-canvas', surfaceKind: 'canvas', type: 'create-root' },
      { rootId: 'right-canvas', surfaceKind: 'canvas', type: 'create-root' },
      { rootId: 'left-canvas', scene: scene('left'), type: 'render' },
      { rootId: 'right-canvas', scene: scene('right'), type: 'render' }
    ]);

    left.dispose();
    expect(backend.activeRootCount()).toBe(1);

    right.dispose();
    right.dispose();

    expect(backend.activeRootCount()).toBe(0);
    expect(backend.events.slice(-2)).toEqual([
      { rootId: 'left-canvas', type: 'dispose' },
      { rootId: 'right-canvas', type: 'dispose' }
    ]);
  });

  it('coalesces external-store changes and keeps Tarstate labels out of backend events', () => {
    const backend = createMemoryRoyalBackend<PrototypeScene>();
    const adapter = createAdapter('react', '@royal/react', backend);
    const scheduler = createManualRoyalScheduler();
    const store = createWritableSceneStore(scene('initial'), 'tarstate-lens');
    const root = adapter.mount({
      scheduler,
      source: store,
      surface: createCanvasSurface({ id: 'react-canvas', ownsCanvasElement: true, viewport })
    });

    scheduler.flush();
    store.setSnapshot(scene('next', 1));
    store.setSnapshot(scene('latest', 2));

    expect(scheduler.pendingCount).toBe(1);

    scheduler.flush();

    expect(backend.events.filter((event) => event.type === 'render')).toEqual([
      { rootId: 'react-canvas', scene: scene('initial'), type: 'render' },
      { rootId: 'react-canvas', scene: scene('latest', 2), type: 'render' }
    ]);
    expect(root.diagnostics()).toMatchObject({
      framework: 'react',
      packageName: '@royal/react',
      schedulerMode: 'manual',
      sourceKind: 'external-store',
      sourceLabel: 'tarstate-lens',
      surfaceKind: 'canvas'
    });
    expect(JSON.stringify(backend.events)).not.toContain('tarstate');

    root.dispose();

    expect(store.listenerCount).toBe(0);
  });

  it('mounts a headless root without a canvas for SSR and tests', () => {
    const backend = createMemoryRoyalBackend<PrototypeScene>();
    const adapter = createAdapter('headless', '@royal/vanilla', backend);
    const root = adapter.mount({
      scheduler: syncRoyalScheduler,
      source: royalSceneSnapshot(scene('ssr')),
      surface: createHeadlessSurface('ssr-root', viewport)
    });

    expect(root.diagnostics()).toMatchObject({
      framework: 'headless',
      schedulerMode: 'sync',
      surfaceKind: 'headless'
    });
    expect(backend.events).toEqual([
      { rootId: 'ssr-root', surfaceKind: 'headless', type: 'create-root' },
      { rootId: 'ssr-root', scene: scene('ssr'), type: 'render' }
    ]);
  });

  it('normalizes event dispatch and resize without framework event objects', () => {
    const backend = createMemoryRoyalBackend<PrototypeScene>();
    const adapter = createAdapter('react', '@royal/react', backend);
    const root = adapter.mount({
      scheduler: syncRoyalScheduler,
      source: royalSceneSnapshot(scene('interactive')),
      surface: createCanvasSurface({ id: 'interactive-canvas', ownsCanvasElement: true, viewport })
    });
    const resized = { ...viewport, height: 720, width: 1280 };

    root.dispatch({
      phase: 'move',
      point: { x: 12, y: 34 },
      targetId: 'button-primary',
      type: 'pointer'
    });
    root.resize(resized);

    expect(backend.events.slice(-2)).toEqual([
      {
        event: {
          framework: 'react',
          phase: 'move',
          point: { x: 12, y: 34 },
          rootId: 'interactive-canvas',
          targetId: 'button-primary',
          type: 'pointer'
        },
        rootId: 'interactive-canvas',
        type: 'event'
      },
      { rootId: 'interactive-canvas', type: 'resize', viewport: resized }
    ]);
  });

  it('lets framework schedulers differ while the backend only receives scene snapshots', async () => {
    const backend = createMemoryRoyalBackend<PrototypeScene>();
    const adapter = createAdapter('solid', '@royal/solid', backend);
    const store = createWritableSceneStore(scene('signal-scene'), 'solid-signal');
    const root = adapter.mount({
      scheduler: microtaskRoyalScheduler,
      source: store,
      surface: createCanvasSurface({ id: 'solid-canvas', viewport })
    });

    expect(backend.events).toEqual([
      { rootId: 'solid-canvas', surfaceKind: 'canvas', type: 'create-root' }
    ]);

    await Promise.resolve();

    store.setSnapshot(scene('signal-scene', 1));
    store.setSnapshot(scene('signal-scene', 2));
    await Promise.resolve();

    expect(backend.events.filter((event) => event.type === 'render')).toEqual([
      { rootId: 'solid-canvas', scene: scene('signal-scene'), type: 'render' },
      { rootId: 'solid-canvas', scene: scene('signal-scene', 2), type: 'render' }
    ]);

    root.dispose();
    store.setSnapshot(scene('ignored', 3));
    await Promise.resolve();

    expect(backend.events.filter((event) => event.type === 'render')).toHaveLength(2);
  });
});
