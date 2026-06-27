import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CameraKind, RenderGraphKind, RenderNodeKind, vectorText, type RenderNode, type Vec3 } from '@royal/renderer-core';
import {
  buildPickTargets,
  createGltfPickGeometry,
  createOrthographicUiScene,
  fitGltfToFrame,
  hitGltfGeometry,
  layoutTextCells,
  layoutWithYoga,
  materials,
  navigatePickTarget,
  pickTarget,
  pickTargetAtPoint,
  type CellPoint,
  type GltfJson,
  type GltfPickGeometry,
  type LayoutBox,
  pointerToCell
} from './royalChargridPrimitives';
import {
  createKitchenSinkSpec,
  cellPixelAspect,
  desktopGrid,
  imageRequest,
  imageSnap,
  mobileGrid
} from './yogaRoyal';

type MeshNode = RenderNode & {
  readonly geometry?: {
    readonly size?: Vec3;
  };
  readonly kind: typeof RenderNodeKind.Mesh;
  readonly material: unknown;
  readonly transform?: {
    readonly position?: Vec3;
  };
};

type GltfNode = RenderNode & {
  readonly kind: typeof RenderNodeKind.Gltf;
  readonly transform?: {
    readonly scale?: readonly number[];
  };
};

type VectorTextNode = RenderNode & {
  readonly cellHeight: number;
  readonly color: readonly number[];
  readonly glyphs: readonly {
    readonly cell?: {
      readonly center: readonly [number, number];
      readonly column: number;
      readonly span: number;
    };
    readonly center: Vec3;
    readonly char: string;
    readonly span: number;
  }[];
  readonly kind: typeof RenderNodeKind.VectorText;
};

const isMeshNode = (node: RenderNode): node is MeshNode => node.kind === RenderNodeKind.Mesh;
const isGltfNode = (node: RenderNode): node is GltfNode => node.kind === RenderNodeKind.Gltf;
const isVectorTextNode = (node: RenderNode): node is VectorTextNode => node.kind === RenderNodeKind.VectorText;
const closeToInteger = (value: number): boolean => Math.abs(value - Math.round(value)) < 0.000001;
const onGridLine = (grid: typeof desktopGrid, point: CellPoint): boolean =>
  Number.isInteger(point.x) ||
  Number.isInteger(point.y) ||
  Number.isInteger(grid.columns - point.x) ||
  Number.isInteger(grid.rows - point.y);

const loadFixtureHelmetGeometry = (): GltfPickGeometry => {
  const gltfUrl = new URL('../../../fixtures/DamagedHelmet/DamagedHelmet.gltf', import.meta.url);
  const binUrl = new URL('../../../fixtures/DamagedHelmet/DamagedHelmet.bin', import.meta.url);
  const json = JSON.parse(readFileSync(gltfUrl, 'utf8')) as GltfJson;
  const bin = readFileSync(binUrl);
  const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return createGltfPickGeometry(json, [buffer]);
};

const projectedGeometryBounds = (helmet: LayoutBox, geometry: GltfPickGeometry) => {
  const frame = fitGltfToFrame(helmet);
  expect(frame).toBeDefined();
  expect(helmet.gltf).toBeDefined();

  const [minX, minY] = helmet.gltf!.bounds.min;
  const [maxX, maxY] = helmet.gltf!.bounds.max;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const triangle of geometry.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      const x = frame!.center[0] + (point[0] - centerX) * frame!.scale[0];
      const y = frame!.center[1] + (centerY - point[1]) * frame!.scale[1];
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
};

const findHelmetHitPoints = (
  grid: typeof desktopGrid,
  boxes: readonly LayoutBox[],
  helmet: LayoutBox,
  targets: ReturnType<typeof buildPickTargets>,
  geometry: GltfPickGeometry
): { readonly hit: CellPoint; readonly miss: CellPoint } => {
  const frame = fitGltfToFrame(helmet);
  expect(frame).toBeDefined();
  const geometryById = new Map([['helmet', geometry]]);
  let hit: CellPoint | undefined;
  let miss: CellPoint | undefined;

  for (let y = frame!.rect.y + 0.25; y < frame!.rect.y + frame!.rect.height; y += 0.5) {
    for (let x = frame!.rect.x + 0.25; x < frame!.rect.x + frame!.rect.width; x += 0.5) {
      const point = { x, y };
      if (onGridLine(grid, point)) continue;
      const intersects = hitGltfGeometry(grid, helmet, point, geometry);
      const picked = pickTargetAtPoint(grid, boxes, targets, point, geometryById)?.target.id === 'helmet';
      hit ??= picked ? point : undefined;
      miss ??= intersects ? undefined : point;
      if (hit !== undefined && miss !== undefined) return { hit, miss };
    }
  }

  throw new Error('Expected both real helmet hit and empty fitted-frame point');
};

describe('Yoga Royal TUI kitchen sink', () => {
  it.each([
    ['desktop', desktopGrid, false],
    ['mobile', mobileGrid, true]
  ] as const)('keeps %s primitives on integer cells inside the grid', (_name, grid, compact) => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(compact), grid);

    for (const box of boxes) {
      expect(Number.isInteger(box.x), box.id).toBe(true);
      expect(Number.isInteger(box.y), box.id).toBe(true);
      expect(Number.isInteger(box.width), box.id).toBe(true);
      expect(Number.isInteger(box.height), box.id).toBe(true);
      expect(box.x, box.id).toBeGreaterThanOrEqual(0);
      expect(box.y, box.id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, box.id).toBeLessThanOrEqual(grid.columns);
      expect(box.y + box.height, box.id).toBeLessThanOrEqual(grid.rows);
    }
  });

  it('keeps the intentionally awkward image snapped down with ghost pixels', () => {
    expect(imageSnap).toMatchObject({
      columns: 32,
      rows: 7,
      ghostRightPx: 5,
      ghostBottomPx: 11
    });
  });

  it('exposes a small set of TUI controls as pick targets', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const targets = buildPickTargets(boxes);

    expect(targets.map((target) => target.id).sort()).toEqual([
      'button-primary',
      'button-secondary',
      'helmet',
      'image',
      'select-row',
      'switch-row',
      'tab-edit',
      'tab-run'
    ]);
    expect(targets.every((target) => target.bounds.space === 'cell')).toBe(true);
    expect(targets.map((target) => [target.id, target.interaction.role, target.interaction.group]).sort()).toEqual([
      ['button-primary', 'button', 'controls'],
      ['button-secondary', 'button', 'controls'],
      ['helmet', 'media', 'media'],
      ['image', 'media', 'media'],
      ['select-row', 'select', 'controls'],
      ['switch-row', 'checkbox', 'controls'],
      ['tab-edit', 'tab', 'toolbar'],
      ['tab-run', 'tab', 'toolbar']
    ]);
  });

  it('uses the corrected fitted model footprint as the broad-phase helmet target', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const helmet = boxes.find((box) => box.id === 'helmet');
    expect(helmet).toBeDefined();
    const fitted = fitGltfToFrame(helmet!);
    const target = buildPickTargets(boxes).find((pick) => pick.id === 'helmet');

    expect(fitted).toBeDefined();
    expect(target?.bounds.rect).toEqual(fitted?.rect);
    expect(target!.bounds.rect.width).toBeLessThan(helmet!.width);
    expect(target!.bounds.rect.height).toBeLessThanOrEqual(helmet!.height);

    expect(pickTarget([target!], {
      x: Math.floor(helmet!.x),
      y: Math.floor(target!.bounds.rect.y + target!.bounds.rect.height / 2)
    })).toBeUndefined();
    expect(pickTarget([target!], {
      x: Math.floor(target!.bounds.rect.x + target!.bounds.rect.width / 2),
      y: Math.floor(target!.bounds.rect.y + target!.bounds.rect.height / 2)
    })?.target.id).toBe('helmet');
  });

  it('keeps the helmet broad phase as a superset of projected rotated geometry', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const helmet = boxes.find((box) => box.id === 'helmet');
    expect(helmet).toBeDefined();
    const target = buildPickTargets(boxes).find((pick) => pick.id === 'helmet');
    const projected = projectedGeometryBounds(helmet!, loadFixtureHelmetGeometry());
    const rect = target!.bounds.rect;
    const epsilon = 0.000001;

    expect(projected.x).toBeGreaterThanOrEqual(rect.x - epsilon);
    expect(projected.y).toBeGreaterThanOrEqual(rect.y - epsilon);
    expect(projected.x + projected.width).toBeLessThanOrEqual(rect.x + rect.width + epsilon);
    expect(projected.y + projected.height).toBeLessThanOrEqual(rect.y + rect.height + epsilon);
  });

  it('requires a ray hit on GLTF triangles before picking the helmet', () => {
    const grid = { columns: 10, rows: 10 };
    const helmet = {
      id: 'helmet',
      interaction: { label: 'Helmet geometry', role: 'media' as const, group: 'media' },
      label: 'gltf',
      gltf: {
        bounds: { min: [0, 0, 0] as const, max: [1, 1, 0] as const },
        cellAspect: 1,
        src: '/helmet.gltf'
      },
      primitive: 'gltfPreview' as const,
      tone: 'media' as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10
    };
    const targets = buildPickTargets([helmet]);
    const geometry = {
      triangles: [{
        a: [0.25, 0.25, 0] as const,
        b: [0.75, 0.25, 0] as const,
        c: [0.5, 0.75, 0] as const
      }]
    };
    const geometryById = new Map([['helmet', geometry]]);

    expect(hitGltfGeometry(grid, helmet, { x: 5.1, y: 5.1 }, geometry)).toBe(true);
    expect(pickTargetAtPoint(grid, [helmet], targets, { x: 5.1, y: 5.1 }, geometryById)?.target.id).toBe('helmet');
    expect(pickTargetAtPoint(grid, [helmet], targets, { x: 1.25, y: 5 }, geometryById)).toBeUndefined();
  });

  it('picks actual DamagedHelmet triangles and rejects empty fitted-frame points', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const helmet = boxes.find((box) => box.id === 'helmet');
    expect(helmet).toBeDefined();
    const geometry = loadFixtureHelmetGeometry();
    const targets = buildPickTargets(boxes);
    const { hit, miss } = findHelmetHitPoints(desktopGrid, boxes, helmet!, targets, geometry);
    const geometryById = new Map([['helmet', geometry]]);

    expect(geometry.triangles.length).toBeGreaterThan(1000);
    expect(pickTargetAtPoint(desktopGrid, boxes, targets, hit, geometryById)?.target.id).toBe('helmet');
    expect(pickTargetAtPoint(desktopGrid, boxes, targets, miss, geometryById)).toBeUndefined();
  });

  it('fits the GLTF with cell-aspect compensation and preserves visual aspect ratio', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const helmet = boxes.find((box) => box.id === 'helmet');
    const fitted = fitGltfToFrame(helmet!);
    expect(helmet?.gltf).toBeDefined();
    expect(fitted).toBeDefined();

    const modelWidth = helmet!.gltf!.bounds.max[0] - helmet!.gltf!.bounds.min[0];
    const modelHeight = helmet!.gltf!.bounds.max[1] - helmet!.gltf!.bounds.min[1];
    expect(fitted!.scale[1]).toBeCloseTo(fitted!.scale[0] * cellPixelAspect, 6);
    expect(fitted!.rect.width).toBeCloseTo(modelWidth * fitted!.scale[0], 6);
    expect(fitted!.rect.height).toBeCloseTo(modelHeight * fitted!.scale[1], 6);
    expect((fitted!.rect.width * imageRequest.chPx) / (fitted!.rect.height * imageRequest.linePx)).toBeCloseTo(modelWidth / modelHeight, 6);
    expect(fitted!.rect.width).toBeLessThanOrEqual(helmet!.width);
    expect(fitted!.rect.height).toBeLessThanOrEqual(helmet!.height);
  });

  it('renders the GLTF transform with screen-space source aspect', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const helmet = boxes.find((box) => box.id === 'helmet');
    const scene = createOrthographicUiScene(desktopGrid, boxes);
    const gltfNode = scene.children[0]?.children.find(isGltfNode);
    expect(helmet?.gltf).toBeDefined();
    expect(gltfNode?.transform?.scale).toBeDefined();

    const modelWidth = helmet!.gltf!.bounds.max[0] - helmet!.gltf!.bounds.min[0];
    const modelHeight = helmet!.gltf!.bounds.max[1] - helmet!.gltf!.bounds.min[1];
    const scale = gltfNode!.transform!.scale!;
    const screenWidth = modelWidth * scale[0] * imageRequest.chPx;
    const screenHeight = modelHeight * scale[1] * imageRequest.linePx;

    expect(scale[1]).not.toBeCloseTo(scale[0], 6);
    expect(screenWidth / screenHeight).toBeCloseTo(modelWidth / modelHeight, 6);
  });

  it('moves between pick targets by spatial direction', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const targets = buildPickTargets(boxes);

    expect(navigatePickTarget(targets, 'select-row', 'down')?.id).toBe('switch-row');
    expect(navigatePickTarget(targets, 'switch-row', 'down')?.id).toBe('button-primary');
    expect(navigatePickTarget(targets, 'button-primary', 'right')?.id).toBe('helmet');
  });

  it('maps pointer pixels into cells', () => {
    expect(pointerToCell(desktopGrid, {
      left: 10,
      top: 20,
      width: 720,
      height: 340
    }, {
      clientX: 365,
      clientY: 185
    })).toEqual({ x: 35, y: 16 });
    expect(pointerToCell(desktopGrid, {
      left: 10,
      top: 20,
      width: 720,
      height: 340
    }, {
      clientX: 10,
      clientY: 20
    })).toEqual({ x: 0, y: 0 });
    expect(pointerToCell(desktopGrid, {
      left: 10,
      top: 20,
      width: 720,
      height: 340
    }, {
      clientX: 730,
      clientY: 360
    })).toBeUndefined();
    expect(pointerToCell(desktopGrid, {
      left: 10,
      top: 20,
      width: 0,
      height: 340
    }, {
      clientX: 10,
      clientY: 20
    })).toBeUndefined();
  });

  it('renders activation state separately from hover or focus state', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const button = boxes.find((box) => box.id === 'button-primary');
    expect(button).toBeDefined();

    const scene = createOrthographicUiScene(desktopGrid, boxes, {
      activeIds: new Set(['button-primary']),
      focusIds: new Set(['button-primary'])
    });
    const nodes = scene.children[0]?.children ?? [];
    const buttonCenter = [
      button!.x + button!.width / 2 - desktopGrid.columns / 2,
      desktopGrid.rows / 2 - button!.y - button!.height / 2
    ];
    const buttonMesh = nodes.filter(isMeshNode).find((node) => {
      const position = node.transform?.position;
      return position !== undefined && position[0] === buttonCenter[0] && position[1] === buttonCenter[1];
    });

    expect(buttonMesh?.kind).toBe(RenderNodeKind.Mesh);
    expect(buttonMesh?.material).toBe(materials.active);
  });

  it('builds a Royal scene with orthographic 2D primitives and model nodes', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const scene = createOrthographicUiScene(desktopGrid, boxes);
    const renderPass = scene.children[0];
    expect(scene.kind).toBe(RenderGraphKind.Scene);
    expect(renderPass?.kind).toBe(RenderGraphKind.Pass);
    expect(renderPass?.camera.kind).toBe(CameraKind.Orthographic);
    expect(renderPass?.camera).toMatchObject({
      bottom: -desktopGrid.rows / 2,
      left: -desktopGrid.columns / 2,
      right: desktopGrid.columns / 2,
      top: desktopGrid.rows / 2
    });

    const nodes = renderPass?.children ?? [];
    const gridLineCount = desktopGrid.columns + 1 + desktopGrid.rows + 1;
    const meshNodes = nodes.filter(isMeshNode);
    const gridLines = meshNodes.filter((node) => node.material === materials.grid);
    const gltfNodes = nodes.filter(isGltfNode);
    const lights = nodes.filter((node) => node.kind === RenderNodeKind.DirectionalLight);
    const frameBars = meshNodes.filter((node) => node.material === materials.media);
    const checkerTiles = meshNodes.filter((node) => node.material === materials.imageA || node.material === materials.imageB);
    const imageGhosts = meshNodes.filter((node) => node.material === materials.imageGhost);

    expect(lights).toHaveLength(1);
    expect(gridLines).toHaveLength(gridLineCount);
    expect(gltfNodes).toHaveLength(1);
    expect(gltfNodes[0]).toMatchObject({ src: '/DamagedHelmet/DamagedHelmet.gltf' });
    expect(frameBars.length).toBeGreaterThanOrEqual(4);
    expect(checkerTiles.length).toBeGreaterThan(0);
    expect(imageGhosts).toHaveLength(1);
  });

  it('renders text as grid-aligned vector glyph runs without raster metadata', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const scene = createOrthographicUiScene(desktopGrid, boxes);
    const nodes = scene.children[0]?.children ?? [];
    const textNodes = nodes.filter(isVectorTextNode);
    const meshNodes = nodes.filter(isMeshNode);
    const textMeshes = meshNodes.filter((node) => node.material === materials.text || node.material === materials.textDark);
    const apply = boxes.find((box) => box.id === 'button-primary');
    const anchors = layoutTextCells(apply!);
    const applyText = textNodes.find((node) => node.glyphs.map((glyph) => glyph.char).join('') === 'apply');

    expect(textNodes.length).toBeGreaterThan(0);
    expect(textMeshes).toHaveLength(0);
    expect(nodes.some((node) => 'font' in node || 'rasterSize' in node || 'texture' in node || 'canvas' in node)).toBe(false);
    expect(apply).toBeDefined();
    expect(applyText).toBeDefined();
    expect(applyText!.color).toEqual(materials.text.color);
    expect(applyText!.cellHeight).toBe(1.5);
    expect(applyText!.glyphs).toHaveLength(anchors.length);

    for (const [index, anchor] of anchors.entries()) {
      const glyph = applyText!.glyphs[index];
      expect(glyph).toBeDefined();
      expect(glyph!.char).toBe(anchor.char);
      expect(glyph!.span).toBe(anchor.span);
      expect(glyph!.cell).toEqual({
        center: anchor.center,
        column: anchor.column,
        span: anchor.span
      });
      expect(glyph!.center).toEqual([
        anchor.center[0] - desktopGrid.columns / 2,
        desktopGrid.rows / 2 - anchor.center[1],
        expect.any(Number)
      ]);
      expect(glyph!.center[2]).toBeGreaterThan(4);
    }
  });

  it('renders layout boxes and checker tiles on integer cell edges', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const scene = createOrthographicUiScene(desktopGrid, boxes);
    const meshNodes = scene.children[0]?.children.filter(isMeshNode) ?? [];

    for (const box of boxes) {
      const expected = {
        x: box.x + box.width / 2 - desktopGrid.columns / 2,
        y: desktopGrid.rows / 2 - box.y - box.height / 2,
        width: box.width,
        height: box.height
      };
      const rendered = meshNodes.find((node) => {
        const position = node.transform?.position;
        const size = node.geometry?.size;
        return position !== undefined &&
          size !== undefined &&
          position[0] === expected.x &&
          position[1] === expected.y &&
          size[0] === expected.width &&
          size[1] === expected.height;
      });

      expect(rendered, box.id).toBeDefined();
    }

    const checkerTiles = meshNodes.filter((node) => node.material === materials.imageA || node.material === materials.imageB);
    expect(checkerTiles.length).toBeGreaterThan(0);

    for (const tile of checkerTiles) {
      const position = tile.transform?.position;
      const size = tile.geometry?.size;
      expect(position).toBeDefined();
      expect(size).toBeDefined();

      const centerX = position![0] + desktopGrid.columns / 2;
      const centerY = desktopGrid.rows / 2 - position![1];
      expect(closeToInteger(centerX - size![0] / 2)).toBe(true);
      expect(closeToInteger(centerX + size![0] / 2)).toBe(true);
      expect(closeToInteger(centerY - size![1] / 2)).toBe(true);
      expect(closeToInteger(centerY + size![1] / 2)).toBe(true);
    }
  });

  it('keeps button text in the Royal data layer with grid-centered character anchors', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const labels = boxes
      .filter((box) => box.interaction?.role === 'button')
      .map((box) => [box.id, box.text]);
    const apply = boxes.find((box) => box.id === 'button-primary');
    expect(apply).toBeDefined();
    const anchors = layoutTextCells(apply!);

    expect(labels).toContainEqual(['button-primary', 'apply']);
    expect(labels).toContainEqual(['button-secondary', 'reset']);
    expect(anchors.map((anchor) => [anchor.char, anchor.span])).toEqual([
      ['a', 1],
      ['p', 1],
      ['p', 1],
      ['l', 1],
      ['y', 1]
    ]);
    expect(anchors.every((anchor) => anchor.center[0] % 1 === 0.5)).toBe(true);
    expect(anchors.every((anchor) => anchor.center[0] > apply!.x && anchor.center[0] < apply!.x + apply!.width)).toBe(true);
    expect(anchors.every((anchor) => anchor.center[1] === apply!.y + apply!.height / 2)).toBe(true);
  });

  it('lays out emoji as two-cell spans centered across both cells', () => {
    const anchors = layoutTextCells({
      text: 'a🙂b',
      x: 4,
      y: 2,
      width: 8,
      height: 3
    });

    expect(anchors.map((anchor) => [anchor.char, anchor.column, anchor.span, anchor.center])).toEqual([
      ['a', 6, 1, [6.5, 3.5]],
      ['🙂', 7, 2, [8, 3.5]],
      ['b', 9, 1, [9.5, 3.5]]
    ]);
    expect(() =>
      vectorText({
        color: materials.text.color,
        glyphs: [{
          center: [0, 0, 0],
          char: '🙂',
          span: 2
        }]
      })
    ).toThrow('Unsupported vector glyph');
  });

  it('switches the model-sized frame to hover color on focus', () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const plainScene = createOrthographicUiScene(desktopGrid, boxes);
    const focusedScene = createOrthographicUiScene(desktopGrid, boxes, {
      focusIds: new Set(['helmet'])
    });
    const plainGlow = plainScene.children[0]?.children.filter(isMeshNode).filter((node) => node.material === materials.gltfGlow) ?? [];
    const focusedGlow = focusedScene.children[0]?.children.filter(isMeshNode).filter((node) => node.material === materials.gltfGlow) ?? [];

    expect(plainGlow).toHaveLength(0);
    expect(focusedGlow).toHaveLength(4);
    expect(focusedGlow.every((node) => node.transform?.position[2] !== undefined && node.transform.position[2] > 0.5)).toBe(true);
  });
});
