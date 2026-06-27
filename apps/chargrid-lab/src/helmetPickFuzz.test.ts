import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  buildPickTargets,
  createGltfPickGeometry,
  fitGltfToFrame,
  layoutWithYoga,
  pickTargetAtPoint,
  type CellGrid,
  type CellPoint,
  type CellRect,
  type GltfJson,
  type GltfPickGeometry,
  type LayoutBox
} from './royalChargridPrimitives';
import { createKitchenSinkSpec, desktopGrid } from './yogaRoyal';

const sampleColumns = 56;
const sampleRows = 44;
const sampleCount = sampleColumns * sampleRows;
// The deterministic helmet geometry oracle is intentionally broad enough to catch
// visibility drift, so allow CI machines more than Vitest's default 5s timeout.
const helmetPickFuzzTimeoutMs = 15_000;

type PickCoverage = {
  readonly falseNegatives: readonly VisibilityMismatch[];
  readonly falsePositives: readonly VisibilityMismatch[];
  readonly picked: number;
  readonly visible: number;
  readonly mismatchPoints: readonly CellPoint[];
  readonly ms: number;
  readonly samples: number;
};

type ProjectedTriangle = {
  readonly a: ProjectedVertex;
  readonly b: ProjectedVertex;
  readonly c: ProjectedVertex;
  readonly ownerId: string;
};

type ProjectedVertex = CellPoint & {
  readonly z: number;
};

type VisibilityMismatch = {
  readonly expectedOwnerId: string | undefined;
  readonly point: CellPoint;
  readonly pickedOwnerId: string | undefined;
};

type VisibleOwner = {
  readonly id: string;
  readonly z: number;
};

const primitiveDepth = 0.08;
const boxFrontZ = (index: number): number => index * 0.01 + primitiveDepth / 2;
const checkerFrontZ = (index: number): number => 0.25 + index * 0.01 + primitiveDepth / 2;
const gridLineFrontZ = 4.01;

const loadFixtureHelmetGeometry = (): GltfPickGeometry => {
  const gltfUrl = new URL('../../../fixtures/DamagedHelmet/DamagedHelmet.gltf', import.meta.url);
  const binUrl = new URL('../../../fixtures/DamagedHelmet/DamagedHelmet.bin', import.meta.url);
  const json = JSON.parse(readFileSync(gltfUrl, 'utf8')) as GltfJson;
  const bin = readFileSync(binUrl);
  const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return createGltfPickGeometry(json, [buffer]);
};

const findHelmetBox = (boxes: readonly LayoutBox[]): LayoutBox => {
  const helmet = boxes.find((box) => box.id === 'helmet');
  if (helmet === undefined) throw new Error('Expected kitchen sink layout to include helmet');
  return helmet;
};

const createSeededRandom = (seed: number): () => number => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
};

const sampleFrame = (rect: CellRect): readonly CellPoint[] => {
  const random = createSeededRandom(0x51f15e);
  const points: CellPoint[] = [];

  for (let row = 0; row < sampleRows; row += 1) {
    for (let column = 0; column < sampleColumns; column += 1) {
      const jitterX = 0.15 + random() * 0.7;
      const jitterY = 0.15 + random() * 0.7;
      points.push({
        x: rect.x + ((column + jitterX) / sampleColumns) * rect.width,
        y: rect.y + ((row + jitterY) / sampleRows) * rect.height
      });
    }
  }

  return points;
};

const projectGltfGeometry = (layoutBox: LayoutBox, geometry: GltfPickGeometry): readonly ProjectedTriangle[] => {
  const frame = fitGltfToFrame(layoutBox);
  if (frame === undefined || layoutBox.gltf === undefined) {
    throw new Error(`Expected ${layoutBox.id} to have a fitted GLTF frame`);
  }

  const [minX, minY, minZ] = layoutBox.gltf.bounds.min;
  const [maxX, maxY, maxZ] = layoutBox.gltf.bounds.max;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const projectVertex = (point: readonly [number, number, number]): ProjectedVertex => ({
    x: frame.center[0] + (point[0] - centerX) * frame.scale[0],
    y: frame.center[1] + (centerY - point[1]) * frame.scale[1],
    z: 0.5 + (point[2] - centerZ) * frame.scale[2]
  });

  return geometry.triangles.map((triangle) => ({
    a: projectVertex(triangle.a),
    b: projectVertex(triangle.b),
    c: projectVertex(triangle.c),
    ownerId: layoutBox.id
  }));
};

const signedArea = (triangle: ProjectedTriangle): number =>
  (triangle.b.x - triangle.a.x) * (triangle.c.y - triangle.a.y) -
  (triangle.b.y - triangle.a.y) * (triangle.c.x - triangle.a.x);

const containsProjectedTrianglePoint = (
  triangle: ProjectedTriangle,
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
  const inside = alpha >= epsilon && beta >= epsilon && gamma >= epsilon;

  return {
    inside,
    z: alpha * triangle.a.z + beta * triangle.b.z + gamma * triangle.c.z
  };
};

const containsRectPoint = (rect: CellRect, point: CellPoint): boolean =>
  point.x >= rect.x &&
  point.x < rect.x + rect.width &&
  point.y >= rect.y &&
  point.y < rect.y + rect.height;

const frontmost = (current: VisibleOwner | undefined, candidate: VisibleOwner): VisibleOwner =>
  current === undefined || candidate.z > current.z ? candidate : current;

const createProjectedVisibilityOracle = (
  grid: CellGrid,
  boxes: readonly LayoutBox[],
  geometryById: ReadonlyMap<string, GltfPickGeometry>
): ((point: CellPoint) => VisibleOwner | undefined) => {
  const frontFacingTriangles = boxes.flatMap((layoutBox) => {
    const geometry = geometryById.get(layoutBox.id);
    if (layoutBox.primitive !== 'gltfPreview' || geometry === undefined) return [];

    return projectGltfGeometry(layoutBox, geometry)
      // Cell Y is down, so front-facing GL CCW triangles have negative cell-space area.
      .filter((triangle) => signedArea(triangle) < -0.0000001);
  });
  const boxesByDepth = boxes.map((layoutBox, index) => ({ index, layoutBox }));

  return (point) => {
    let visible: VisibleOwner | undefined;

    for (const { index, layoutBox } of boxesByDepth) {
      if (containsRectPoint(layoutBox, point)) {
        const ownerId = layoutBox.primitive === 'gltfPreview' ? `${layoutBox.id}:preview-background` : layoutBox.id;
        visible = frontmost(visible, { id: ownerId, z: boxFrontZ(index) });
      }

      if (layoutBox.primitive === 'checkerImage' && containsRectPoint(layoutBox, point)) {
        visible = frontmost(visible, { id: layoutBox.id, z: checkerFrontZ(index) });
      }
    }

    for (const triangle of frontFacingTriangles) {
      const hit = containsProjectedTrianglePoint(triangle, point);
      if (hit.inside) visible = frontmost(visible, { id: triangle.ownerId, z: hit.z });
    }

    if (
      Number.isInteger(point.x) ||
      Number.isInteger(point.y) ||
      Number.isInteger(grid.columns - point.x) ||
      Number.isInteger(grid.rows - point.y)
    ) {
      visible = frontmost(visible, { id: 'grid-line', z: gridLineFrontZ });
    }

    return visible;
  };
};

const syntheticOccludedPreviewBoxes = (): readonly LayoutBox[] => [
  {
    id: 'helmet',
    interaction: { group: 'media', label: 'Helmet geometry', role: 'media' },
    label: 'gltf',
    gltf: {
      bounds: { min: [0, 0, -1], max: [1, 1, 1] },
      cellAspect: 1,
      src: '/helmet.gltf'
    },
    primitive: 'gltfPreview',
    tone: 'media',
    x: 0,
    y: 0,
    width: 10,
    height: 10
  }
];

const syntheticBackTriangleGeometry = (): GltfPickGeometry => ({
  triangles: [{
    a: [0.25, 0.25, -1],
    b: [0.75, 0.25, -1],
    c: [0.5, 0.75, -1]
  }]
});

describe('DamagedHelmet pick fuzz', () => {
  it('samples fitted-frame points and rejects non-visible GLTF pick hits', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const targets = buildPickTargets(boxes);
    const helmet = findHelmetBox(boxes);
    const frame = fitGltfToFrame(helmet);
    const geometry = loadFixtureHelmetGeometry();
    const geometryById = new Map([['helmet', geometry]]);
    const visibleOwnerAt = createProjectedVisibilityOracle(desktopGrid, boxes, geometryById);

    expect(frame).toBeDefined();
    expect(geometry.triangles.length).toBeGreaterThan(1000);

    const startedAt = performance.now();
    const mismatchPoints: CellPoint[] = [];
    const falseNegatives: VisibilityMismatch[] = [];
    const falsePositives: VisibilityMismatch[] = [];
    let picked = 0;
    let visible = 0;

    for (const point of sampleFrame(frame!.rect)) {
      const pickedHit = pickTargetAtPoint(desktopGrid, boxes, targets, point, geometryById);
      const pickedOwnerId = pickedHit?.target.id;
      const expectedOwnerId = visibleOwnerAt(point)?.id === 'helmet' ? 'helmet' : undefined;
      const pickedHelmet = pickedOwnerId === 'helmet';
      const visibleHelmet = expectedOwnerId === 'helmet';

      if (pickedHelmet) picked += 1;
      if (visibleHelmet) visible += 1;

      if (pickedOwnerId !== expectedOwnerId) {
        const mismatch = { expectedOwnerId, pickedOwnerId, point };
        mismatchPoints.push(point);
        if (pickedHelmet && !visibleHelmet) falsePositives.push(mismatch);
        if (!pickedHelmet && visibleHelmet) falseNegatives.push(mismatch);
      }
    }

    const coverage: PickCoverage = {
      falseNegatives,
      falsePositives,
      picked,
      visible,
      mismatchPoints,
      ms: performance.now() - startedAt,
      samples: sampleCount
    };
    const visibleRatio = coverage.visible / coverage.samples;

    console.table([{
      falseNegatives: coverage.falseNegatives.length,
      falsePositives: coverage.falsePositives.length,
      ms: Number(coverage.ms.toFixed(1)),
      picked: coverage.picked,
      samples: coverage.samples,
      visible: coverage.visible,
      visibleRatio: Number(visibleRatio.toFixed(3))
    }]);

    expect(coverage.samples).toBe(sampleCount);
    expect(coverage.visible).toBeGreaterThan(500);
    expect(coverage.samples - coverage.visible).toBeGreaterThan(250);
    expect(visibleRatio).toBeGreaterThan(0.2);
    expect(visibleRatio).toBeLessThan(0.9);
    expect(coverage.falsePositives, `false positives: ${JSON.stringify(coverage.falsePositives.slice(0, 8))}`).toHaveLength(0);
    expect(coverage.falseNegatives, `false negatives: ${JSON.stringify(coverage.falseNegatives.slice(0, 8))}`).toHaveLength(0);
    expect(coverage.mismatchPoints).toHaveLength(0);
  }, helmetPickFuzzTimeoutMs);

  it('rejects a GLTF triangle hidden behind its preview background plane', () => {
    const grid = { columns: 10, rows: 10 };
    const boxes = syntheticOccludedPreviewBoxes();
    const targets = buildPickTargets(boxes);
    const geometry = syntheticBackTriangleGeometry();
    const geometryById = new Map([['helmet', geometry]]);
    const point = { x: 5.1, y: 5.1 };
    const visibleOwner = createProjectedVisibilityOracle(grid, boxes, geometryById)(point);

    expect(visibleOwner?.id).toBe('helmet:preview-background');
    expect(pickTargetAtPoint(grid, boxes, targets, point, geometryById)).toBeUndefined();
  });
});
