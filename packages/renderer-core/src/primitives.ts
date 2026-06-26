/** World-space XYZ. Royal is left-handed and Z-up. */
export type Vec3 = readonly [x: number, y: number, z: number];
export type Vec4 = readonly [number, number, number, number];
/** Duration in milliseconds. */
export type Ms = number;
export type Rads = number;
/** Normalized RGBA color. */
export type Rgba = readonly [r: number, g: number, b: number, a: number];
/** World-space direction. */
export type Direction3 = Vec3;

/** XYZ Euler rotation in radians. */
export type EulerRads = readonly [x: Rads, y: Rads, z: Rads];

export interface Transform {
  readonly position: Vec3;
  readonly rotation: EulerRads;
  readonly scale: Vec3;
}

export interface TransformOptions {
  readonly position: Vec3;
  readonly rotation: EulerRads;
  /** @defaultValue `[1, 1, 1]` */
  readonly scale?: Vec3;
}

const identityScale: Vec3 = [1, 1, 1];

export const resolveTransform = (options: TransformOptions): Transform => ({
  position: options.position,
  rotation: options.rotation,
  scale: options.scale ?? identityScale
});
