import type { RenderRoot } from "@royal/renderer-core";
import { WebGlRoot } from "./webgl/root";

/** WebGL context options for the renderer root. */
export interface ReactReglRootOptions {
  /** @defaultValue `true` */
  readonly alpha?: boolean;
  /** @defaultValue `true` */
  readonly antialias?: boolean;
  /** @defaultValue `false` */
  readonly preserveDrawingBuffer?: boolean;
}

/** Imperative renderer root bound to one canvas. */
export interface ReactReglRoot {
  /** Renders a complete scene into the canvas. */
  render(scene: RenderRoot): void;
  /** Releases resources owned by this root. */
  unmount(): void;
}

/** Creates an imperative renderer root. */
export const createRoot = (
  canvas: HTMLCanvasElement,
  options?: ReactReglRootOptions,
): ReactReglRoot => new WebGlRoot(canvas, options);
