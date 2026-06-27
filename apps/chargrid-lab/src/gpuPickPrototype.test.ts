import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildPickTargets,
  createGltfPickGeometry,
  fitGltfToFrame,
  layoutWithYoga,
  pickTargetAtPoint,
  type CellPoint,
  type GltfJson,
  type GltfPickGeometry,
  type LayoutBox,
  type PickTarget
} from './royalChargridPrimitives';
import {
  createCpuGpuPickBuffer,
  createPickIdRegistry,
  createWebGlGpuPickPassPlan,
  decodePickId,
  encodePickId
} from './gpuPickPrototype';
import { createKitchenSinkSpec, desktopGrid } from './yogaRoyal';

const loadFixtureHelmetGeometry = (): GltfPickGeometry => {
  const gltfUrl = new URL('../../../fixtures/DamagedHelmet/DamagedHelmet.gltf', import.meta.url);
  const binUrl = new URL('../../../fixtures/DamagedHelmet/DamagedHelmet.bin', import.meta.url);
  const json = JSON.parse(readFileSync(gltfUrl, 'utf8')) as GltfJson;
  const bin = readFileSync(binUrl);
  const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return createGltfPickGeometry(json, [buffer]);
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

const target = (id: string, layer: number): PickTarget => ({
  bounds: {
    rect: { x: 0, y: 0, width: 1, height: 1 },
    space: 'cell'
  },
  id,
  interaction: { label: id, role: 'button' },
  kind: 'box',
  label: id,
  layer
});

describe('GPU pick prototype', () => {
  it('assigns deterministic uint24 pick colors with zero reserved for no target', () => {
    const registry = createPickIdRegistry([target('zeta', 0), target('alpha', 1)]);

    expect(encodePickId(0)).toEqual([0, 0, 0, 0]);
    expect(encodePickId(0x123456)).toEqual([0x56, 0x34, 0x12, 255]);
    expect(decodePickId([0x56, 0x34, 0x12, 255])).toBe(0x123456);
    expect(decodePickId([0x56, 0x34, 0x12, 0])).toBe(0);
    expect(registry.entries.map((entry) => [entry.targetId, entry.pickId, entry.rgba])).toEqual([
      ['alpha', 1, [1, 0, 0, 255]],
      ['zeta', 2, [2, 0, 0, 255]]
    ]);
  });

  it('keeps a back GLTF triangle from picking through its preview background depth', () => {
    const grid = { columns: 10, rows: 10 };
    const boxes = syntheticOccludedPreviewBoxes();
    const targets = buildPickTargets(boxes);
    const geometryById = new Map([['helmet', syntheticBackTriangleGeometry()]]);
    const buffer = createCpuGpuPickBuffer({
      boxes,
      geometryById,
      grid,
      height: 100,
      targets,
      width: 100
    });
    const hiddenTrianglePixel = { x: 51, y: 51 };
    const simulatedHit = buffer.frontmostOwnerAt(hiddenTrianglePixel);
    const cpuHit = pickTargetAtPoint(grid, boxes, targets, { x: 5.1, y: 5.1 }, geometryById);

    expect(simulatedHit).toMatchObject({
      ownerKey: 'helmet:preview-background',
      pickId: 0,
      pickable: false,
      source: 'previewBackground'
    });
    expect(simulatedHit?.targetId).toBeUndefined();
    expect(buffer.readRgbaAt(hiddenTrianglePixel)).toEqual([0, 0, 0, 0]);
    expect(buffer.readDepthAt(hiddenTrianglePixel)).toBeLessThan(1);
    expect(cpuHit).toBeUndefined();
  });

  it('matches the current CPU picker on visible DamagedHelmet sample pixels', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const targets = buildPickTargets(boxes);
    const helmet = boxes.find((box) => box.id === 'helmet');
    const geometry = loadFixtureHelmetGeometry();
    const geometryById = new Map([['helmet', geometry]]);
    const frame = fitGltfToFrame(helmet!);
    let visibleHelmetPixels = 0;
    let emptyPixels = 0;

    expect(helmet).toBeDefined();
    expect(frame).toBeDefined();
    expect(geometry.triangles.length).toBeGreaterThan(1000);

    const buffer = createCpuGpuPickBuffer({
      boxes,
      geometryById,
      grid: desktopGrid,
      height: 36,
      targets,
      viewport: frame!.rect,
      width: 48
    });
    const collectedMismatches: {
      readonly cell: CellPoint;
      readonly cpuTargetId: string | undefined;
      readonly gpuTargetId: string | undefined;
    }[] = [];

    for (let y = 0; y < buffer.height; y += 1) {
      for (let x = 0; x < buffer.width; x += 1) {
        const pixel = { x, y };
        const cell = buffer.pixelCenterToCell(pixel);
        const gpuTargetId = buffer.frontmostOwnerAt(pixel)?.targetId;
        const cpuTargetId = cell === undefined
          ? undefined
          : pickTargetAtPoint(desktopGrid, boxes, targets, cell, geometryById)?.target.id;

        if (gpuTargetId === 'helmet') visibleHelmetPixels += 1;
        if (gpuTargetId === undefined) emptyPixels += 1;
        if (gpuTargetId !== cpuTargetId && cell !== undefined) {
          collectedMismatches.push({ cell, cpuTargetId, gpuTargetId });
        }
      }
    }

    expect(visibleHelmetPixels).toBeGreaterThan(300);
    expect(emptyPixels).toBeGreaterThan(100);
    expect(collectedMismatches).toHaveLength(0);
  });

  it('defines the minimal WebGL pass shape for a real readPixels implementation', () => {
    const plan = createWebGlGpuPickPassPlan();

    expect(plan.output).toBe('frontmostOwnerAt(pixel)');
    expect(plan.attachments).toEqual([
      expect.stringContaining('RGBA8'),
      expect.stringContaining('depth')
    ]);
    expect(plan.steps).toEqual([
      expect.stringContaining('offscreen framebuffer'),
      expect.stringContaining('clear color'),
      expect.stringContaining('pick material'),
      expect.stringContaining('unique RGBA'),
      expect.stringContaining('readPixels')
    ]);
    expect(plan.caveats).toEqual([
      expect.stringContaining('readPixels'),
      expect.stringContaining('alpha-tested'),
      expect.stringContaining('ID 0'),
      expect.stringContaining('tarstate')
    ]);
  });
});
