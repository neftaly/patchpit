import {
  CameraKind,
  directionalLight,
  gltf,
  mesh,
  pass,
  perspectiveCamera,
  scene,
  type Camera,
  type DirectionalLightOptions,
  type GltfOptions,
  type MeshOptions,
  type PerspectiveCameraOptions,
  type RenderElement,
  RenderGraphKind,
  type RenderNode,
  RenderNodeKind,
  type RenderPass,
  type RenderPassOptions
} from '@royal/renderer-core';
import type { ReactNode } from 'react';

type RendererJsxElement = RenderElement | Camera;
type ComponentOutput = ReactNode | RendererJsxElement;
type RendererJsxChild = ComponentOutput | readonly RendererJsxChild[];
type Component = (props: Record<string, unknown>) => ComponentOutput;
type ElementType = keyof JSX.IntrinsicElements | Component;

type SceneProps = {
  readonly children: RendererJsxChild;
};

type PassProps = Omit<RenderPassOptions, 'camera' | 'children'> & {
  readonly camera?: Camera;
  readonly children: RendererJsxChild;
};

const isRendererJsxChildArray = (
  value: RendererJsxChild
): value is readonly RendererJsxChild[] => Array.isArray(value);

const toArray = (value: RendererJsxChild): readonly ComponentOutput[] => {
  if (isRendererJsxChildArray(value)) {
    return value.flatMap((child) => toArray(child));
  }

  return [value];
};

const isCamera = (element: ComponentOutput): element is Camera =>
  typeof element === 'object' &&
  element !== null &&
  'kind' in element &&
  element.kind === CameraKind.Perspective;

const isRenderNode = (element: ComponentOutput): element is RenderNode =>
  typeof element === 'object' &&
  element !== null &&
  'kind' in element &&
  (
    element.kind === RenderNodeKind.Mesh ||
    element.kind === RenderNodeKind.Gltf ||
    element.kind === RenderNodeKind.DirectionalLight
  );

const toRenderPasses = (children: RendererJsxChild): readonly RenderPass[] =>
  toArray(children).map((child) => {
    if (typeof child !== 'object' || child === null || !('kind' in child) || child.kind !== RenderGraphKind.Pass) {
      throw new Error('Expected pass child under scene');
    }

    return child;
  });

const toPass = (props: PassProps): RenderPass => {
  let camera = props.camera;
  const children: RenderNode[] = [];

  for (const child of toArray(props.children)) {
    if (isCamera(child)) {
      if (camera !== undefined) {
        throw new Error('pass expects exactly one camera');
      }

      camera = child;
      continue;
    }

    if (isRenderNode(child)) {
      children.push(child);
      continue;
    }

    throw new Error('Expected camera or render node child under pass');
  }

  if (camera === undefined) {
    throw new Error('pass expects exactly one camera');
  }

  const renderPass = {
    camera,
    children
  } satisfies Omit<RenderPassOptions, 'clearColor'>;

  return pass(
    props.clearColor === undefined
      ? renderPass
      : { ...renderPass, clearColor: props.clearColor }
  );
};

const assertNever = (type: never): never => {
  throw new Error(`Unsupported JSX element: ${String(type)}`);
};

const createElement = (type: ElementType, props: Record<string, unknown>): ComponentOutput => {
  if (typeof type === 'function') {
    return type(props);
  }

  switch (type) {
    case 'scene':
      return scene({
        children: toRenderPasses((props as SceneProps).children)
      });
    case 'pass':
      return toPass(props as PassProps);
    case 'perspectiveCamera':
      return perspectiveCamera(props as unknown as PerspectiveCameraOptions);
    case 'directionalLight':
      return directionalLight(props as unknown as DirectionalLightOptions);
    case 'mesh':
      return mesh(props as unknown as MeshOptions);
    case 'gltf':
      return gltf(props as unknown as GltfOptions);
    default:
      return assertNever(type);
  }
};

export const Fragment = (_props: {
  readonly children: RendererJsxChild;
}): RendererJsxChild => _props.children;

export const jsx = createElement;
export const jsxs = createElement;

export namespace JSX {
  export type Element = ComponentOutput;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {
    scene: SceneProps;
    pass: PassProps;
    perspectiveCamera: PerspectiveCameraOptions;
    directionalLight: DirectionalLightOptions;
    mesh: MeshOptions;
    gltf: GltfOptions;
  }
}
