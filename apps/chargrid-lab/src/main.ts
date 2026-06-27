import { createRoot, type ReactRoyalRoot } from '@royal/react/root';
import {
  buildPickTargets,
  createOrthographicUiScene,
  layoutWithYoga,
  loadGltfPickGeometry,
  navigatePickTarget,
  pickTargetAtPoint,
  pointerToGridPoint,
  type CellGrid,
  type GltfPickGeometry,
  type LayoutBox,
  type PickTarget
} from './royalChargridPrimitives';
import { createKitchenSinkSpec, desktopGrid, mobileGrid } from './yogaRoyal';
import './style.css';

type AppState = {
  activeId: string | undefined;
  activationCount: number;
  boxes: readonly LayoutBox[];
  compact: boolean;
  focusedId: string | undefined;
  geometryById: ReadonlyMap<string, GltfPickGeometry>;
  geometryFailures: readonly GltfPickLoadFailure[];
  geometryStatus: GltfPickLoadStatus;
  grid: CellGrid;
  hoveredId: string | undefined;
  loadVersion: number;
  pickTargets: readonly PickTarget[];
};

type GltfLayoutBox = LayoutBox & {
  readonly gltf: NonNullable<LayoutBox['gltf']>;
};

type GltfPickLoadFailure = {
  readonly id: string;
  readonly message: string;
  readonly src: string;
};

type GltfPickLoadRequest = {
  readonly id: string;
  readonly src: string;
};

type GltfPickLoadResult =
  | {
      readonly geometry: GltfPickGeometry;
      readonly id: string;
      readonly status: 'loaded';
      readonly src: string;
    }
  | {
      readonly failure: GltfPickLoadFailure;
      readonly id: string;
      readonly status: 'failed';
      readonly src: string;
    };

type GltfPickLoadStatus = 'failed' | 'idle' | 'loading' | 'partial' | 'ready';

type ChargridDebugSnapshot = {
  readonly activeId: string | undefined;
  readonly activationCount: number;
  readonly boot: {
    readonly canvasConnected: boolean;
    readonly canvasHeight: number;
    readonly canvasWidth: number;
    readonly renderer: '@royal/react/root';
  };
  readonly boxes: readonly LayoutBox[];
  readonly compact: boolean;
  readonly focusedId: string | undefined;
  readonly grid: CellGrid;
  readonly hoveredId: string | undefined;
  readonly load: {
    readonly failures: readonly GltfPickLoadFailure[];
    readonly loaded: readonly {
      readonly id: string;
      readonly src: string;
      readonly triangles: number;
    }[];
    readonly requested: readonly GltfPickLoadRequest[];
    readonly status: GltfPickLoadStatus;
    readonly version: number;
  };
  readonly pickTargets: readonly PickTarget[];
};

declare global {
  interface Window {
    __patchpitChargrid?: {
      readonly snapshot: () => ChargridDebugSnapshot;
    };
  }
}

const canvas = getCanvas();
const root = createRoot(canvas);
const compactMedia = globalThis.matchMedia('(max-width: 760px)');
let state = createState(compactMedia.matches);
let nextLoadVersion = 0;

canvas.setAttribute('aria-label', 'TUI chargrid lab');
canvas.tabIndex = 0;
canvas.className = 'royal-canvas';

window.__patchpitChargrid = {
  snapshot: createDebugSnapshot
};

render(root, canvas);
startPickGeometryLoad();

canvas.addEventListener('focus', () => {
  if (state.focusedId === undefined) {
    state = { ...state, focusedId: 'button-primary' };
    render(root, canvas);
  }
});

canvas.addEventListener('keydown', (event) => {
  const direction = keyToDirection(event.key);
  if (direction !== undefined) {
    event.preventDefault();
    const focusedId = navigatePickTarget(state.pickTargets, state.focusedId, direction)?.id;
    if (focusedId !== undefined && focusedId !== state.focusedId) {
      state = { ...state, focusedId };
      render(root, canvas);
    }
    return;
  }

  if ((event.key === 'Enter' || event.key === ' ') && state.focusedId !== undefined) {
    event.preventDefault();
    activate(state.focusedId);
  }
});

canvas.addEventListener('pointerdown', (event) => {
  const picked = pickFromPointer(event);
  if (picked !== undefined) activate(picked.id);
});

canvas.addEventListener('pointerleave', () => {
  if (state.hoveredId !== undefined) {
    state = { ...state, hoveredId: undefined };
    render(root, canvas);
  }
});

canvas.addEventListener('pointermove', (event) => {
  const hoveredId = pickFromPointer(event)?.id;
  if (hoveredId !== state.hoveredId) {
    state = { ...state, hoveredId };
    render(root, canvas);
  }
});

compactMedia.addEventListener('change', (event) => {
  state = {
    ...createState(event.matches),
    activeId: state.activeId,
    activationCount: state.activationCount,
    focusedId: state.focusedId
  };
  render(root, canvas);
  startPickGeometryLoad();
});

function createState(compact: boolean): AppState {
  const grid = compact ? mobileGrid : desktopGrid;
  const boxes = layoutWithYoga(createKitchenSinkSpec(compact), grid);
  const pickTargets = buildPickTargets(boxes);

  const nextState: AppState = {
    activeId: undefined,
    activationCount: 0,
    boxes,
    compact,
    focusedId: 'button-primary',
    geometryById: new Map<string, GltfPickGeometry>(),
    geometryFailures: [] satisfies readonly GltfPickLoadFailure[],
    geometryStatus: 'idle',
    grid,
    hoveredId: undefined,
    loadVersion: 0,
    pickTargets
  };

  return nextState;
}

function createDebugSnapshot(): ChargridDebugSnapshot {
  const requested = getGltfPickLoadRequests(state.boxes);
  const srcById = new Map(requested.map((request) => [request.id, request.src]));
  const loaded = Array.from(state.geometryById, ([id, geometry]) => ({
    id,
    src: srcById.get(id) ?? '',
    triangles: geometry.triangles.length
  }));

  return {
    activeId: state.activeId,
    activationCount: state.activationCount,
    boot: {
      canvasConnected: canvas.isConnected,
      canvasHeight: canvas.height,
      canvasWidth: canvas.width,
      renderer: '@royal/react/root'
    },
    boxes: state.boxes,
    compact: state.compact,
    focusedId: state.focusedId,
    grid: state.grid,
    hoveredId: state.hoveredId,
    load: {
      failures: state.geometryFailures,
      loaded,
      requested,
      status: state.geometryStatus,
      version: state.loadVersion
    },
    pickTargets: state.pickTargets
  };
}

function render(renderer: ReactRoyalRoot, target: HTMLCanvasElement): void {
  const focusIds = new Set([state.activeId, state.focusedId, state.hoveredId].filter((id): id is string => id !== undefined));
  const activeIds = new Set([state.activeId].filter((id): id is string => id !== undefined));

  target.style.setProperty('--royal-grid-columns', String(state.grid.columns));
  target.style.setProperty('--royal-grid-rows', String(state.grid.rows));
  target.dataset.hover = state.hoveredId === undefined ? 'false' : 'true';
  renderer.render(createOrthographicUiScene(state.grid, state.boxes, { activeIds, focusIds }));
}

async function loadPickGeometry(): Promise<void> {
  nextLoadVersion += 1;
  const loadVersion = nextLoadVersion;
  const requests = getGltfPickLoadRequests(state.boxes);
  state = {
    ...state,
    geometryById: new Map<string, GltfPickGeometry>(),
    geometryFailures: [] satisfies readonly GltfPickLoadFailure[],
    geometryStatus: requests.length === 0 ? 'ready' : 'loading',
    loadVersion
  };

  if (requests.length === 0) return;

  const results = await Promise.all(requests.map(loadGltfPickGeometryRequest));

  if (state.loadVersion !== loadVersion) return;

  const entries = results.flatMap((result) =>
    result.status === 'loaded'
      ? [[result.id, result.geometry] as const]
      : []
  );
  const failures = results.flatMap((result) =>
    result.status === 'failed'
      ? [result.failure]
      : []
  );

  state = {
    ...state,
    geometryById: new Map(entries),
    geometryFailures: failures,
    geometryStatus: pickLoadStatus(entries.length, failures.length)
  };
}

function startPickGeometryLoad(): void {
  const load = loadPickGeometry();
  const loadVersion = state.loadVersion;

  void load.catch((error: unknown) => {
    if (state.loadVersion !== loadVersion) return;

    state = {
      ...state,
      geometryFailures: [
        ...state.geometryFailures,
        {
          id: '(pick-geometry-load)',
          message: errorToMessage(error),
          src: ''
        }
      ],
      geometryStatus: 'failed'
    };
  });
}

function getGltfPickLoadRequests(boxes: readonly LayoutBox[]): readonly GltfPickLoadRequest[] {
  return boxes
    .filter((box): box is GltfLayoutBox => box.gltf !== undefined)
    .map((box) => ({
      id: box.id,
      src: box.gltf.src
    }));
}

async function loadGltfPickGeometryRequest(request: GltfPickLoadRequest): Promise<GltfPickLoadResult> {
  try {
    return {
      geometry: await loadGltfPickGeometry(request.src),
      id: request.id,
      status: 'loaded',
      src: request.src
    };
  } catch (error: unknown) {
    return {
      failure: {
        id: request.id,
        message: errorToMessage(error),
        src: request.src
      },
      id: request.id,
      status: 'failed',
      src: request.src
    };
  }
}

function pickLoadStatus(loadedCount: number, failureCount: number): GltfPickLoadStatus {
  if (failureCount === 0) return 'ready';
  return loadedCount === 0 ? 'failed' : 'partial';
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

function getCanvas(): HTMLCanvasElement {
  const target = document.querySelector<HTMLCanvasElement>('#chargrid');
  if (target === null) throw new Error('Expected #chargrid canvas');
  return target;
}

function pickFromPointer(event: PointerEvent): LayoutBox | undefined {
  const point = pointerToGridPoint(state.grid, canvas.getBoundingClientRect(), event);
  const hit = point === undefined
    ? undefined
    : pickTargetAtPoint(state.grid, state.boxes, state.pickTargets, point, state.geometryById);
  return hit === undefined ? undefined : state.boxes.find((box) => box.id === hit.target.id);
}

function activate(id: string): void {
  if (!state.pickTargets.some((target) => target.id === id)) return;

  state = {
    ...state,
    activeId: id,
    activationCount: state.activationCount + 1,
    focusedId: id
  };
  render(root, canvas);
}

function keyToDirection(key: string) {
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') return 'left';
  if (key === 'ArrowRight' || key === 'd' || key === 'D') return 'right';
  if (key === 'ArrowUp' || key === 'w' || key === 'W') return 'up';
  if (key === 'ArrowDown' || key === 's' || key === 'S') return 'down';
  return undefined;
}
