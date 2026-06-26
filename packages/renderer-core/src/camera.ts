import { CameraKind } from './kind';
import type { EulerRads, Rads, Vec3 } from './primitives';

/** Perspective camera for a render pass. */
export interface PerspectiveCamera {
  readonly kind: CameraKind.Perspective;
  readonly position: Vec3;
  readonly rotation: EulerRads;
  readonly fovY: Rads;
  readonly near: number;
  readonly far: number;
}

export interface PerspectiveCameraOptions {
  readonly position: Vec3;
  readonly rotation: EulerRads;
  /** Vertical field of view in radians. */
  readonly fovY: Rads;
  readonly near: number;
  readonly far: number;
}

export type Camera = PerspectiveCamera;

export const perspectiveCamera = (options: PerspectiveCameraOptions): PerspectiveCamera => ({
  kind: CameraKind.Perspective,
  position: options.position,
  rotation: options.rotation,
  fovY: options.fovY,
  near: options.near,
  far: options.far
});
