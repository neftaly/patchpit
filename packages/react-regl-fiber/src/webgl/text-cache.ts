import { vectorTextGlyphRects, type VectorTextNode } from "@royal/renderer-core";
import { createFloatBuffer, createIndexBuffer } from "./gl";

export interface TextRenderAsset {
  readonly index: WebGLBuffer;
  readonly indexCount: number;
  readonly position: WebGLBuffer;
}

const createGeometry = (
  gl: WebGLRenderingContext,
  node: VectorTextNode,
): TextRenderAsset => {
  const rects = vectorTextGlyphRects(node);
  const positions: number[] = [];
  const indices: number[] = [];

  for (const rect of rects) {
    const vertex = positions.length / 3;
    if (vertex + 3 > 65535) {
      throw new Error("VectorText geometry exceeds uint16 index capacity");
    }

    positions.push(
      rect.x, rect.y + rect.height, rect.z,
      rect.x + rect.width, rect.y + rect.height, rect.z,
      rect.x + rect.width, rect.y, rect.z,
      rect.x, rect.y, rect.z,
    );
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
  }

  return {
    index: createIndexBuffer(gl, new Uint16Array(indices)),
    indexCount: indices.length,
    position: createFloatBuffer(gl, new Float32Array(positions)),
  };
};

export class TextCache {
  readonly #assets = new WeakMap<VectorTextNode, TextRenderAsset>();
  readonly #buffers = new Set<WebGLBuffer>();
  readonly #gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext) {
    this.#gl = gl;
  }

  get(node: VectorTextNode): TextRenderAsset {
    const cached = this.#assets.get(node);
    if (cached !== undefined) return cached;

    const asset = createGeometry(this.#gl, node);
    this.#track(asset.index);
    this.#track(asset.position);
    this.#assets.set(node, asset);
    return asset;
  }

  dispose(): void {
    for (const buffer of this.#buffers) {
      this.#gl.deleteBuffer(buffer);
    }
    this.#buffers.clear();
  }

  #track(buffer: WebGLBuffer): void {
    this.#buffers.add(buffer);
  }
}
