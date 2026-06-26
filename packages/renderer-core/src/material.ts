import { MaterialKind } from './kind';
import type { Rgba } from './primitives';

/** Flat RGBA material. */
export interface StandardMaterial {
  readonly kind: MaterialKind.Standard;
  readonly color: Rgba;
}

export type Material = StandardMaterial;

export interface StandardMaterialOptions {
  readonly color: Rgba;
}

export const standardMaterial = (options: StandardMaterialOptions): StandardMaterial => ({
  kind: MaterialKind.Standard,
  color: options.color
});
