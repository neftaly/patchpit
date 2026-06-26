# Infinigen Renderer Primitives

Infinigen should not be architecturally owned by Three.js. Three is useful as a
fast prototype backend, but the durable system should be Patchpit/Royal
primitives, scene patches, driver events, and backend adapters.

## Direction

- Treat Three as a disposable adapter for the current headset demo.
- Keep streamed scene data, transforms, materials, source provenance, and
  coordinate assumptions in `@royal/renderer-core`.
- Build backend adapters that consume those primitives:
  - current: Three adapter inside `apps/infinigen`
  - next: direct WebGL2/WebXR adapter
  - later: WebGL1 fallback, worker/offscreen backend, native companion paths
- Keep React/regl wrappers above the primitive layer. They are convenience
  surfaces, not the ownership boundary.

## First Primitive Boundary

The first hidden assumption to remove is the coordinate system. Three-style
Y-up/right-handed data and Royal-style Z-up/left-handed data must be explicit
source facts, not backend folklore.

`packages/renderer-core/src/primitives.ts` now exposes:

- `CoordinateSystem`
- `SceneSource`
- `zUpLeftHanded`
- `yUpRightHanded`
- `defineCoordinateSystem()`
- `sceneSource()`

This lets Infinigen streams, glTF assets, native sensors, and future driver
events declare their world basis before any backend maps them to GPU buffers.

## Migration Steps

1. Add an Infinigen pure scene-source module that converts stream events into
   renderer-core primitive operations without importing Three.
2. Make the current Three viewer consume those primitive operations as an
   adapter.
3. Add a WebGL2/XR backend that consumes the same operations.
4. Benchmark primitive-to-visible latency, allocations, draw calls, and headset
   frame stability against the Three adapter.
5. Delete Three only after the direct backend covers the Quest demo, desktop
   fallback, and enough glTF/primitive features for the scene.

## Decomplection Notes

Do not replace one engine-shaped dependency with another hidden engine shape.
Keep assets, transforms, scene patches, renderer policy, backend resources, XR
frame scheduling, and device drivers separate. The primitive layer should make
assumptions explicit and boring.
