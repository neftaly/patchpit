import {
  RenderNodeKind,
  type PerspectiveCamera,
  type RenderPass,
  type RenderRoot,
} from "@royal/renderer-core";
import type { ReactReglRootOptions } from "../root";
import { drawGltf, drawMesh } from "./draw";
import { GeometryCache } from "./geometry-cache";
import { GltfCache } from "./gltf-cache";
import {
  invert,
  type Mat4,
  multiply,
  perspective,
  rotation,
  translation,
} from "./matrix";
import {
  createGltfProgram,
  createMeshProgram,
  type GltfProgram,
  type MeshProgram,
} from "./programs";
import { markGltf } from "./performance";
import { asPerspectiveCamera, findDirectionalLight } from "./render-graph";

const resizeCanvas = (
  canvas: HTMLCanvasElement,
): { readonly height: number; readonly width: number } => {
  const bounds = canvas.getBoundingClientRect();
  const scale = globalThis.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(bounds.width * scale));
  const height = Math.max(1, Math.floor(bounds.height * scale));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  return { height, width };
};

const viewProjection = (
  camera: PerspectiveCamera,
  viewport: { readonly height: number; readonly width: number },
): Mat4 => {
  const aspect = viewport.width / viewport.height;
  const projection = perspective(camera.fovY, aspect, camera.near, camera.far);
  const cameraWorld = multiply(
    translation(camera.position),
    rotation(camera.rotation),
  );
  return multiply(projection, invert(cameraWorld));
};

const assertNever = (value: never): never => {
  throw new Error(`Unsupported render node kind: ${String(value)}`);
};

export class WebGlRoot {
  readonly #canvas: HTMLCanvasElement;
  readonly #drawnGltfAssets = new WeakSet<object>();
  readonly #gltfCache: GltfCache;
  readonly #gl: WebGLRenderingContext;
  readonly #geometryCache: GeometryCache;
  readonly #gltfProgram: GltfProgram;
  readonly #meshProgram: MeshProgram;
  #mounted = true;
  #scene: RenderRoot | undefined;

  constructor(canvas: HTMLCanvasElement, options: ReactReglRootOptions = {}) {
    const gl = canvas.getContext("webgl", {
      alpha: options.alpha ?? true,
      ...(options.antialias === undefined ? {} : { antialias: options.antialias }),
      ...(options.preserveDrawingBuffer === undefined
        ? {}
        : { preserveDrawingBuffer: options.preserveDrawingBuffer }),
    });
    if (gl === null) throw new Error("WebGL is not available");

    this.#canvas = canvas;
    this.#gl = gl;
    this.#geometryCache = new GeometryCache(gl);
    this.#gltfCache = new GltfCache(gl, () => this.#renderWhenReady());
    this.#gltfProgram = createGltfProgram(gl);
    this.#meshProgram = createMeshProgram(gl);
  }

  render(scene: RenderRoot): void {
    this.#scene = scene;
    const gl = this.#gl;
    const viewport = resizeCanvas(this.#canvas);

    gl.viewport(0, 0, viewport.width, viewport.height);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    for (const pass of scene.children) {
      this.#renderPass(pass, viewport);
    }
  }

  unmount(): void {
    this.#mounted = false;
    this.#gltfCache.dispose();
    this.#geometryCache.dispose();
    this.#gl.deleteProgram(this.#gltfProgram.program);
    this.#gl.deleteProgram(this.#meshProgram.program);
  }

  #renderPass(
    pass: RenderPass,
    viewport: { readonly height: number; readonly width: number },
  ): void {
    const gl = this.#gl;
    const clearColor = pass.clearColor;
    const vp = viewProjection(asPerspectiveCamera(pass), viewport);
    const directionalLight = findDirectionalLight(pass);

    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (const node of pass.children) {
      switch (node.kind) {
        case RenderNodeKind.DirectionalLight:
          break;
        case RenderNodeKind.Mesh:
          drawMesh(
            gl,
            { mesh: this.#meshProgram },
            node,
            {
              directionalLight,
              geometryCache: this.#geometryCache,
              viewProjectionMatrix: vp,
            },
          );
          break;
        case RenderNodeKind.Gltf:
          {
            const asset = this.#gltfCache.get(node);
            if (asset !== undefined) {
              drawGltf(
                gl,
                { gltf: this.#gltfProgram },
                node,
                asset,
                {
                  directionalLight,
                  viewProjectionMatrix: vp,
                },
              );
              if (!this.#drawnGltfAssets.has(asset)) {
                this.#drawnGltfAssets.add(asset);
                markGltf("first-draw");
              }
            }
          }
          break;
        default:
          assertNever(node);
      }
    }
  }

  #renderWhenReady(): void {
    if (!this.#mounted || this.#scene === undefined) return;
    const render = (): void => {
      if (this.#mounted && this.#scene !== undefined) this.render(this.#scene);
    };

    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(render);
      return;
    }

    queueMicrotask(render);
  }
}
