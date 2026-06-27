export type RoyalFrameworkKind = 'headless' | 'react' | 'solid' | 'vanilla';
export type RoyalCapabilityOwner = 'adapter' | 'backend' | 'core' | 'lens';
export type RoyalCapabilityStage = 'future' | 'prototype' | 'stable';
export type RoyalCapabilityStatus = 'available' | 'emulated' | 'unavailable' | 'unknown';
export type RoyalSchedulerMode = 'frame' | 'manual' | 'microtask' | 'sync';

export type RoyalCapabilityRow = {
  readonly feature: string;
  readonly owner: RoyalCapabilityOwner;
  readonly stage: RoyalCapabilityStage;
  readonly status: RoyalCapabilityStatus;
  readonly reason?: string;
};

export type RoyalViewport = {
  readonly devicePixelRatio: number;
  readonly height: number;
  readonly width: number;
};

export type RoyalCanvasLike = {
  readonly label: string;
  height: number;
  width: number;
  getContext?: (contextId: string, attributes: unknown) => unknown;
};

export type RoyalRenderSurface =
  | {
      readonly canvas: RoyalCanvasLike;
      readonly id: string;
      readonly kind: 'canvas';
      readonly ownsCanvasElement: boolean;
      readonly viewport: RoyalViewport;
    }
  | {
      readonly canvas: RoyalCanvasLike;
      readonly id: string;
      readonly kind: 'offscreen-canvas';
      readonly viewport: RoyalViewport;
    }
  | {
      readonly id: string;
      readonly kind: 'headless';
      readonly viewport: RoyalViewport;
    };

export type RoyalInputEvent = {
  readonly framework: RoyalFrameworkKind;
  readonly key?: string;
  readonly phase: 'blur' | 'down' | 'focus' | 'move' | 'up' | 'wheel';
  readonly point?: {
    readonly x: number;
    readonly y: number;
  };
  readonly rootId: string;
  readonly targetId?: string;
  readonly type: 'focus' | 'keyboard' | 'pointer';
};

export type RoyalSceneSnapshot<Scene> = {
  readonly kind: 'snapshot';
  readonly label: string;
  readonly snapshot: Scene;
};

export type RoyalExternalSceneStore<Scene> = {
  readonly kind: 'external-store';
  readonly label: string;
  getSnapshot: () => Scene;
  subscribe: (onStoreChange: () => void) => () => void;
};

export type RoyalSceneSource<Scene> = RoyalExternalSceneStore<Scene> | RoyalSceneSnapshot<Scene>;

export type RoyalScheduledTask = {
  cancel: () => void;
};

export type RoyalAdapterScheduler = {
  readonly mode: RoyalSchedulerMode;
  schedule: (task: () => void) => RoyalScheduledTask;
};

export type RoyalManualScheduler = RoyalAdapterScheduler & {
  flush: () => void;
  readonly pendingCount: number;
};

export type RoyalRendererRoot<Scene> = {
  readonly capabilities: readonly RoyalCapabilityRow[];
  readonly rootId: string;
  dispatch: (event: RoyalInputEvent) => void;
  dispose: () => void;
  render: (scene: Scene) => void;
  resize: (viewport: RoyalViewport) => void;
};

export type RoyalRendererBackend<Scene> = {
  readonly capabilities: readonly RoyalCapabilityRow[];
  readonly label: string;
  createRoot: (surface: RoyalRenderSurface) => RoyalRendererRoot<Scene>;
};

export type RoyalFrameworkAdapterConfig<Scene> = {
  readonly backend: RoyalRendererBackend<Scene>;
  readonly capabilities: readonly RoyalCapabilityRow[];
  readonly exposesJsxRuntime: boolean;
  readonly framework: RoyalFrameworkKind;
  readonly jsxImportSource: string | null;
  readonly ownsHostDom: boolean;
  readonly packageName: string;
  readonly supportsHeadless: boolean;
};

export type RoyalMountHost<Scene> = {
  readonly scheduler: RoyalAdapterScheduler;
  readonly source: RoyalSceneSource<Scene>;
  readonly surface: RoyalRenderSurface;
};

export type RoyalAdapterDiagnostics = {
  readonly framework: RoyalFrameworkKind;
  readonly packageName: string;
  readonly schedulerMode: RoyalSchedulerMode;
  readonly sourceKind: RoyalSceneSource<unknown>['kind'];
  readonly sourceLabel: string;
  readonly surfaceKind: RoyalRenderSurface['kind'];
};

export type RoyalAdapterRoot<Scene> = {
  readonly adapter: RoyalFrameworkKind;
  readonly capabilities: readonly RoyalCapabilityRow[];
  readonly rootId: string;
  diagnostics: () => RoyalAdapterDiagnostics;
  dispatch: (event: Omit<RoyalInputEvent, 'framework' | 'rootId'>) => void;
  dispose: () => void;
  resize: (viewport: RoyalViewport) => void;
  updateSource: (source: RoyalSceneSource<Scene>) => void;
};

export type RoyalFrameworkAdapter<Scene> = {
  readonly capabilities: readonly RoyalCapabilityRow[];
  readonly exposesJsxRuntime: boolean;
  readonly framework: RoyalFrameworkKind;
  readonly jsxImportSource: string | null;
  readonly ownsHostDom: boolean;
  readonly packageName: string;
  mount: (host: RoyalMountHost<Scene>) => RoyalAdapterRoot<Scene>;
};

export type RoyalMemoryBackendEvent<Scene> =
  | {
      readonly rootId: string;
      readonly surfaceKind: RoyalRenderSurface['kind'];
      readonly type: 'create-root';
    }
  | {
      readonly rootId: string;
      readonly scene: Scene;
      readonly type: 'render';
    }
  | {
      readonly rootId: string;
      readonly type: 'resize';
      readonly viewport: RoyalViewport;
    }
  | {
      readonly event: RoyalInputEvent;
      readonly rootId: string;
      readonly type: 'event';
    }
  | {
      readonly rootId: string;
      readonly type: 'dispose';
    };

export type RoyalMemoryBackend<Scene> = RoyalRendererBackend<Scene> & {
  readonly events: readonly RoyalMemoryBackendEvent<Scene>[];
  activeRootCount: () => number;
};

export type RoyalWritableSceneStore<Scene> = RoyalExternalSceneStore<Scene> & {
  readonly listenerCount: number;
  setSnapshot: (scene: Scene) => void;
};

export const stableCoreCapability = (feature: string): RoyalCapabilityRow => ({
  feature,
  owner: 'core',
  stage: 'stable',
  status: 'available'
});

export const prototypeBackendCapability = (
  feature: string,
  status: RoyalCapabilityStatus,
  reason: string
): RoyalCapabilityRow => ({
  feature,
  owner: 'backend',
  reason,
  stage: 'prototype',
  status
});

export const royalSceneSnapshot = <Scene>(
  snapshot: Scene,
  label = 'direct-scene'
): RoyalSceneSnapshot<Scene> => ({
  kind: 'snapshot',
  label,
  snapshot
});

export function createWritableSceneStore<Scene>(
  initialSnapshot: Scene,
  label: string
): RoyalWritableSceneStore<Scene> {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  return {
    kind: 'external-store',
    label,
    get listenerCount() {
      return listeners.size;
    },
    getSnapshot: () => snapshot,
    setSnapshot: (scene) => {
      snapshot = scene;
      for (const listener of Array.from(listeners)) listener();
    },
    subscribe: (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    }
  };
}

export function createCanvasSurface(input: {
  readonly canvas?: RoyalCanvasLike;
  readonly id: string;
  readonly ownsCanvasElement?: boolean;
  readonly viewport: RoyalViewport;
}): RoyalRenderSurface {
  const canvas = input.canvas ?? {
    height: input.viewport.height,
    label: input.id,
    width: input.viewport.width
  };

  return {
    canvas,
    id: input.id,
    kind: 'canvas',
    ownsCanvasElement: input.ownsCanvasElement ?? false,
    viewport: input.viewport
  };
}

export const createHeadlessSurface = (
  id: string,
  viewport: RoyalViewport
): RoyalRenderSurface => ({
  id,
  kind: 'headless',
  viewport
});

export const syncRoyalScheduler: RoyalAdapterScheduler = {
  mode: 'sync',
  schedule: (task) => {
    task();
    return { cancel: () => undefined };
  }
};

export const microtaskRoyalScheduler: RoyalAdapterScheduler = {
  mode: 'microtask',
  schedule: (task) => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) task();
    });
    return {
      cancel: () => {
        cancelled = true;
      }
    };
  }
};

export function createManualRoyalScheduler(): RoyalManualScheduler {
  const tasks: (() => void)[] = [];

  return {
    mode: 'manual',
    get pendingCount() {
      return tasks.length;
    },
    flush: () => {
      const batch = tasks.splice(0, tasks.length);
      for (const task of batch) task();
    },
    schedule: (task) => {
      let cancelled = false;
      tasks.push(() => {
        if (!cancelled) task();
      });

      return {
        cancel: () => {
          cancelled = true;
        }
      };
    }
  };
}

export function createMemoryRoyalBackend<Scene>(
  capabilities: readonly RoyalCapabilityRow[] = []
): RoyalMemoryBackend<Scene> {
  const events: RoyalMemoryBackendEvent<Scene>[] = [];
  const activeRoots = new Set<string>();

  return {
    label: 'memory',
    capabilities,
    get events() {
      return events;
    },
    activeRootCount: () => activeRoots.size,
    createRoot: (surface) => {
      if (activeRoots.has(surface.id)) {
        throw new Error(`Royal root already exists for surface "${surface.id}"`);
      }

      let disposed = false;
      activeRoots.add(surface.id);
      events.push({
        rootId: surface.id,
        surfaceKind: surface.kind,
        type: 'create-root'
      });

      const assertMounted = (): void => {
        if (disposed) throw new Error(`Royal root "${surface.id}" has been disposed`);
      };

      return {
        rootId: surface.id,
        capabilities,
        dispatch: (event) => {
          assertMounted();
          events.push({
            event,
            rootId: surface.id,
            type: 'event'
          });
        },
        dispose: () => {
          if (disposed) return;
          disposed = true;
          activeRoots.delete(surface.id);
          events.push({
            rootId: surface.id,
            type: 'dispose'
          });
        },
        render: (scene) => {
          assertMounted();
          events.push({
            rootId: surface.id,
            scene,
            type: 'render'
          });
        },
        resize: (viewport) => {
          assertMounted();
          events.push({
            rootId: surface.id,
            type: 'resize',
            viewport
          });
        }
      };
    }
  };
}

export function createRoyalFrameworkAdapter<Scene>(
  config: RoyalFrameworkAdapterConfig<Scene>
): RoyalFrameworkAdapter<Scene> {
  const capabilities = [
    ...config.capabilities,
    ...config.backend.capabilities
  ];

  return {
    packageName: config.packageName,
    framework: config.framework,
    jsxImportSource: config.jsxImportSource,
    exposesJsxRuntime: config.exposesJsxRuntime,
    ownsHostDom: config.ownsHostDom,
    capabilities,
    mount: (host) => {
      if (host.surface.kind === 'headless' && !config.supportsHeadless) {
        throw new Error(`${config.packageName} cannot mount a headless Royal surface`);
      }

      return mountAdapterRoot(config, capabilities, host);
    }
  };
}

function mountAdapterRoot<Scene>(
  config: RoyalFrameworkAdapterConfig<Scene>,
  capabilities: readonly RoyalCapabilityRow[],
  host: RoyalMountHost<Scene>
): RoyalAdapterRoot<Scene> {
  const rendererRoot = config.backend.createRoot(host.surface);
  let source = host.source;
  let disposed = false;
  let scheduled = false;
  let cancelScheduled: (() => void) | undefined;
  let unsubscribe = subscribeSource(source);

  scheduleRender();

  return {
    rootId: rendererRoot.rootId,
    adapter: config.framework,
    capabilities,
    diagnostics: () => ({
      framework: config.framework,
      packageName: config.packageName,
      schedulerMode: host.scheduler.mode,
      sourceKind: source.kind,
      sourceLabel: source.label,
      surfaceKind: host.surface.kind
    }),
    dispatch: (event) => {
      if (disposed) return;
      rendererRoot.dispatch({
        ...event,
        framework: config.framework,
        rootId: rendererRoot.rootId
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelScheduled?.();
      cancelScheduled = undefined;
      scheduled = false;
      unsubscribe();
      rendererRoot.dispose();
    },
    resize: (viewport) => {
      if (disposed) return;
      rendererRoot.resize(viewport);
    },
    updateSource: (nextSource) => {
      if (disposed) return;
      unsubscribe();
      source = nextSource;
      unsubscribe = subscribeSource(source);
      scheduleRender();
    }
  };

  function readSource(): Scene {
    return source.kind === 'snapshot' ? source.snapshot : source.getSnapshot();
  }

  function scheduleRender(): void {
    if (disposed || scheduled) return;

    scheduled = true;
    const task = host.scheduler.schedule(() => {
      scheduled = false;
      cancelScheduled = undefined;
      if (!disposed) rendererRoot.render(readSource());
    });
    cancelScheduled = task.cancel;

    if (!scheduled) cancelScheduled = undefined;
  }

  function subscribeSource(nextSource: RoyalSceneSource<Scene>): () => void {
    if (nextSource.kind === 'snapshot') return () => undefined;
    return nextSource.subscribe(scheduleRender);
  }
}
