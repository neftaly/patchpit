# Dependency Research

This note records dependency candidates that are worth remembering but should
not be installed until a matching implementation slice creates real pressure.
Prefer this file over speculative manifest changes.

## Renderer Data And Asset Loading

### `@loaders.gl/core`

- Status: strong candidate when any loaders.gl runtime package lands.
- Trigger: `@loaders.gl/gltf`, `@loaders.gl/images`, or another loaders.gl
  parser becomes part of an implementation slice.
- Why it fits: loaders.gl docs use `load()` from `@loaders.gl/core` as the
  entrypoint for both glTF and image loading; treat it as the loader boundary,
  not incidental glue.
- Why not now: no real asset-loading implementation exists yet.
- Watch: keep loaders.gl APIs at source/asset boundaries; do not pass loader
  shapes through renderer-core hot-path APIs.

### `@loaders.gl/gltf`

- Status: strong candidate later.
- Trigger: the `<gltf />` path starts decoding real `.gltf` or `.glb` assets.
- Why it fits: framework-independent glTF parsing, linked buffers/images,
  optional Draco handling, and typed glTF data align with the planned separation
  between source bytes, decoded buffers/images, asset recipes, and GPU resources.
- Why not now: current `GltfNode` only records `src`, and rendering still throws
  for glTF nodes.
- Watch: `@loaders.gl/gltf` brings `@loaders.gl/images`, `@loaders.gl/draco`,
  `@loaders.gl/textures`, and `@math.gl/core`; keep loader output at the asset
  boundary instead of letting loader-specific scenegraph objects leak into
  renderer-core.

### `@loaders.gl/draco`

- Status: optional feature-module candidate.
- Trigger: compressed glTF meshes are a named requirement or fixture.
- Why it fits: integrates with `GLTFLoader` for Draco-compressed meshes.
- Why not now: compressed mesh support should not be a default renderer
  requirement.
- Watch: decoder loading and worker behavior must be explicit for offline,
  benchmark, and CI use; avoid hidden CDN/runtime fetches.

### `@loaders.gl/textures`

- Status: optional feature-module candidate.
- Trigger: KTX2/Basis or other compressed GPU texture formats become a named
  milestone.
- Why it fits: sits naturally beside glTF texture support.
- Why not now: too broad for the first primitive/glTF loading slice.
- Watch: WASM/transcoder assets need explicit bundling and benchmark behavior.

### `@loaders.gl/images`

- Status: strong candidate later, possibly through `@loaders.gl/gltf`.
- Trigger: texture loading, texture readiness metrics, or standalone image
  assets become part of the renderer runtime.
- Why it fits: can return browser-friendly image representations such as
  `ImageBitmap`, and is designed for WebGL texture creation paths.
- Why not now: no texture runtime exists yet.
- Watch: Node support needs polyfills; keep browser and benchmark behavior
  explicit if screenshots or fixture decoding run outside the browser.

## Diagnostics And Benchmarking

### `@probe.gl/stats`

- Status: strong candidate later.
- Trigger: frame diagnostics, upload timings, cache hit rates, draw-lane
  counters, or texture/glTF readiness timings need stable runtime reporting.
- Why it fits: small package with no runtime dependencies in current npm
  metadata; fits counters and timing groups without committing to luma.gl.
- Why not now: benchmark scripts can stay plain until metrics have stable names.
- Watch: keep renderer metrics separate from transport and interest-policy
  metrics.

### `@probe.gl/log`

- Status: possible later, weaker than `@probe.gl/stats`.
- Trigger: diagnostics need leveled browser/node logging that can be shared by
  examples, benchmarks, and renderer internals.
- Why it fits: part of the same vis.gl diagnostics family.
- Why not now: this repo currently favors quiet commands and warning-free
  output; logging infrastructure can become noise if added too early.
- Watch: do not hide warnings or make successful commands noisy.

### `pixelmatch` plus `pngjs`

- Status: strong candidate when visual regression baselines exist.
- Trigger: hardware WebGL screenshots need pixel-level diffing in tests or
  review scripts.
- Why it fits: small, direct PNG diff path for screenshot comparisons.
- Why not now: no checked-in screenshot baselines or diff thresholds exist.
- Watch: all authoritative WebGL screenshots must use the hardware GPU harness,
  not software rendering.

### `sharp`

- Status: usually avoid for renderer tests.
- Trigger: screenshot pipelines need resizing, format conversion, fixture
  generation, or more image processing than PNG diffing.
- Why it fits: broad Node image-processing support.
- Why not now: native dependency footprint is larger than `pixelmatch`/`pngjs`
  for simple diffs.
- Watch: use only for a separate asset/build pipeline or expensive baseline
  generation; avoid native install risk in ordinary renderer checks.

## Renderer Math And Visibility

### `@math.gl/culling`

- Status: strong candidate later.
- Trigger: frustum culling, bounding volumes, visibility tests, or transparent
  object ordering become part of render planning.
- Why it fits: offers bounding sphere, axis-aligned box, oriented box, planes,
  and culling volume primitives that match render-planner policy work.
- Why not now: current scenes are tiny and do not have a retained planner or
  visibility phase.
- Watch: it depends on `@math.gl/core`; keep matrix/vector ownership clear if
  `gl-matrix` remains the renderer's hot-path math package.

### `@types/offscreencanvas`

- Status: likely avoid.
- Trigger: worker-backed roots, OffscreenCanvas APIs, or worker render tests land.
- Why it fits: type-only support for the planned offscreen backend.
- Why not now: current TypeScript DOM libs already include `OffscreenCanvas`,
  and the DefinitelyTyped package is stale in current npm metadata.
- Watch: check current TypeScript DOM lib coverage before adding; newer TS/lib
  versions may already provide enough types.

## GPU Execution Abstractions

### `regl`

- Status: possible tactical prototype, not compelling yet.
- Trigger: repeated manual WebGL state setup in draw lanes becomes the main
  implementation pressure.
- Why it fits: small, dependency-free, command/resource model; closer to the
  current WebGL executor than luma.gl.
- Why not now: resource caching and draw-lane boundaries are not stable enough
  to know whether a wrapper helps or just moves code around; adding it now
  would compete with the repo's own GPU executor boundary before that boundary
  is stable.
- Watch: WebGL-only; not a WebGPU path.

### `@luma.gl/*`

- Status: deliberate architecture decision, not a helper dependency.
- Trigger: near-term WebGPU/WebGL2 portability, shader module assembly, luma
  `Device`/`Model` resources, or luma glTF/PBR support become explicit goals.
- Why it fits: mature GPU toolkit with WebGPU and WebGL2 adapters, engine
  classes, shader modules, glTF/PBR support, and diagnostics integration.
- Why not now: adopting it would move backend ownership toward luma's device,
  model, pipeline, and binding concepts, which may conflict with the small
  renderer and explicit feature-module direction.
- Watch: evaluate as a backend replacement/prototype, not as incidental
  infrastructure.

## Usually Exclude

- `deck.gl` and `@deck.gl/*`: layer/geospatial framework concepts do not match
  the renderer-core target architecture.
- `@math.gl/web-mercator`, `@math.gl/proj4`, `h3-js`, `s2-geometry`, `a5-js`,
  mapbox/maplibre/arcgis packages: exclude unless a future scene source is
  explicitly geographic.
- `@luma.gl/effects` and post-processing packages: exclude until post-processing
  is a named feature module with proof scenes.
- `twgl.js`: exclude for now for the same reason as `regl`; it would compete
  with the GPU executor boundary before the boundary is stable.
- Broad loader families such as CSV, MVT, 3D Tiles, WMS, terrain, Arrow, or
  Parquet: exclude unless a source adapter names that data format.

## Sources Checked

- deck.gl monorepo package graph:
  https://github.com/visgl/deck.gl/blob/master/package.json
- deck.gl module manifests:
  https://github.com/visgl/deck.gl/tree/master/modules
- loaders.gl `GLTFLoader`:
  https://loaders.gl/docs/modules/gltf/api-reference/gltf-loader
- loaders.gl `ImageLoader`:
  https://loaders.gl/docs/modules/images/api-reference/image-loader
- loaders.gl Draco and texture loaders:
  https://loaders.gl/docs/modules/draco/api-reference/draco-loader
  https://loaders.gl/docs/modules/textures/api-reference/basis-loader
- math.gl culling `BoundingSphere`:
  https://visgl.github.io/math.gl/docs/modules/culling/api-reference/bounding-sphere
- luma.gl overview and model API:
  https://luma.gl/docs
  https://luma.gl/docs/api-reference/engine/model
- regl project:
  https://github.com/regl-project/regl
- npm metadata checked on 2026-06-26 for:
  `@loaders.gl/core`, `@loaders.gl/gltf`, `@loaders.gl/images`,
  `@loaders.gl/draco`, `@loaders.gl/textures`, `@probe.gl/stats`,
  `@probe.gl/log`, `@math.gl/culling`, `pixelmatch`, `pngjs`, `sharp`,
  `@types/offscreencanvas`, `regl`, `twgl.js`, and `@luma.gl/core`.
