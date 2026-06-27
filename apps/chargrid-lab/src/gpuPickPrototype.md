# GPU ID/depth picking prototype

This prototype keeps the existing CPU frontmost picker unchanged. It models the proposed GPU proof path with a CPU-filled ID/depth buffer so the same hidden-surface cases can be tested before wiring WebGL readback.

## Pass model

- Assign deterministic uint24 pick IDs from sorted target IDs. ID `0` is reserved for "no pick target".
- Encode IDs into RGBA8 as low/mid/high bytes plus alpha `255`; ID `0` encodes as transparent black.
- Draw pickable owners with their encoded color. Draw non-pickable occluders, such as glTF preview backgrounds and grid lines, with ID `0`.
- Depth or ordering decides the winner. The prototype stores Royal front-z directly and uses "larger z wins"; a real orthographic depth buffer maps the same ordering to the normal depth-test convention.
- `frontmostOwnerAt(pixel)` decodes the owner color, reads the depth/order value, and returns the target ID when the winning ID is non-zero.

## Simulated bridge

`createCpuGpuPickBuffer` rasterizes pixel centers into cell-space over a full grid or smaller viewport. It records:

- `rgbaBuffer`, the simulated owner color attachment.
- `frontZBuffer`, the Royal ordering value.
- `depthBuffer`, a normalized WebGL-style depth value for readback planning.
- `ownerKeyBuffer`, simulation-only metadata for tests and diagnostics.

The bridge records boxes, checker overlays, glTF triangles, preview backgrounds, and grid-line occlusion. It deliberately preserves the current behavior where a preview background can hide glTF triangles and still produce no target.

## Real GPU path

1. Allocate an offscreen framebuffer with an RGBA8 color attachment and depth attachment.
2. Clear color to ID `0` and depth to the far value.
3. Render the same Royal boxes, glTF geometry, and grid occluders with pick materials.
4. Give each target a unique owner color; render non-pickable occluders with ID `0` while still writing depth.
5. Read one pixel or compact probe rows via `readPixels`, decode the ID, and join it to the registry.

`readPixels` is synchronous in WebGL, so production should avoid full-frame readback on pointer move. Prefer a tiny probe viewport, throttled reads, or async fence paths where available. Alpha-tested, transparent, and material-discarding surfaces need explicit pick policy because visual opacity and pick-depth writes can diverge.

Tarstate fuzz/probe rows can consume decoded `targetId`, pixel/cell coordinates, and optional depth. ID `0` becomes a no-target probe, which is exactly what the hidden-helmet false-positive class needs.
