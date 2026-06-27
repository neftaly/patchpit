import {
  boxGeometry,
  directionalLight,
  gltf,
  mesh,
  orthographicCamera,
  pass,
  scene,
  unlitMaterial,
  vectorText,
  type RenderNode,
  type RenderRoot
} from '@royal/renderer-core';
import Yoga, {
  Direction,
  FlexDirection,
  Gutter,
  Justify
} from 'yoga-layout';
import type { Config as YogaLayoutConfig, Node as YogaNode } from 'yoga-layout';

const depth = 0.08;
const gridLineZ = 4;

export type Tone = 'root' | 'panel' | 'accent' | 'media' | 'muted' | 'overlay' | 'imageA' | 'imageB' | 'imageGhost' | 'focus';

export type CellGrid = {
  readonly columns: number;
  readonly rows: number;
};

export type PixelSnapRequest = {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly chPx: number;
  readonly linePx: number;
};

export type SnappedImage = PixelSnapRequest & {
  readonly columns: number;
  readonly rows: number;
  readonly ghostRightPx: number;
  readonly ghostBottomPx: number;
};

export type CellRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type LayoutBox = CellRect & {
  readonly id: string;
  readonly interaction?: InteractionSpec;
  readonly label: string;
  readonly gltf?: GltfPreview;
  readonly primitive: PrimitiveKind;
  readonly text?: string;
  readonly tone: Tone;
};

export type PrimitiveKind = 'box' | 'checkerImage' | 'gltfPreview';

export type Bounds3 = {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
};

export type GltfPreview = {
  readonly bounds: Bounds3;
  readonly cellAspect?: number;
  readonly src: string;
};

export type InteractionRole = 'button' | 'checkbox' | 'media' | 'select' | 'tab';

export type InteractionSpec = {
  readonly disabled?: boolean;
  readonly group?: string;
  readonly label: string;
  readonly role: InteractionRole;
};

export type LayoutSpec = {
  readonly id: string;
  readonly interaction?: InteractionSpec;
  readonly label: string;
  readonly primitive?: PrimitiveKind;
  readonly text?: string;
  readonly tone: Tone;
  readonly width?: number;
  readonly height?: number;
  readonly grow?: number;
  readonly direction?: 'row' | 'column';
  readonly gap?: number;
  readonly gltf?: GltfPreview;
  readonly absolute?: {
    readonly x: number;
    readonly y: number;
  };
  readonly children?: readonly LayoutSpec[];
};

export type CellPoint = {
  readonly x: number;
  readonly y: number;
};

export type PickOptions = {
  readonly ids?: ReadonlySet<string>;
};

export type UiSceneState = {
  readonly activeIds?: ReadonlySet<string>;
  readonly focusIds?: ReadonlySet<string>;
};

export type NavigateDirection = 'down' | 'left' | 'right' | 'up';

export type PickTarget = {
  readonly bounds: {
    readonly rect: CellRect;
    readonly space: 'cell';
  };
  readonly id: string;
  readonly interaction: InteractionSpec;
  readonly kind: PrimitiveKind;
  readonly label: string;
  readonly layer: number;
};

export type PickHit = {
  readonly cell: CellPoint;
  readonly target: PickTarget;
};

type PickSurface = {
  readonly target?: PickTarget;
  readonly z: number;
};

export type Vec3 = readonly [number, number, number];

export type FittedGltfFrame = {
  readonly center: readonly [number, number];
  readonly rect: CellRect;
  readonly scale: readonly [number, number, number];
};

export type GltfPickTriangle = {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
};

export type GltfPickGeometry = {
  readonly triangles: readonly GltfPickTriangle[];
};

export type TextCellAnchor = {
  readonly center: readonly [number, number];
  readonly char: string;
  readonly column: number;
  readonly span: number;
};

type LayoutNode = {
  readonly spec: LayoutSpec;
  readonly node: YogaNode;
  readonly children: LayoutNode[];
};

type GltfAccessorType = 'SCALAR' | 'VEC3';

type GltfAccessorJson = {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: GltfAccessorType;
};

type GltfBufferJson = {
  readonly uri?: string;
};

type GltfBufferViewJson = {
  readonly buffer: number;
  readonly byteOffset?: number;
  readonly byteStride?: number;
};

type GltfPrimitiveJson = {
  readonly attributes?: {
    readonly POSITION?: number;
  };
  readonly indices?: number;
};

type GltfMeshJson = {
  readonly primitives?: readonly GltfPrimitiveJson[];
};

type GltfNodeJson = {
  readonly matrix?: readonly number[];
  readonly mesh?: number;
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly translation?: readonly number[];
};

type GltfSceneJson = {
  readonly nodes?: readonly number[];
};

export type GltfJson = {
  readonly accessors?: readonly GltfAccessorJson[];
  readonly buffers?: readonly GltfBufferJson[];
  readonly bufferViews?: readonly GltfBufferViewJson[];
  readonly meshes?: readonly GltfMeshJson[];
  readonly nodes?: readonly GltfNodeJson[];
  readonly scene?: number;
  readonly scenes?: readonly GltfSceneJson[];
};

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;

export const materials = {
  root: unlitMaterial({ color: [0.94, 0.91, 0.85, 1] }),
  panel: unlitMaterial({ color: [0.12, 0.13, 0.11, 1] }),
  accent: unlitMaterial({ color: [0.58, 0.42, 0.86, 1] }),
  media: unlitMaterial({ color: [0.35, 0.62, 0.58, 1] }),
  muted: unlitMaterial({ color: [0.42, 0.42, 0.38, 1] }),
  overlay: unlitMaterial({ color: [0.99, 0.98, 0.91, 1] }),
  imageA: unlitMaterial({ color: [0.88, 0.88, 0.82, 1] }),
  imageB: unlitMaterial({ color: [0.38, 0.54, 0.63, 1] }),
  imageGhost: unlitMaterial({ color: [0.84, 0.58, 0.36, 1] }),
  active: unlitMaterial({ color: [0.11, 0.1, 0.08, 1] }),
  focus: unlitMaterial({ color: [0.96, 0.82, 0.24, 1] }),
  gltfGlow: unlitMaterial({ color: [1, 0.92, 0.36, 1] }),
  grid: unlitMaterial({ color: [0.48, 0.48, 0.48, 0.34] }),
  text: unlitMaterial({ color: [0.96, 0.95, 0.88, 1] }),
  textDark: unlitMaterial({ color: [0.11, 0.1, 0.08, 1] }),
} as const;

export const snapImageToCells = (request: PixelSnapRequest): SnappedImage => ({
  ...request,
  columns: Math.floor(request.widthPx / request.chPx),
  rows: Math.floor(request.heightPx / request.linePx),
  ghostRightPx: request.widthPx % request.chPx,
  ghostBottomPx: request.heightPx % request.linePx
});

export const box = (spec: Omit<LayoutSpec, 'primitive'>): LayoutSpec => ({
  ...spec,
  primitive: 'box'
});

export const checkerImage = (spec: Omit<LayoutSpec, 'primitive' | 'tone'>): LayoutSpec => ({
  ...spec,
  primitive: 'checkerImage',
  tone: 'imageA'
});

export const gltfPreview = (spec: Omit<LayoutSpec, 'primitive' | 'tone'> & { readonly gltf: GltfPreview }): LayoutSpec => ({
  ...spec,
  primitive: 'gltfPreview',
  tone: 'media'
});

export const loadGltfPickGeometry = async (src: string): Promise<GltfPickGeometry> => {
  const json = await loadGltfJson(src);
  const buffers = await Promise.all((json.buffers ?? []).map(async (buffer, index) => {
    const uri = required(buffer.uri, `buffer ${index} uri`);
    const response = await fetch(resolveUri(src, uri));
    if (!response.ok) throw new Error(`Failed to load glTF buffer: ${uri}`);
    return await response.arrayBuffer();
  }));
  return createGltfPickGeometry(json, buffers);
};

export const createGltfPickGeometry = (json: GltfJson, buffers: readonly ArrayBuffer[]): GltfPickGeometry => {
  const scene = required(json.scenes?.[json.scene ?? 0], 'default scene');
  const triangles: GltfPickTriangle[] = [];

  for (const nodeIndex of scene.nodes ?? []) {
    const node = required(json.nodes?.[nodeIndex], `node ${nodeIndex}`);
    const mesh = required(json.meshes?.[required(node.mesh, `node ${nodeIndex} mesh`)], `mesh for node ${nodeIndex}`);
    const transform = createNodeTransform(node);

    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = required(primitive.attributes?.POSITION, 'POSITION accessor');
      const indexAccessor = required(primitive.indices, 'indices accessor');
      const positions = copyFloatVec3Accessor(json, buffers, positionAccessor);
      const indices = copyUint16IndexAccessor(json, buffers, indexAccessor);

      for (let index = 0; index + 2 < indices.length; index += 3) {
        const a = transformPoint(readVec3(positions, indices[index] ?? 0), transform);
        const b = transformPoint(readVec3(positions, indices[index + 1] ?? 0), transform);
        const c = transformPoint(readVec3(positions, indices[index + 2] ?? 0), transform);
        triangles.push({ a, b, c });
      }
    }
  }

  return { triangles };
};

export const layoutTextCells = (layoutBox: Pick<LayoutBox, 'height' | 'text' | 'width' | 'x' | 'y'>): readonly TextCellAnchor[] => {
  const text = layoutBox.text;
  if (text === undefined || text.length === 0) return [];

  const chars = Array.from(text).map((char) => ({
    char,
    span: isEmoji(char) ? 2 : 1
  }));
  const totalSpan = chars.reduce((sum, char) => sum + char.span, 0);
  const start = layoutBox.x + Math.max(0, Math.floor((layoutBox.width - totalSpan) / 2));
  const rowCenter = layoutBox.y + layoutBox.height / 2;
  const anchors: TextCellAnchor[] = [];
  let column = start;

  for (const char of chars) {
    anchors.push({
      center: [column + char.span / 2, rowCenter],
      char: char.char,
      column,
      span: char.span
    });
    column += char.span;
  }

  return anchors;
};

export const layoutWithYoga = (rootSpec: LayoutSpec, grid: CellGrid): readonly LayoutBox[] => {
  const config = Yoga.Config.create();
  config.setPointScaleFactor(1);
  const root = createYogaNode(rootSpec, config);
  root.node.setWidth(grid.columns);
  root.node.setHeight(grid.rows);
  root.node.calculateLayout(undefined, undefined, Direction.LTR);
  const boxes = readLayout(root);
  root.node.freeRecursive();
  config.free();
  return boxes;
};

export const pickLayoutBox = (
  boxes: readonly LayoutBox[],
  point: CellPoint,
  options: PickOptions = {}
): LayoutBox | undefined => {
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index];
    if (box === undefined) continue;
    if (options.ids !== undefined && !options.ids.has(box.id)) continue;
    if (
      point.x >= box.x &&
      point.x < box.x + box.width &&
      point.y >= box.y &&
      point.y < box.y + box.height
    ) {
      return box;
    }
  }

  return undefined;
};

export const buildPickTargets = (
  boxes: readonly LayoutBox[],
  options: PickOptions = {}
): readonly PickTarget[] =>
  boxes.flatMap((box, layer) =>
    box.interaction !== undefined &&
    box.interaction.disabled !== true &&
    (options.ids === undefined || options.ids.has(box.id))
      ? [{
          bounds: {
            rect: pickRectForBox(box),
            space: 'cell'
          },
          id: box.id,
          interaction: box.interaction,
          kind: box.primitive,
          label: box.label,
          layer
        }]
      : []
  );

export const fitGltfToFrame = (layoutBox: LayoutBox): FittedGltfFrame | undefined => {
  if (layoutBox.gltf === undefined) return undefined;

  const [minX, minY] = layoutBox.gltf.bounds.min;
  const [maxX, maxY] = layoutBox.gltf.bounds.max;
  const modelWidth = Math.max(0.001, maxX - minX);
  const modelHeight = Math.max(0.001, maxY - minY);
  const cellAspect = layoutBox.gltf.cellAspect ?? 1;
  const frameInset = Math.min(1, Math.max(0, Math.min(layoutBox.width, layoutBox.height) / 8));
  const availableWidth = Math.max(0.2, layoutBox.width - frameInset * 2);
  const availableHeight = Math.max(0.2, layoutBox.height - frameInset * 2);
  const scaleX = Math.min(availableWidth / modelWidth, availableHeight / (modelHeight * cellAspect));
  const scaleY = scaleX * cellAspect;
  const width = modelWidth * scaleX;
  const height = modelHeight * scaleY;
  const x = layoutBox.x + (layoutBox.width - width) / 2;
  const y = layoutBox.y + (layoutBox.height - height) / 2;

  return {
    center: [x + width / 2, y + height / 2],
    rect: { x, y, width, height },
    scale: [scaleX, scaleY, scaleX]
  };
};

export const pickTarget = (
  targets: readonly PickTarget[],
  point: CellPoint
): PickHit | undefined => {
  const sortedTargets = [...targets].sort((a, b) => b.layer - a.layer);

  for (const target of sortedTargets) {
    const rect = target.bounds.rect;
    if (
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height
    ) {
      return { cell: point, target };
    }
  }

  return undefined;
};

export const pickTargetAtPoint = (
  grid: CellGrid,
  boxes: readonly LayoutBox[],
  targets: readonly PickTarget[],
  point: CellPoint,
  geometryById: ReadonlyMap<string, GltfPickGeometry> = new Map()
): PickHit | undefined => {
  const surface = pickFrontmostSurfaceAtPoint(grid, boxes, targets, point, geometryById);
  return surface?.target === undefined ? undefined : { cell: point, target: surface.target };
};

export const pointerToCell = (
  grid: CellGrid,
  rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>,
  point: { readonly clientX: number; readonly clientY: number }
): CellPoint | undefined => {
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  const x = Math.floor(((point.clientX - rect.left) / rect.width) * grid.columns);
  const y = Math.floor(((point.clientY - rect.top) / rect.height) * grid.rows);
  if (x < 0 || x >= grid.columns || y < 0 || y >= grid.rows) return undefined;
  return { x, y };
};

export const pointerToGridPoint = (
  grid: CellGrid,
  rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>,
  point: { readonly clientX: number; readonly clientY: number }
): CellPoint | undefined => {
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  const x = ((point.clientX - rect.left) / rect.width) * grid.columns;
  const y = ((point.clientY - rect.top) / rect.height) * grid.rows;
  if (x < 0 || x >= grid.columns || y < 0 || y >= grid.rows) return undefined;
  return { x, y };
};

export const hitGltfGeometry = (
  grid: CellGrid,
  layoutBox: LayoutBox,
  point: CellPoint,
  geometry: GltfPickGeometry
): boolean => hitGltfGeometryZ(grid, layoutBox, point, geometry) !== undefined;

const pickFrontmostSurfaceAtPoint = (
  grid: CellGrid,
  boxes: readonly LayoutBox[],
  targets: readonly PickTarget[],
  point: CellPoint,
  geometryById: ReadonlyMap<string, GltfPickGeometry>
): PickSurface | undefined => {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  let frontmost: PickSurface | undefined;

  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (box === undefined || !containsPoint(box, point)) continue;

    const target = targetById.get(box.id);
    const boxTarget = box.primitive === 'gltfPreview' ? undefined : target;
    frontmost = frontmostSurface(
      frontmost,
      boxTarget === undefined
        ? { z: boxSurfaceFrontZ(index) }
        : { target: boxTarget, z: boxSurfaceFrontZ(index) }
    );

    if (box.primitive === 'checkerImage') {
      frontmost = frontmostSurface(
        frontmost,
        target === undefined
          ? { z: checkerSurfaceFrontZ(index) }
          : { target, z: checkerSurfaceFrontZ(index) }
      );
    }
  }

  for (const target of targets) {
    if (target.kind !== 'gltfPreview') continue;
    if (!containsPoint(target.bounds.rect, point)) continue;

    const box = boxes.find((layoutBox) => layoutBox.id === target.id);
    const geometry = geometryById.get(target.id);
    const z = box === undefined || geometry === undefined
      ? undefined
      : hitGltfGeometryZ(grid, box, point, geometry);
    if (z !== undefined) frontmost = frontmostSurface(frontmost, { target, z });
  }

  if (pointHitsGridLine(grid, point)) {
    frontmost = frontmostSurface(frontmost, { z: gridLineSurfaceFrontZ() });
  }

  return frontmost;
};

const frontmostSurface = (current: PickSurface | undefined, candidate: PickSurface): PickSurface =>
  current === undefined || candidate.z > current.z ? candidate : current;

const boxSurfaceFrontZ = (index: number): number => index * 0.01 + depth / 2;

const checkerSurfaceFrontZ = (index: number): number => 0.25 + index * 0.01 + depth / 2;

const gridLineSurfaceFrontZ = (): number => gridLineZ + 0.01;

function pointHitsGridLine(grid: CellGrid, point: CellPoint): boolean {
  return (
    Number.isInteger(point.x) ||
    Number.isInteger(point.y) ||
    Number.isInteger(grid.columns - point.x) ||
    Number.isInteger(grid.rows - point.y)
  );
}

function hitGltfGeometryZ(
  grid: CellGrid,
  layoutBox: LayoutBox,
  point: CellPoint,
  geometry: GltfPickGeometry
): number | undefined {
  const transform = gltfRootTransform(grid, layoutBox);
  if (transform === undefined) return undefined;

  const origin = worldPointToGltfLocal(
    [point.x - grid.columns / 2, grid.rows / 2 - point.y, 70],
    transform
  );
  const direction = [0, 0, -1 / transform.scale[2]] as const;
  let nearestT: number | undefined;

  for (const triangle of geometry.triangles) {
    const t = rayIntersectsFrontTriangle(origin, direction, triangle.a, triangle.b, triangle.c);
    if (t !== undefined && (nearestT === undefined || t < nearestT)) nearestT = t;
  }

  return nearestT === undefined ? undefined : 70 - nearestT;
}

export const navigateLayoutBox = (
  boxes: readonly LayoutBox[],
  currentId: string | undefined,
  direction: NavigateDirection,
  options: PickOptions = {}
): LayoutBox | undefined => {
  const candidates = boxes.filter((box) => options.ids === undefined || options.ids.has(box.id));
  if (candidates.length === 0) return undefined;
  const current = candidates.find((box) => box.id === currentId) ?? candidates[0];
  if (current === undefined) return undefined;

  const [originX, originY] = centerOf(current);
  const ranked = candidates
    .filter((box) => box.id !== current.id)
    .map((box) => {
      const [x, y] = centerOf(box);
      const dx = x - originX;
      const dy = y - originY;
      const primary =
        direction === 'left' ? -dx :
        direction === 'right' ? dx :
        direction === 'up' ? -dy :
        dy;
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      return { box, primary, secondary };
    })
    .filter((candidate) => candidate.primary > 0)
    .sort((a, b) => a.secondary - b.secondary || a.primary - b.primary);

  return ranked[0]?.box ?? current;
};

export const navigatePickTarget = (
  targets: readonly PickTarget[],
  currentId: string | undefined,
  direction: NavigateDirection
): PickTarget | undefined => {
  if (targets.length === 0) return undefined;
  const current = targets.find((target) => target.id === currentId) ?? targets[0];
  if (current === undefined) return undefined;

  const [originX, originY] = centerOf(current.bounds.rect);
  const ranked = targets
    .filter((target) => target.id !== current.id)
    .map((target) => {
      const [x, y] = centerOf(target.bounds.rect);
      const dx = x - originX;
      const dy = y - originY;
      const primary =
        direction === 'left' ? -dx :
        direction === 'right' ? dx :
        direction === 'up' ? -dy :
        dy;
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      return { target, primary, secondary };
    })
    .filter((candidate) => candidate.primary > 0)
    .sort((a, b) => a.secondary - b.secondary || a.primary - b.primary);

  return ranked[0]?.target ?? current;
};

export const createOrthographicUiScene = (
  grid: CellGrid,
  boxes: readonly LayoutBox[],
  options: UiSceneState = {}
): RenderRoot =>
  scene({
    children: [
      pass({
        camera: orthographicCamera({
          bottom: -grid.rows / 2,
          far: 1000,
          left: -grid.columns / 2,
          near: 0.1,
          position: [0, 0, 70],
          right: grid.columns / 2,
          rotation: [0, 0, 0],
          top: grid.rows / 2
        }),
        children: [
          ...(boxes.some((layoutBox) => layoutBox.primitive === 'gltfPreview')
            ? [directionalLight({ color: [1, 1, 1, 1], direction: [0, 0, -1] })]
            : []),
          ...boxes.flatMap((layoutBox, index) =>
            renderPrimitive(grid, layoutBox, index, {
              active: options.activeIds?.has(layoutBox.id) ?? false,
              focused: options.focusIds?.has(layoutBox.id) ?? false
            })
          ),
          ...createGridLineMeshes(grid)
        ],
        clearColor: [0.98, 0.97, 0.94, 1]
      })
    ]
  });

function createYogaNode(spec: LayoutSpec, config: YogaLayoutConfig): LayoutNode {
  const node = Yoga.Node.create(config);
  node.setJustifyContent(Justify.FlexStart);
  if (spec.width !== undefined) node.setWidth(spec.width);
  if (spec.height !== undefined) node.setHeight(spec.height);
  if (spec.grow !== undefined) node.setFlexGrow(spec.grow);
  if (spec.direction !== undefined) node.setFlexDirection(spec.direction === 'row' ? FlexDirection.Row : FlexDirection.Column);
  if (spec.gap !== undefined) node.setGap(Gutter.All, spec.gap);
  if (spec.absolute !== undefined) {
    node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE);
    node.setPosition(Yoga.EDGE_LEFT, spec.absolute.x);
    node.setPosition(Yoga.EDGE_TOP, spec.absolute.y);
  }

  const layoutNode: LayoutNode = {
    spec,
    node,
    children: []
  };

  for (const childSpec of spec.children ?? []) {
    const child = createYogaNode(childSpec, config);
    node.insertChild(child.node, layoutNode.children.length);
    layoutNode.children.push(child);
  }

  return layoutNode;
}

function centerOf(box: CellRect): readonly [number, number] {
  return [box.x + box.width / 2, box.y + box.height / 2];
}

function pickRectForBox(box: LayoutBox): CellRect {
  return box.primitive === 'gltfPreview' ? fitGltfToFrame(box)?.rect ?? box : box;
}

function readLayout(node: LayoutNode, parentX = 0, parentY = 0): readonly LayoutBox[] {
  const layout = node.node.getComputedLayout();
  const x = Math.round(parentX + layout.left);
  const y = Math.round(parentY + layout.top);
  const own = {
    id: node.spec.id,
    ...(node.spec.interaction === undefined ? {} : { interaction: node.spec.interaction }),
    label: node.spec.label,
    ...(node.spec.gltf === undefined ? {} : { gltf: node.spec.gltf }),
    primitive: node.spec.primitive ?? 'box',
    ...(node.spec.text === undefined ? {} : { text: node.spec.text }),
    tone: node.spec.tone,
    x,
    y,
    width: Math.round(layout.width),
    height: Math.round(layout.height)
  } satisfies LayoutBox;

  return [own, ...node.children.flatMap((child) => readLayout(child, x, y))];
}

function createGridLineMeshes(grid: CellGrid): readonly RenderNode[] {
  const lines: RenderNode[] = [];
  const thickness = 0.025;
  const z = 4;

  for (let column = 0; column <= grid.columns; column += 1) {
    lines.push(
      mesh({
        geometry: boxGeometry({ size: [thickness, grid.rows, 0.02] }),
        material: materials.grid,
        transform: {
          position: [column - grid.columns / 2, 0, z],
          rotation: [0, 0, 0]
        }
      })
    );
  }

  for (let row = 0; row <= grid.rows; row += 1) {
    lines.push(
      mesh({
        geometry: boxGeometry({ size: [grid.columns, thickness, 0.02] }),
        material: materials.grid,
        transform: {
          position: [0, grid.rows / 2 - row, z],
          rotation: [0, 0, 0]
        }
      })
    );
  }

  return lines;
}

function renderPrimitive(grid: CellGrid, layoutBox: LayoutBox, index: number, state: PrimitiveRenderState): readonly RenderNode[] {
  let nodes: readonly RenderNode[];

  if (layoutBox.primitive === 'checkerImage') {
    nodes = createCheckerboardMeshes(grid, layoutBox, index, state);
  } else if (layoutBox.primitive === 'gltfPreview') {
    nodes = createGltfPreviewNodes(grid, layoutBox, index, state);
  } else {
    nodes = [createBoxMesh(grid, layoutBox, index, state)];
  }

  return [
    ...nodes,
    ...createTextNodes(grid, layoutBox, index, state)
  ];
}

type PrimitiveRenderState = {
  readonly active: boolean;
  readonly focused: boolean;
};

const inactiveState = { active: false, focused: false } satisfies PrimitiveRenderState;

function createBoxMesh(grid: CellGrid, layoutBox: LayoutBox, index: number, state: PrimitiveRenderState = inactiveState): RenderNode {
  const activatedControl = state.active && layoutBox.interaction?.role !== 'media';
  const z = index * 0.01;

  return mesh({
    geometry: boxGeometry({
      size: [layoutBox.width, layoutBox.height, depth]
    }),
    material: activatedControl ? materials.active : state.focused ? materials.focus : materials[layoutBox.tone],
    transform: {
      position: [
        layoutBox.x + layoutBox.width / 2 - grid.columns / 2,
        grid.rows / 2 - layoutBox.y - layoutBox.height / 2,
        z
      ],
      rotation: [0, 0, 0]
    }
  });
}

function createGltfPreviewNodes(grid: CellGrid, layoutBox: LayoutBox, index: number, state: PrimitiveRenderState): readonly RenderNode[] {
  if (layoutBox.gltf === undefined) {
    return [createBoxMesh(grid, layoutBox, index, state)];
  }

  const transform = gltfRootTransform(grid, layoutBox);
  if (transform === undefined) {
    return [createBoxMesh(grid, layoutBox, index, state)];
  }

  const modelFrame = {
    centerX: transform.frame.center[0] - grid.columns / 2,
    centerY: grid.rows / 2 - transform.frame.center[1],
    width: transform.frame.rect.width,
    height: transform.frame.rect.height
  };

  return [
    createBoxMesh(grid, withoutInteraction(layoutBox), index, inactiveState),
    ...createGltfFrameMeshes(modelFrame, 0.58 + index * 0.01, state.focused),
    gltf({
      src: layoutBox.gltf.src,
      transform: {
        position: transform.position,
        rotation: [0, 0, 0],
        scale: transform.scale
      }
    })
  ];
}

function gltfRootTransform(grid: CellGrid, layoutBox: LayoutBox): {
  readonly frame: FittedGltfFrame;
  readonly position: Vec3;
  readonly scale: Vec3;
} | undefined {
  if (layoutBox.gltf === undefined) return undefined;
  const frame = fitGltfToFrame(layoutBox);
  if (frame === undefined) return undefined;

  const [minX, minY, minZ] = layoutBox.gltf.bounds.min;
  const [maxX, maxY, maxZ] = layoutBox.gltf.bounds.max;
  const [scaleX, scaleY, scaleZ] = frame.scale;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const boxCenterX = frame.center[0] - grid.columns / 2;
  const boxCenterY = grid.rows / 2 - frame.center[1];

  return {
    frame,
    position: [
      boxCenterX - centerX * scaleX,
      boxCenterY - centerY * scaleY,
      0.5 - centerZ * scaleZ
    ],
    scale: frame.scale
  };
}

function createGltfFrameMeshes(
  frame: { readonly centerX: number; readonly centerY: number; readonly width: number; readonly height: number },
  z: number,
  focused: boolean
): readonly RenderNode[] {
  const thickness = 0.18;
  const pad = 0.18;
  const width = frame.width + pad;
  const height = frame.height + pad;
  const material = focused ? materials.gltfGlow : materials.media;

  return [
    frameBar(frame.centerX, frame.centerY + height / 2, width, thickness, z, material),
    frameBar(frame.centerX, frame.centerY - height / 2, width, thickness, z, material),
    frameBar(frame.centerX - width / 2, frame.centerY, thickness, height, z, material),
    frameBar(frame.centerX + width / 2, frame.centerY, thickness, height, z, material)
  ];
}

function withoutInteraction(layoutBox: LayoutBox): LayoutBox {
  const { interaction: _interaction, ...boxWithoutInteraction } = layoutBox;
  return boxWithoutInteraction;
}

function frameBar(x: number, y: number, width: number, height: number, z: number, material: ReturnType<typeof unlitMaterial>): RenderNode {
  return mesh({
    geometry: boxGeometry({ size: [Math.max(0.1, width), Math.max(0.1, height), 0.04] }),
    material,
    transform: {
      position: [x, y, z],
      rotation: [0, 0, 0]
    }
  });
}

function createCheckerboardMeshes(grid: CellGrid, layoutBox: LayoutBox, index: number, state: PrimitiveRenderState): readonly RenderNode[] {
  const meshes: RenderNode[] = [createBoxMesh(grid, { ...layoutBox, tone: 'imageGhost' }, index, state)];
  const cell = 2;

  for (let y = 0; y < layoutBox.height; y += cell) {
    for (let x = 0; x < layoutBox.width; x += cell) {
      const width = Math.min(cell, layoutBox.width - x);
      const height = Math.min(cell, layoutBox.height - y);
      meshes.push(
        mesh({
          geometry: boxGeometry({ size: [width, height, depth] }),
          material: materials[(x / cell + y / cell) % 2 === 0 ? 'imageA' : 'imageB'],
          transform: {
            position: [
              layoutBox.x + x + width / 2 - grid.columns / 2,
              grid.rows / 2 - layoutBox.y - y - height / 2,
              0.25 + index * 0.01
            ],
            rotation: [0, 0, 0]
          }
        })
      );
    }
  }

  return meshes;
}

function createTextNodes(grid: CellGrid, layoutBox: LayoutBox, index: number, state: PrimitiveRenderState): readonly RenderNode[] {
  if (layoutBox.text === undefined || layoutBox.text.length === 0) return [];

  const material = textMaterialForBox(layoutBox, state);
  const anchors = layoutTextCells(layoutBox);

  return [
    vectorText({
      cellHeight: Math.min(1.5, Math.max(1, layoutBox.height - 1)),
      color: material.color,
      glyphs: anchors.map((anchor) => ({
        cell: {
          center: anchor.center,
          column: anchor.column,
          span: anchor.span
        },
        center: [
          anchor.center[0] - grid.columns / 2,
          grid.rows / 2 - anchor.center[1],
          5 + index * 0.01
        ],
        char: anchor.char,
        span: anchor.span
      }))
    })
  ];
}

function textMaterialForBox(layoutBox: LayoutBox, state: PrimitiveRenderState): ReturnType<typeof unlitMaterial> {
  if (state.focused || state.active || layoutBox.tone === 'root' || layoutBox.tone === 'overlay' || layoutBox.tone === 'focus') {
    return materials.textDark;
  }

  return materials.text;
}

function containsPoint(rect: CellRect, point: CellPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function worldPointToGltfLocal(point: Vec3, transform: { readonly position: Vec3; readonly scale: Vec3 }): Vec3 {
  return [
    (point[0] - transform.position[0]) / transform.scale[0],
    (point[1] - transform.position[1]) / transform.scale[1],
    (point[2] - transform.position[2]) / transform.scale[2]
  ];
}

function rayIntersectsFrontTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): number | undefined {
  const epsilon = 0.000001;
  const edge1 = subtract3(b, a);
  const edge2 = subtract3(c, a);
  const h = cross3(direction, edge2);
  const determinant = dot3(edge1, h);
  if (determinant <= epsilon) return undefined;

  const inverseDeterminant = 1 / determinant;
  const s = subtract3(origin, a);
  const u = inverseDeterminant * dot3(s, h);
  if (u < 0 || u > 1) return undefined;

  const q = cross3(s, edge1);
  const v = inverseDeterminant * dot3(direction, q);
  if (v < 0 || u + v > 1) return undefined;

  const t = inverseDeterminant * dot3(edge2, q);
  return t > epsilon ? t : undefined;
}

function subtract3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Unsupported glTF pick geometry: missing ${label}`);
  return value;
}

function resolveUri(base: string, uri: string): string {
  return new URL(uri, new URL(base, globalThis.location?.href ?? 'http://localhost/')).href;
}

async function loadGltfJson(src: string): Promise<GltfJson> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to load glTF: ${src}`);
  return await response.json() as GltfJson;
}

function copyFloatVec3Accessor(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number): Float32Array {
  const accessor = required(json.accessors?.[accessorIndex], `accessor ${accessorIndex}`);
  if (accessor.componentType !== FLOAT || accessor.type !== 'VEC3') {
    throw new Error(`Unsupported glTF pick geometry accessor ${accessorIndex}`);
  }
  const view = required(json.bufferViews?.[required(accessor.bufferView, `accessor ${accessorIndex} bufferView`)], `bufferView ${accessor.bufferView}`);
  if (view.byteStride !== undefined) throw new Error('Unsupported glTF pick geometry: interleaved positions');
  const buffer = required(buffers[view.buffer], `buffer ${view.buffer}`);
  const length = accessor.count * 3;
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Float32Array(buffer.slice(byteOffset, byteOffset + length * Float32Array.BYTES_PER_ELEMENT));
}

function copyUint16IndexAccessor(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number): Uint16Array {
  const accessor = required(json.accessors?.[accessorIndex], `accessor ${accessorIndex}`);
  if (accessor.componentType !== UNSIGNED_SHORT || accessor.type !== 'SCALAR') {
    throw new Error(`Unsupported glTF pick geometry index accessor ${accessorIndex}`);
  }
  const view = required(json.bufferViews?.[required(accessor.bufferView, `accessor ${accessorIndex} bufferView`)], `bufferView ${accessor.bufferView}`);
  if (view.byteStride !== undefined) throw new Error('Unsupported glTF pick geometry: interleaved indices');
  const buffer = required(buffers[view.buffer], `buffer ${view.buffer}`);
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Uint16Array(buffer.slice(byteOffset, byteOffset + accessor.count * Uint16Array.BYTES_PER_ELEMENT));
}

function readVec3(values: Float32Array, index: number): Vec3 {
  const offset = index * 3;
  return [values[offset] ?? 0, values[offset + 1] ?? 0, values[offset + 2] ?? 0];
}

type NodeTransform = {
  readonly matrix?: readonly number[];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: Vec3;
  readonly translation: Vec3;
};

function createNodeTransform(node: GltfNodeJson): NodeTransform {
  if (node.matrix !== undefined) return { matrix: node.matrix, rotation: [0, 0, 0, 1], scale: [1, 1, 1], translation: [0, 0, 0] };
  return {
    rotation: [
      node.rotation?.[0] ?? 0,
      node.rotation?.[1] ?? 0,
      node.rotation?.[2] ?? 0,
      node.rotation?.[3] ?? 1
    ],
    scale: [
      node.scale?.[0] ?? 1,
      node.scale?.[1] ?? 1,
      node.scale?.[2] ?? 1
    ],
    translation: [
      node.translation?.[0] ?? 0,
      node.translation?.[1] ?? 0,
      node.translation?.[2] ?? 0
    ]
  };
}

function transformPoint(point: Vec3, transform: NodeTransform): Vec3 {
  if (transform.matrix !== undefined) {
    const m = transform.matrix;
    return [
      point[0] * (m[0] ?? 1) + point[1] * (m[4] ?? 0) + point[2] * (m[8] ?? 0) + (m[12] ?? 0),
      point[0] * (m[1] ?? 0) + point[1] * (m[5] ?? 1) + point[2] * (m[9] ?? 0) + (m[13] ?? 0),
      point[0] * (m[2] ?? 0) + point[1] * (m[6] ?? 0) + point[2] * (m[10] ?? 1) + (m[14] ?? 0)
    ];
  }

  const scaled = [
    point[0] * transform.scale[0],
    point[1] * transform.scale[1],
    point[2] * transform.scale[2]
  ] as const;
  const rotated = rotateByQuaternion(scaled, transform.rotation);
  return [
    rotated[0] + transform.translation[0],
    rotated[1] + transform.translation[1],
    rotated[2] + transform.translation[2]
  ];
}

function rotateByQuaternion(point: Vec3, quaternion: readonly [number, number, number, number]): Vec3 {
  const [x, y, z, w] = quaternion;
  const uv = cross3([x, y, z], point);
  const uuv = cross3([x, y, z], uv);
  return [
    point[0] + 2 * (w * uv[0] + uuv[0]),
    point[1] + 2 * (w * uv[1] + uuv[1]),
    point[2] + 2 * (w * uv[2] + uuv[2])
  ];
}

function isEmoji(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  return (
    (codePoint >= 0x1F000 && codePoint <= 0x1FAFF) ||
    (codePoint >= 0x2600 && codePoint <= 0x27BF)
  );
}
