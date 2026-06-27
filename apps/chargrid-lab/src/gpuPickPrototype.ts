import {
  fitGltfToFrame,
  type CellGrid,
  type CellPoint,
  type CellRect,
  type GltfPickGeometry,
  type LayoutBox,
  type PickTarget,
  type Vec3
} from './royalChargridPrimitives';

const primitiveDepth = 0.08;
const gridLineZ = 4;
const pickCameraZ = 70;
const pickNear = 0.1;
const pickFar = 1000;
const maxPickId = 0xffffff;
const clearFrontZ = Number.NEGATIVE_INFINITY;
const clearDepth = 1;

export type PickRgba = readonly [number, number, number, number];

export type PickPixel = {
  readonly x: number;
  readonly y: number;
};

export type PickIdEntry = {
  readonly pickId: number;
  readonly rgba: PickRgba;
  readonly targetId: string;
};

export type PickIdRegistry = {
  readonly byPickId: ReadonlyMap<number, PickIdEntry>;
  readonly byTargetId: ReadonlyMap<string, PickIdEntry>;
  readonly entries: readonly PickIdEntry[];
};

export type GpuPickPassModel = {
  readonly colorEncoding: 'uint24-rgba8';
  readonly depthOrdering: 'larger-front-z-wins';
  readonly nonPickableId: 0;
  readonly targetIds: readonly string[];
};

export type CpuGpuPickBufferInput = {
  readonly boxes: readonly LayoutBox[];
  readonly geometryById?: ReadonlyMap<string, GltfPickGeometry>;
  readonly grid: CellGrid;
  readonly height: number;
  readonly targets: readonly PickTarget[];
  readonly viewport?: CellRect;
  readonly width: number;
};

export type SimulatedPickOwnerSource =
  | 'box'
  | 'checkerImage'
  | 'gltfTriangle'
  | 'gridLine'
  | 'previewBackground';

export type GpuPickOwner = {
  readonly frontZ: number;
  readonly ownerKey: string;
  readonly pickId: number;
  readonly pickable: boolean;
  readonly rgba: PickRgba;
  readonly source: SimulatedPickOwnerSource;
  readonly target?: PickTarget;
  readonly targetId?: string;
};

export type GpuPickBufferHit = GpuPickOwner & {
  readonly cell: CellPoint;
  readonly depth: number;
  readonly pixel: PickPixel;
};

export type CpuGpuPickBuffer = {
  readonly depthBuffer: Float32Array;
  readonly frontZBuffer: Float32Array;
  readonly frontmostOwnerAt: (pixel: PickPixel) => GpuPickBufferHit | undefined;
  readonly height: number;
  readonly model: GpuPickPassModel;
  readonly ownerKeyBuffer: readonly (string | undefined)[];
  readonly pickIdBuffer: Uint32Array;
  readonly pixelCenterToCell: (pixel: PickPixel) => CellPoint | undefined;
  readonly readDepthAt: (pixel: PickPixel) => number | undefined;
  readonly readRgbaAt: (pixel: PickPixel) => PickRgba | undefined;
  readonly registry: PickIdRegistry;
  readonly rgbaBuffer: Uint8ClampedArray;
  readonly viewport: CellRect;
  readonly width: number;
};

export type WebGlGpuPickPassPlan = {
  readonly attachments: readonly string[];
  readonly caveats: readonly string[];
  readonly output: 'frontmostOwnerAt(pixel)';
  readonly steps: readonly string[];
};

type PreparedPickScene = {
  readonly boxes: readonly LayoutBox[];
  readonly grid: CellGrid;
  readonly registry: PickIdRegistry;
  readonly targetById: ReadonlyMap<string, PickTarget>;
  readonly triangles: readonly ProjectedPickTriangle[];
};

type ProjectedPickTriangle = {
  readonly a: ProjectedPickVertex;
  readonly b: ProjectedPickVertex;
  readonly c: ProjectedPickVertex;
  readonly target: PickTarget;
};

type ProjectedPickVertex = CellPoint & {
  readonly z: number;
};

export const createPickPassModel = (targets: readonly PickTarget[]): GpuPickPassModel => ({
  colorEncoding: 'uint24-rgba8',
  depthOrdering: 'larger-front-z-wins',
  nonPickableId: 0,
  targetIds: [...new Set(targets.map((target) => target.id))].sort()
});

export const createPickIdRegistry = (targets: readonly PickTarget[]): PickIdRegistry => {
  const targetIds = [...new Set(targets.map((target) => target.id))].sort();
  if (targetIds.length > maxPickId) throw new Error(`GPU pick prototype supports at most ${maxPickId} pick IDs`);

  const entries = targetIds.map((targetId, index) => {
    const pickId = index + 1;
    return {
      pickId,
      rgba: encodePickId(pickId),
      targetId
    } satisfies PickIdEntry;
  });

  return {
    byPickId: new Map(entries.map((entry) => [entry.pickId, entry])),
    byTargetId: new Map(entries.map((entry) => [entry.targetId, entry])),
    entries
  };
};

export const encodePickId = (pickId: number): PickRgba => {
  if (!Number.isInteger(pickId) || pickId < 0 || pickId > maxPickId) {
    throw new Error(`Pick ID must be an integer from 0 to ${maxPickId}`);
  }

  if (pickId === 0) return [0, 0, 0, 0];
  return [pickId & 0xff, (pickId >>> 8) & 0xff, (pickId >>> 16) & 0xff, 255];
};

export const decodePickId = (rgba: PickRgba): number =>
  rgba[3] === 0 ? 0 : rgba[0] + (rgba[1] << 8) + (rgba[2] << 16);

export const frontZToDepth = (frontZ: number): number => {
  const eyeDistance = pickCameraZ - frontZ;
  return clamp((eyeDistance - pickNear) / (pickFar - pickNear), 0, 1);
};

export const createCpuGpuPickBuffer = (input: CpuGpuPickBufferInput): CpuGpuPickBuffer => {
  if (input.width <= 0 || input.height <= 0) throw new Error('GPU pick prototype buffer dimensions must be positive');

  const width = Math.floor(input.width);
  const height = Math.floor(input.height);
  const viewport = input.viewport ?? { x: 0, y: 0, width: input.grid.columns, height: input.grid.rows };
  const scene = preparePickScene(input);
  const pixelCount = width * height;
  const rgbaBuffer = new Uint8ClampedArray(pixelCount * 4);
  const pickIdBuffer = new Uint32Array(pixelCount);
  const frontZBuffer = new Float32Array(pixelCount);
  const depthBuffer = new Float32Array(pixelCount);
  const ownerKeyBuffer = new Array<string | undefined>(pixelCount);
  const ownerByPixel = new Array<GpuPickOwner | undefined>(pixelCount);

  frontZBuffer.fill(clearFrontZ);
  depthBuffer.fill(clearDepth);

  const pixelCenterToCell = (pixel: PickPixel): CellPoint | undefined => {
    if (!containsPixel(width, height, pixel)) return undefined;

    return {
      x: viewport.x + ((Math.floor(pixel.x) + 0.5) / width) * viewport.width,
      y: viewport.y + ((Math.floor(pixel.y) + 0.5) / height) * viewport.height
    };
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = { x, y };
      const cell = pixelCenterToCell(pixel);
      if (cell === undefined) continue;

      const owner = frontmostOwnerAtCell(scene, cell);
      if (owner === undefined) continue;

      const offset = y * width + x;
      const rgbaOffset = offset * 4;
      pickIdBuffer[offset] = owner.pickId;
      frontZBuffer[offset] = owner.frontZ;
      depthBuffer[offset] = frontZToDepth(owner.frontZ);
      ownerKeyBuffer[offset] = owner.ownerKey;
      ownerByPixel[offset] = owner;
      rgbaBuffer[rgbaOffset] = owner.rgba[0];
      rgbaBuffer[rgbaOffset + 1] = owner.rgba[1];
      rgbaBuffer[rgbaOffset + 2] = owner.rgba[2];
      rgbaBuffer[rgbaOffset + 3] = owner.rgba[3];
    }
  }

  const readRgbaAt = (pixel: PickPixel): PickRgba | undefined => {
    const offset = pixelOffset(width, height, pixel);
    if (offset === undefined) return undefined;
    const rgbaOffset = offset * 4;
    return [
      rgbaBuffer[rgbaOffset] ?? 0,
      rgbaBuffer[rgbaOffset + 1] ?? 0,
      rgbaBuffer[rgbaOffset + 2] ?? 0,
      rgbaBuffer[rgbaOffset + 3] ?? 0
    ];
  };

  return {
    depthBuffer,
    frontZBuffer,
    frontmostOwnerAt: (pixel) => {
      const offset = pixelOffset(width, height, pixel);
      const cell = pixelCenterToCell(pixel);
      if (offset === undefined || cell === undefined) return undefined;
      const owner = ownerByPixel[offset];
      if (owner === undefined) return undefined;
      return {
        ...owner,
        cell,
        depth: depthBuffer[offset] ?? clearDepth,
        pixel: { x: Math.floor(pixel.x), y: Math.floor(pixel.y) }
      };
    },
    height,
    model: createPickPassModel(input.targets),
    ownerKeyBuffer,
    pickIdBuffer,
    pixelCenterToCell,
    readDepthAt: (pixel) => {
      const offset = pixelOffset(width, height, pixel);
      if (offset === undefined) return undefined;
      return depthBuffer[offset];
    },
    readRgbaAt,
    registry: scene.registry,
    rgbaBuffer,
    viewport,
    width
  };
};

export const createWebGlGpuPickPassPlan = (): WebGlGpuPickPassPlan => ({
  attachments: [
    'RGBA8 color attachment for encoded uint24 owner IDs, with 0 reserved for no pick target',
    'depth attachment using the same orthographic camera and model transforms as the visible Royal pass'
  ],
  caveats: [
    'readPixels is synchronous in WebGL, so production should batch pointer probes or use async fences where available',
    'transparent or alpha-tested materials need an explicit pick policy before they can write owner color and depth',
    'non-pickable occluders should write owner ID 0 plus depth so hidden targets cannot win',
    'tarstate fuzz/probe rows can consume decoded targetId plus optional depth, while ID 0 becomes a no-target probe'
  ],
  output: 'frontmostOwnerAt(pixel)',
  steps: [
    'allocate an offscreen framebuffer sized to the canvas or a small probe tile',
    'clear color to ID 0 and depth to the far value',
    'draw boxes, preview backgrounds, glTF triangles, and grid occluders in a pick material',
    'encode each pickable owner as a unique RGBA color and let depth testing choose the frontmost fragment',
    'read one pixel or a compact probe row with readPixels, decode the owner ID, and join it back to the pick target registry'
  ]
});

const preparePickScene = (input: CpuGpuPickBufferInput): PreparedPickScene => {
  const registry = createPickIdRegistry(input.targets);
  const targetById = new Map(input.targets.map((target) => [target.id, target]));
  const geometryById = input.geometryById ?? new Map<string, GltfPickGeometry>();
  const triangles = input.boxes.flatMap((box) => {
    const target = targetById.get(box.id);
    const geometry = geometryById.get(box.id);
    if (box.primitive !== 'gltfPreview' || target === undefined || geometry === undefined) return [];
    return projectGltfGeometry(box, target, geometry).filter((triangle) => signedArea(triangle) < -0.0000001);
  });

  return {
    boxes: input.boxes,
    grid: input.grid,
    registry,
    targetById,
    triangles
  };
};

const frontmostOwnerAtCell = (scene: PreparedPickScene, point: CellPoint): GpuPickOwner | undefined => {
  let owner: GpuPickOwner | undefined;

  for (let index = 0; index < scene.boxes.length; index += 1) {
    const box = scene.boxes[index];
    if (box === undefined || !containsRectPoint(box, point)) continue;

    const target = scene.targetById.get(box.id);
    owner = frontmostOwner(owner, ownerForBox(scene.registry, box, target, index));

    if (box.primitive === 'checkerImage') {
      owner = frontmostOwner(owner, ownerForTargetSurface(scene.registry, target, {
        fallbackKey: `${box.id}:checkerImage`,
        frontZ: checkerSurfaceFrontZ(index),
        source: 'checkerImage'
      }));
    }
  }

  for (const triangle of scene.triangles) {
    const hit = containsProjectedTrianglePoint(triangle, point);
    if (hit.inside) {
      owner = frontmostOwner(owner, ownerForTargetSurface(scene.registry, triangle.target, {
        fallbackKey: `${triangle.target.id}:gltfTriangle`,
        frontZ: hit.z,
        source: 'gltfTriangle'
      }));
    }
  }

  if (pointHitsGridLine(scene.grid, point)) {
    owner = frontmostOwner(owner, nonPickableOwner('grid-line', gridLineZ + 0.01, 'gridLine'));
  }

  return owner;
};

const ownerForBox = (
  registry: PickIdRegistry,
  box: LayoutBox,
  target: PickTarget | undefined,
  index: number
): GpuPickOwner => {
  if (box.primitive === 'gltfPreview') {
    return nonPickableOwner(`${box.id}:preview-background`, boxSurfaceFrontZ(index), 'previewBackground');
  }

  return ownerForTargetSurface(registry, target, {
    fallbackKey: `${box.id}:box`,
    frontZ: boxSurfaceFrontZ(index),
    source: 'box'
  });
};

const ownerForTargetSurface = (
  registry: PickIdRegistry,
  target: PickTarget | undefined,
  surface: {
    readonly fallbackKey: string;
    readonly frontZ: number;
    readonly source: SimulatedPickOwnerSource;
  }
): GpuPickOwner => {
  if (target === undefined) return nonPickableOwner(surface.fallbackKey, surface.frontZ, surface.source);

  const entry = registry.byTargetId.get(target.id);
  if (entry === undefined) return nonPickableOwner(surface.fallbackKey, surface.frontZ, surface.source);

  return {
    frontZ: surface.frontZ,
    ownerKey: target.id,
    pickable: true,
    pickId: entry.pickId,
    rgba: entry.rgba,
    source: surface.source,
    target,
    targetId: target.id
  };
};

const nonPickableOwner = (
  ownerKey: string,
  frontZ: number,
  source: SimulatedPickOwnerSource
): GpuPickOwner => ({
  frontZ,
  ownerKey,
  pickable: false,
  pickId: 0,
  rgba: encodePickId(0),
  source
});

const projectGltfGeometry = (
  box: LayoutBox,
  target: PickTarget,
  geometry: GltfPickGeometry
): readonly ProjectedPickTriangle[] => {
  const frame = fitGltfToFrame(box);
  if (frame === undefined || box.gltf === undefined) return [];

  const [minX, minY, minZ] = box.gltf.bounds.min;
  const [maxX, maxY, maxZ] = box.gltf.bounds.max;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const projectVertex = (point: Vec3): ProjectedPickVertex => ({
    x: frame.center[0] + (point[0] - centerX) * frame.scale[0],
    y: frame.center[1] + (centerY - point[1]) * frame.scale[1],
    z: 0.5 + (point[2] - centerZ) * frame.scale[2]
  });

  return geometry.triangles.map((triangle) => ({
    a: projectVertex(triangle.a),
    b: projectVertex(triangle.b),
    c: projectVertex(triangle.c),
    target
  }));
};

const containsProjectedTrianglePoint = (
  triangle: ProjectedPickTriangle,
  point: CellPoint
): { readonly inside: boolean; readonly z: number } => {
  const denominator =
    (triangle.b.y - triangle.c.y) * (triangle.a.x - triangle.c.x) +
    (triangle.c.x - triangle.b.x) * (triangle.a.y - triangle.c.y);

  if (Math.abs(denominator) < 0.0000001) return { inside: false, z: 0 };

  const alpha =
    ((triangle.b.y - triangle.c.y) * (point.x - triangle.c.x) +
      (triangle.c.x - triangle.b.x) * (point.y - triangle.c.y)) /
    denominator;
  const beta =
    ((triangle.c.y - triangle.a.y) * (point.x - triangle.c.x) +
      (triangle.a.x - triangle.c.x) * (point.y - triangle.c.y)) /
    denominator;
  const gamma = 1 - alpha - beta;
  const epsilon = -0.000001;

  return {
    inside: alpha >= epsilon && beta >= epsilon && gamma >= epsilon,
    z: alpha * triangle.a.z + beta * triangle.b.z + gamma * triangle.c.z
  };
};

const signedArea = (triangle: Pick<ProjectedPickTriangle, 'a' | 'b' | 'c'>): number =>
  (triangle.b.x - triangle.a.x) * (triangle.c.y - triangle.a.y) -
  (triangle.b.y - triangle.a.y) * (triangle.c.x - triangle.a.x);

const frontmostOwner = (current: GpuPickOwner | undefined, candidate: GpuPickOwner): GpuPickOwner =>
  current === undefined || candidate.frontZ > current.frontZ ? candidate : current;

const boxSurfaceFrontZ = (index: number): number => index * 0.01 + primitiveDepth / 2;

const checkerSurfaceFrontZ = (index: number): number => 0.25 + index * 0.01 + primitiveDepth / 2;

const containsRectPoint = (rect: CellRect, point: CellPoint): boolean =>
  point.x >= rect.x &&
  point.x < rect.x + rect.width &&
  point.y >= rect.y &&
  point.y < rect.y + rect.height;

const pointHitsGridLine = (grid: CellGrid, point: CellPoint): boolean =>
  Number.isInteger(point.x) ||
  Number.isInteger(point.y) ||
  Number.isInteger(grid.columns - point.x) ||
  Number.isInteger(grid.rows - point.y);

const containsPixel = (width: number, height: number, pixel: PickPixel): boolean =>
  Number.isFinite(pixel.x) &&
  Number.isFinite(pixel.y) &&
  Math.floor(pixel.x) >= 0 &&
  Math.floor(pixel.x) < width &&
  Math.floor(pixel.y) >= 0 &&
  Math.floor(pixel.y) < height;

const pixelOffset = (width: number, height: number, pixel: PickPixel): number | undefined => {
  if (!containsPixel(width, height, pixel)) return undefined;
  return Math.floor(pixel.y) * width + Math.floor(pixel.x);
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
