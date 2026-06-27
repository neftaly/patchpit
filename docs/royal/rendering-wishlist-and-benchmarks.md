# Rendering Wishlist And Benchmarks

This is a research planning artifact for future Royal rendering work. It is not
an implementation backlog and it should not cause product code changes by
itself. Use it to decide which prototype, benchmark, or proof gate should exist
before adding a renderer feature.

The local baseline inspected for this note:

- `@royal/renderer-core` is a dependency-light scene description package:
  cameras, passes, meshes, materials, one directional light, raster text, and
  URL-only glTF nodes.
- `react-regl-fiber` is the React facade and the current WebGL1 executor. It
  owns canvas roots, direct shader programs, geometry/text/glTF caches, and
  hardware-facing resource lifetime.
- The chargrid lab is the strongest local workload: Yoga layout boxes, fitted
  glTF previews, raster text, checker tiles, CPU triangle picking, and fuzz
  coverage for visible glTF pick hits.
- The tarstate Royal prototype already keeps layout, pick targets, pointer
  samples, render flags, assets, asset diagnostics, and capability results as
  relations. Raw browser and renderer handles stay adapter-only.
- Benchmarks currently cover fake-WebGL render commands, glTF lifetime, GPU
  smoke/profiling through Chromium, tarstate Royal flow, tarstate geo-shaped
  visibility queries, and tarstate memory pressure.

Decomplection pressure: keep `renderer-core` as pure authoring and scene data.
Every future feature below should land through a benchmarkable seam before it
becomes a package dependency or a hot-path branch.

## How To Read This

For each candidate:

- Resources: primary papers, specs, vendor docs, or current local proof files.
- Royal fit: why the feature matters to Royal's target workloads.
- API fit: what is plausible in WebGL1, WebGL2, and WebGPU.
- Dependencies: local seams, data structures, or optional libraries needed.
- Tarstate probes: rows or diagnostics that should expose behavior without
  leaking raw renderer handles.
- First benchmark: the smallest useful proof before implementation expands.

## Source Index

Primary or near-primary references to keep close:

- WebGL extension registry:
  https://registry.khronos.org/webgl/extensions/
- WebGL 2.0 specification:
  https://registry.khronos.org/webgl/specs/latest/2.0/
- `EXT_disjoint_timer_query`:
  https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/
- KTX 2.0 specification:
  https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html
- glTF `KHR_texture_basisu`:
  https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu
- glTF `KHR_materials_variants`:
  https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_variants
- Epic, "Real Shading in Unreal Engine 4", SIGGRAPH 2013 course notes:
  https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
- GPU Gems 2, chapter 9, "Deferred Shading in S.T.A.L.K.E.R.":
  https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-9-deferred-shading-stalker
- GPU Gems 3, chapter 10, "Parallel-Split Shadow Maps on Programmable GPUs":
  https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-10-parallel-split-shadow-maps-programmable-gpus
- Khronos `ARB_sparse_texture`, useful as a native/WebGPU-era reference even
  though it is not WebGL:
  https://registry.khronos.org/OpenGL/extensions/ARB/ARB_sparse_texture.txt
- Clustered Deferred and Forward Shading, Olsson, Billeter, Assarsson, HPG
  2012 DOI:
  https://doi.org/10.2312/EGGH/HPG12/087-096
- Hierarchical Z-Buffer Visibility, Greene, Kass, Miller, SIGGRAPH 1993 DOI:
  https://doi.org/10.1145/166117.166147
- The Clipmap: A Virtual Mipmap, Tanner, Migdal, Jones, SIGGRAPH 1998 DOI:
  https://doi.org/10.1145/280814.280855

The DOI and SIGGRAPH-course links above are research anchors. Before copying an
algorithm, recover the exact public PDF or publisher page in the implementation
slice and add the citation beside the code or benchmark.

## Lighting And Shading

### Simple Forward Baseline

Resources: WebGL/WebGL2 specs, current `drawMesh` and `drawGltf`, GPU Gems 2
for why forward remains useful when light counts are low.

Royal fit: this is the cheap card/game-table path. It should stay the default
for boxes, text, a few glTF props, and one or two simple lights.

API fit: WebGL1 is enough for the current path. WebGL2 can reduce state churn
with VAOs, uniform buffers later, and better texture formats. WebGPU should keep
the same logical material/light handles but move pipeline and bind group
ownership behind a backend.

Dependencies: stable geometry/material handles, draw-lane grouping, explicit
shader variants for lit and unlit lanes.

Tarstate probes: `renderer_capability` rows for context version/extensions,
`render_lane` rows for scalar versus instanced draw lanes, and
`lighting_mode = forward`.

First benchmark: `primitive-static` and `card-stress-textures` with draw count,
frame time, buffer allocation after warmup, and first nonblank frame.

### Forward+

Resources: Forward+ course/paper material by Harada, McKee, and Yang; clustered
shading paper above; WebGL extension registry for float/half-float textures and
timer queries.

Royal fit: useful only when scenes have many local lights over repeated objects
and cards. It should not tax the default UI/card renderer.

API fit: WebGL1 can prototype tile lists in textures, but extension pressure is
high. WebGL2 is the realistic WebGL target because integer textures, 3D
textures, occlusion/timer queries, and core instancing help. WebGPU is the right
long-term target for compute light culling and storage buffers.

Dependencies: retained render planner, light collector, screen-tile partition,
light index packing, depth prepass or depth texture, shader variants, and a
feature-wired renderer constructor. Do not put point-light collection into
`renderer-core`.

Tarstate probes: `light_rows`, `light_tile_rows`, `lighting_budget_rows`, and
diagnostics for `light_tile_overflow`, `extension_missing`, and
`forward_plus_disabled`.

First benchmark: `forward-plus-light-stress`: one DamagedHelmet plus 1k boxes,
vary 0, 16, 64, 256, and 1024 point lights, compare forward scalar lights
against Forward+ for GPU time, CPU planning time, tile overflow count, draw
count, and input latency.

### Clustered Forward

Resources: Olsson, Billeter, Assarsson clustered shading paper; WebGL2 3D
texture and uniform limits; WebGPU compute/buffer model.

Royal fit: better than screen-space tiles for deep scenes, XR, and large depth
ranges because clusters can partition depth as well as screen area.

API fit: WebGL1 is poor unless packed into 2D textures. WebGL2 is viable with
3D-ish packing and careful limits. WebGPU is the natural home.

Dependencies: camera-space bounds, depth slicing policy, per-cluster light
lists, capacity diagnostics, and shader paths shared with Forward+ where
possible.

Tarstate probes: `cluster_grid` rows with tile counts and depth slices,
`cluster_light_count` histograms, and diagnostics for overflow or clipped
lights.

First benchmark: reuse `forward-plus-light-stress`, add camera near/far sweeps
and XR-multiview-shaped dual views. Measure worst-cluster light count and
overflow recovery.

### Deferred Shading

Resources: GPU Gems 2 deferred shading chapter; WebGL2 spec for draw buffers,
depth textures, color attachments, and query support.

Royal fit: a research option for many dynamic lights and material debugging,
not a default path. It competes with Royal's need for cheap transparent UI,
raster text, and WebGL1 availability.

API fit: WebGL1 requires `WEBGL_draw_buffers`, `WEBGL_depth_texture`, and
texture format extensions. WebGL2 is the minimum serious WebGL target. WebGPU is
cleaner because render pass attachments and formats are first-class.

Dependencies: G-buffer format policy, material ID packing, lighting pass,
transparent/alpha fallback path, postprocess ownership, and screenshot parity.

Tarstate probes: `gbuffer_attachment` rows, `material_variant_usage`,
`deferred_pass_time`, and diagnostics for unsupported attachment formats.

First benchmark: `deferred-gbuffer-smoke`: 10k opaque boxes plus 100 lights,
compare first nonblank frame, p95 frame time, attachment memory estimate, and
visual parity against forward for simple materials.

### Tiled Deferred

Resources: GPU Gems 2 deferred culling discussion, clustered shading paper, and
WebGL2/WebGPU timer-query resources.

Royal fit: only matters if deferred wins for light stress but naive deferred
lighting becomes fill-bound.

API fit: WebGL1 is a research-only fallback. WebGL2 can prototype screen tiles
with textures and multiple passes. WebGPU should use compute.

Dependencies: same G-buffer as deferred plus tile light lists and depth bounds.

Tarstate probes: `deferred_tile` rows with light counts and screen coverage,
`culled_light_rows`, and overflow diagnostics.

First benchmark: after `deferred-gbuffer-smoke`, add tiled versus full-screen
deferred light accumulation with 64 to 1024 lights.

### PBR And IBL

Resources: Epic SIGGRAPH 2013 PBR/IBL notes, glTF 2.0 material model and
extensions, KTX2/Basis resources for environment maps.

Royal fit: needed for real glTF inspection and branded/product-quality assets.
Not needed for chargrid boxes or text.

API fit: WebGL1 supports a minimal metallic-roughness shader with careful
texture formats. WebGL2 improves mip control, 3D/cube texture handling, and
format options. WebGPU simplifies bind layouts and prefiltered environment
resource sets.

Dependencies: material recipe cache, texture cache, environment map cache,
shader variant keys, glTF material feature policy, and asset pipeline support
for prefiltered IBL data.

Tarstate probes: `material_recipe` rows, `texture_readiness`, `environment_map`
rows, and diagnostics for unsupported material extension or missing prefilter.

First benchmark: `helmet-pbr-readiness`: DamagedHelmet with base color,
normal, metallic-roughness, emissive, and optional environment. Measure source,
decode, texture upload, first draw, all-textures-ready, and shader compile time.

### Shadows

Resources: Williams shadow mapping lineage, GPU Gems 3 parallel-split shadow
maps, WebGL depth texture and draw-buffer specs.

Royal fit: useful for 3D inspection and rich examples, but dangerous for the
cheap UI/card path. Directional shadows should be the first slice; point and
spot shadows can wait.

API fit: WebGL1 needs `WEBGL_depth_texture` or color-encoded depth fallback.
WebGL2 is the practical baseline for depth textures and sampler behavior.
WebGPU has cleaner depth attachments and comparison samplers.

Dependencies: shadow-caster collection, light view construction, shadow atlas
or cascades, filtering policy, material cast/receive flags, and feature wiring.

Tarstate probes: `shadow_map` rows with resolution, light id, caster count, and
update reason; diagnostics for atlas pressure and unsupported depth formats.

First benchmark: `directional-shadow-helmet`: single directional light,
DamagedHelmet plus repeated boxes, compare no shadow, 1-map shadow, and 3-split
shadow for frame time and shadow pass draw count.

## Visibility And Culling

### Frustum Culling

Resources: current chargrid fitted bounds; `@math.gl/culling` candidate from
dependency research; WebGL/WebGPU backend-agnostic.

Royal fit: first visibility feature for repeated props, card tables, and
streamed scene sources.

API fit: pure CPU policy works for WebGL1, WebGL2, and WebGPU.

Dependencies: bounds in asset recipes, world transform slots, retained planner
workspace, and visible-set diagnostics.

Tarstate probes: `visibility_candidate` and `visible_instance` rows with
reason `inside_frustum` or `culled_frustum`.

First benchmark: `frustum-10k-boxes`: 10k repeated boxes over a large table,
pan camera, measure planner time, visible count, draw count, and allocations.

### Portal And Sector Culling

Resources: GPU Gems 2 deferred chapter references sector/portal culling in
practice; classic portal visibility literature should be recovered before code.

Royal fit: probably useful only for room-like streamed worlds, not card tables.

API fit: CPU-side policy across all backends.

Dependencies: scene-source metadata for sectors, portal graph, conservative
portal clipping, and recovery to frustum-only when metadata is absent.

Tarstate probes: `sector_visibility`, `portal_traversal`, and diagnostics for
missing or cyclic portal metadata.

First benchmark: synthetic `portal-room-graph`: 100 rooms, repeated props,
moving camera through portals, compare frustum-only versus sector+portal.

### BVH And Spatial Indexes

Resources: ray-tracing and broad-phase BVH literature; local tarstate geo
benchmark as pressure signal for spatial filtering.

Royal fit: the likely shared structure for CPU picking, broad-phase culling,
and streamed source windows.

API fit: CPU BVH works everywhere. WebGPU can later build or refit GPU-side
structures for compute culling.

Dependencies: bounds per asset/instance, update policy for transform changes,
static versus dynamic index split, and ownership outside `renderer-core`.

Tarstate probes: `spatial_index_stats` rows with node count, depth, refit time,
query time, and stale/rebuild diagnostics.

First benchmark: `bvh-pick-and-frustum`: DamagedHelmet pick triangles plus 10k
boxes, compare linear scan, grid/hash, and BVH for pick and frustum queries.

### Occlusion Queries

Resources: WebGL2 `WebGLQuery` and WebGL extension registry; GPU Gems 2
deferred chapter discusses occlusion-query use for lights.

Royal fit: can reject hidden heavy glTF props or lights, but introduces
asynchrony and latency. It should be optional and measured.

API fit: WebGL1 has no core query path; WebGL2 has query objects. WebGPU has
occlusion query sets in render passes.

Dependencies: query pool, frame-late result consumption, conservative fallback,
and no same-frame correctness dependency.

Tarstate probes: `occlusion_query` rows with issued frame, available frame,
visible estimate, and `late_result` diagnostics.

First benchmark: `occlusion-hidden-helmets`: 100 helmets behind planes, compare
no occlusion cull, query-driven cull, and CPU bounds-only cull. Measure latency
and false negative policy, not only frame time.

### Hierarchical Z And Software Raster Occlusion

Resources: Hierarchical Z-Buffer Visibility paper; GPU Gems 2 notes on
hierarchical occlusion; WebGL depth texture specs.

Royal fit: better than query-only when Royal needs deterministic CPU-side
planning or wants to avoid query latency.

API fit: WebGL1 can do CPU/software raster. WebGL2 can generate or sample depth
pyramids with multiple passes. WebGPU can generate HZB with compute.

Dependencies: conservative occluder selection, depth pyramid resource, software
raster fixture, and clear policy for dynamic occluders.

Tarstate probes: `occluder_set`, `hzb_level_stats`, `software_occlusion_stats`,
and diagnostics for underfilled occluder coverage.

First benchmark: `hzb-card-stack`: layered card/table planes plus glTF props,
compare CPU software raster, WebGL2 HZB, and no occlusion.

### GPU ID And Depth Picking

Resources: WebGL readback APIs, current `helmetPickFuzz.test.ts`, current CPU
triangle picking in chargrid.

Royal fit: picking must match rendered visibility. Current CPU triangle picking
is a good oracle but can diverge from GPU depth and material behavior.

API fit: WebGL1 and WebGL2 can render ID/depth buffers and read pixels, with
readback latency. WebGPU can use copy-to-buffer and async mapping.

Dependencies: pick render pass, stable object/primitive IDs, readback queue,
depth convention, and CPU fallback for tests/headless.

Tarstate probes: `pick_sample`, `pick_result`, `pick_readback_latency`, and
diagnostics for stale readbacks or mismatched CPU/GPU pick.

First benchmark: `gpu-pick-helmet-fuzz`: run the existing helmet pick samples
through CPU oracle and GPU ID/depth pass, compare mismatch count and p95
readback latency.

### LOD And Impostors

Resources: clipmap/virtual mipmap research, common impostor literature to
recover in implementation, current glTF preview fitted-frame tests.

Royal fit: supports fast zoomed-out views of repeated props and slow inspection
paths without tying LOD to transport replication.

API fit: CPU LOD choice works everywhere. WebGL can draw impostor atlases.
WebGPU can generate/update impostor resources later.

Dependencies: LOD recipes, screen-size metric, hysteresis, impostor atlas,
asset readiness, and test fixtures for stable switching.

Tarstate probes: `lod_choice` rows with instance id, level, reason, projected
size, and diagnostics for missing LOD or atlas pressure.

First benchmark: `lod-repeated-props`: 1k repeated helmets/cards at multiple
zoom levels, compare full mesh, simple impostor, and hidden-distance cull.

## Textures And Assets

### Texture Atlas

Resources: WebGL texture limits and compressed texture extension registry;
current raster text and checker/card stress pressure.

Royal fit: likely first texture optimization for card faces, UI glyphs, labels,
and repeated small assets.

API fit: WebGL1 works. WebGL2 improves array texture options. WebGPU can use
array textures or bindless-like layouts through indexed resource tables when
available.

Dependencies: atlas packer, stable sub-rect handles, padding/gutter policy,
upload invalidation, and sampler/material compatibility.

Tarstate probes: `atlas_page`, `atlas_allocation`, `texture_upload`, and
diagnostics for fragmentation, eviction, or oversized assets.

First benchmark: `card-stress-textures`: 500 to 5k cards using many small
textures, compare one-texture-per-card versus atlas pages for upload count,
draw lanes, and texture readiness.

### Virtual Or Megatextures

Resources: The Clipmap paper and Khronos sparse texture extension as native
reference; KTX2 streaming fields as asset-container pressure.

Royal fit: deferred research for huge boards, maps, or inspection surfaces. Not
needed for the current DamagedHelmet/card baseline.

API fit: WebGL has no sparse textures, so use application-managed tile pages in
ordinary textures. WebGPU does not automatically grant sparse residency in the
web API, so model this as an asset/cache policy first.

Dependencies: page table, tile cache, mip residency, camera-driven requests,
fallback color/mip, and explicit memory budget.

Tarstate probes: `texture_page_request`, `texture_page_residency`,
`texture_cache_budget`, and diagnostics for missing page, thrash, or overbudget.

First benchmark: `virtual-texture-board`: synthetic 16k or 32k board texture
split into tiles, pan/zoom camera, measure tile requests, resident bytes,
upload time, and visual missing-page count.

### KTX2 And Basis

Resources: KTX 2.0 spec and glTF `KHR_texture_basisu`.

Royal fit: compressed texture delivery is the most practical path to many real
glTF assets and texture-heavy card scenes.

API fit: WebGL1/WebGL2 need runtime format detection and transcoding into the
compressed formats available on the device. WebGPU still needs feature/format
gating but has cleaner texture creation.

Dependencies: asset pipeline, transcoder bundling, workers, compressed format
capability table, fallback PNG/JPEG path, and readiness metrics.

Tarstate probes: `texture_source`, `transcode_job`, `gpu_texture_format`, and
diagnostics for unsupported compression, transcoder load failure, and fallback.

First benchmark: `ktx2-helmet-and-cards`: DamagedHelmet plus card texture set,
compare PNG/JPEG and KTX2/Basis for bytes loaded, decode/transcode time, upload
time, GPU memory estimate, and first/all-textures-ready.

### Streaming glTF

Resources: glTF core/extensions, loaders.gl research note, current
`GltfCache`, `gltf-lifetime-bench`, and glTF readiness marks.

Royal fit: important for real assets, repeated props, and future scene sources.
It must not be a separate renderer path.

API fit: mostly asset/cache policy across WebGL1/WebGL2/WebGPU. WebGPU changes
resource creation only.

Dependencies: source bytes cache, decoded buffer/image cache, asset recipe,
GPU resource realization, cancellation, partial readiness, and content identity
separate from URL.

Tarstate probes: `asset_source`, `asset_decode`, `asset_gpu_resource`,
`asset_readiness`, and diagnostics for unsupported accessor/material/extension.

First benchmark: expand `helmet-gltf`: multiple URLs resolving to identical
content, repeated instances, delayed texture decode, and unmount-before-ready.
Measure cache hits by layer and resource disposal.

### Material Variants

Resources: glTF `KHR_materials_variants`.

Royal fit: useful for configurable assets and card/token skins. Variants should
not clone whole glTF scenes or force new geometry.

API fit: material selection is backend-agnostic; GPU effect is shader/material
resource binding.

Dependencies: material variant recipe, per-instance selected variant, material
cache key, and fallback behavior when a variant is absent.

Tarstate probes: `asset_variant`, `selected_variant`, `material_binding`, and
diagnostics for missing variant or unsupported material feature.

First benchmark: `material-variant-switch`: repeated asset with 8 variants,
toggle variants at interaction rate, measure CPU planning time, GPU resource
reuse, shader switches, and React commit count.

## WebGL And WebGPU Capability Gates

### Optional WebGL Extensions

Gate extensions by feature module, not globally:

- Instancing: `ANGLE_instanced_arrays` in WebGL1, core in WebGL2.
- VAOs: `OES_vertex_array_object` in WebGL1, core in WebGL2.
- Deferred/G-buffer: `WEBGL_draw_buffers`, `WEBGL_depth_texture`,
  `EXT_color_buffer_half_float`, `WEBGL_color_buffer_float`, and WebGL2 color
  attachment behavior.
- PBR/IBL quality: `OES_standard_derivatives`, `EXT_shader_texture_lod`,
  sRGB extensions or WebGL2 behavior, float/half-float textures, and anisotropy.
- Compressed textures: S3TC, ETC, ASTC, PVRTC where available, with KTX2/Basis
  transcoding selecting the device format.
- Diagnostics: `EXT_disjoint_timer_query` or `_webgl2`, `WEBGL_debug_renderer_info`
  only for diagnostics, and `WEBGL_lose_context` for resource-lifetime tests.
- Multi-draw and multiview: `WEBGL_multi_draw` and `OVR_multiview2` are optional
  research gates, not base requirements.

Tarstate probes: `renderer_capability` and `feature_gate` rows with
`required`, `available`, `selected`, and `fallback` fields.

First benchmark: `capability-matrix-smoke`: load primitive, helmet, card
stress, and timer-query probes across WebGL1 and WebGL2 contexts, record
fallbacks and extension availability without changing render output.

### WebGL2 Baseline Features

WebGL2 should be the first serious advanced-rendering baseline when a feature
needs queries, depth textures, draw buffers, 3D textures, sync objects, VAOs,
instancing, or sampler objects. WebGL1 remains the minimum for the cheap forward
path until a benchmark proves the cost of carrying it is too high.

Tarstate probes: `context_version`, `webgl2_feature`, and diagnostics for
`webgl2_required`.

First benchmark: run `check:gpu` and `profile:gpu` against the same proof
scenes with WebGL1 and WebGL2 roots once a WebGL2 root exists.

### WebGPU Migration Seams

Do not make WebGPU a parallel renderer model. Make it another backend under the
same scene, asset recipe, planner, visibility, and probe contracts.

Keep these seams backend-owned:

- GPU resource lifetime and frame scheduling.
- Pipeline/shader module compilation.
- Bind group/layout allocation.
- Timestamp/occlusion query implementation.
- Texture creation, copy, and readback.
- Compute passes for light culling, HZB, and GPU culling.

Keep these backend-neutral:

- `renderer-core` scene model.
- Asset recipe/cache keys.
- Feature policy and render planning inputs.
- Visibility and picking service contracts.
- Tarstate probe row names and diagnostics.

First benchmark: after the WebGL2 proof scenes exist, add a no-feature WebGPU
root that renders `primitive-static` and emits the same probe rows. Compare
first nonblank frame, p95 frame time, and resource disposal.

## Diagnostics And Testing

### ID Buffers

Resources: current pick fuzz tests and WebGL readback behavior.

Royal fit: an ID buffer gives rendered-truth picking and a debug lens for
visibility/culling mismatches.

API fit: WebGL1 and WebGL2 can render color-coded IDs. WebGPU can copy ID
textures into buffers asynchronously.

Dependencies: stable numeric IDs, debug/pick pass, readback queue, and test
fixtures that tolerate async availability.

Tarstate probes: `debug_id_pixel`, `pick_result`, and `readback_latency`.

First benchmark: `id-buffer-chargrid`: sample all interactive chargrid targets,
compare CPU target, GPU ID, and visible-owner oracle.

### Fuzzing

Resources: `helmetPickFuzz.test.ts`, `yogaRoyal.test.ts`, render-pass tests,
and resource-lifetime tests.

Royal fit: fuzzing is the best guardrail for picking, bounds, scene patch
ordering, cache lifetime, and visibility false positives.

API fit: mostly CPU/test harness. GPU fuzz should use deterministic fixtures and
bounded sample sets.

Dependencies: seed reporting, fixture minimization, deterministic geometry,
and separate CPU/GPU oracles.

Tarstate probes: `fuzz_run`, `fuzz_mismatch`, and diagnostics carrying seed,
scenario, and reduced point/instance identifiers.

First benchmark: convert helmet pick fuzz output into a reusable report schema,
then run CPU-only and GPU-ID variants with identical seeds.

### Tarstate Probe Layer

Resources: `packages/tarstate/src/royal-prototype.ts`,
`tests/tarstate-royal-prototype.test.ts`, and
`scripts/tarstate-royal-flow-bench.test.ts`.

Royal fit: this keeps diagnostics queryable while keeping browser/GPU handles
inside adapters.

API fit: backend-neutral. Probes are rows derived from renderer-owned stores
and frame snapshots.

Dependencies: row naming, snapshot timing, diagnostic codes, and explicit
adapter-only handle policy.

Rows to add as features land:

- `renderer_capability`
- `feature_gate`
- `render_lane`
- `asset_readiness`
- `texture_upload`
- `light_tile`
- `visibility_candidate`
- `pick_sample`
- `gpu_timing`
- `resource_lifetime`

First benchmark: `royal-probe-flow`: create fake renderer probe rows for
current primitive and glTF scenes, then evaluate tarstate joins against direct
selectors before wiring real WebGL metrics.

### GPU Traces

Resources: `scripts/gpu.ts`, Chrome DevTools tracing categories, and
`EXT_disjoint_timer_query`.

Royal fit: required before accepting claims about Forward+, deferred, culling,
or texture upload wins.

API fit: Chromium/WebGL path now; WebGPU later needs matching trace and
timestamp-query collection.

Dependencies: stable scene URLs, trace summary script, GPU/hardware rejection,
timer-query fallback, and artifact naming.

Tarstate probes: `gpu_trace_run`, `gpu_timing`, `draw_count`, and diagnostics
for software renderer, missing timer query, or disjoint timing.

First benchmark: extend `profile:gpu` to record scene name, context version,
extension flags, and the first `renderer_capability`/`gpu_timing` rows.

### Deterministic Fixtures

Resources: `tests/gltf-fixture`, DamagedHelmet fixture, fake WebGL helpers, and
chargrid kitchen-sink layout.

Royal fit: future renderer changes need small scenes that isolate one claim.

API fit: all backends. The fixture contract is more important than backend
details.

Dependencies: fixture manifest, asset hashes, expected bounds, expected draw
lanes, expected pick samples, and stable seeds.

Tarstate probes: `fixture_run` and `fixture_expectation` rows.

First benchmark: create a fixture manifest that covers `primitive-static`,
`helmet-gltf`, `card-stress-textures`, and `gpu-pick-helmet-fuzz`.

## Package And Module Split

Recommended split, keeping the current monorepo rules:

- `packages/renderer-core`: pure scene model and authoring helpers only.
  Cameras, render roots, passes, nodes, material/geometry recipe shapes,
  transform input types, stable handles once they exist. No WebGL, WebGPU,
  React, loaders, shader tooling, tarstate, or browser handles.
- Renderer backend package or submodule, likely not under `renderer-core`:
  WebGL1/WebGL2 executors, shader programs, GPU resource caches, frame
  scheduling, timer/occlusion queries, readback queues, and context loss.
- Asset pipeline/cache package or backend-adjacent module: source bytes,
  decoded glTF buffers/images, KTX2/Basis transcoding, material recipes,
  texture cache, environment maps, content hashes, and readiness metrics.
- Visibility/picking service: bounds extraction, frustum/portal/BVH/HZB policy,
  CPU pick geometry, GPU ID/depth picking, and visible-set outputs. It consumes
  scene/asset handles and backend query/readback services; it does not live in
  React.
- Benchmark harness: scene fixtures, hardware GPU runner, trace summaries,
  fake WebGL resource-lifetime tests, and tarstate probe-flow benchmarks.
- `react-regl-fiber`: React root lifecycle, JSX lowering, hooks, and a facade
  for stable authoring helpers. It should not re-export planner, cache,
  backend, transport, or shader internals.
- Tarstate lens/probe layer: row schemas, query helpers, diagnostics, and app
  boundary contracts. It observes renderer stores and results; it never owns raw
  GPU/browser handles.

Decomplection rule for feature slices: implement the narrowest package seam
that lets the benchmark observe the feature. If a helper is only needed by the
WebGL executor, do not promote it to `renderer-core`. If a row exists only for
debugging a renderer backend, keep it in the probe layer rather than the scene
model.

## Roadmap

### First Benchmarks And Prototypes

1. `card-stress-textures` plus probe rows.
   Build the fixture and benchmark first, before atlas or KTX2 work. Emit
   texture upload, texture readiness, draw lane, first nonblank frame, and
   allocation-after-warmup metrics. Decomplection: keep fixture data, texture
   cache metrics, and renderer execution separate.

2. `gpu-pick-helmet-fuzz` ID/depth picking.
   Reuse the current helmet pick oracle and add a GPU ID/depth pass prototype.
   Measure mismatch count and readback latency. Decomplection: move pick policy
   toward a visibility/picking service contract without pushing it into React
   or `renderer-core`.

3. `forward-plus-light-stress` on WebGL2 only.
   Start with a light collector and tile-list prototype behind a feature-wired
   renderer construction path. Compare against the current simple forward path.
   Decomplection: keep Forward+ absent from primitive-only imports and add an
   import/bundle-shape proof when the package split exists.

### Deferred Research

- Clustered forward, deferred, and tiled deferred until the WebGL2 benchmark
  harness and simple Forward+ light-stress evidence exist.
- Virtual/megatextures until atlas and KTX2/Basis prove real pressure.
- Portal/sector culling until a source adapter provides sector metadata.
- WebGPU backend until WebGL2 fixtures and probe rows are stable.
- Shadows beyond a single directional proof scene until PBR and texture
  readiness are measurable.

### Explicit Non-Goals

- No product behavior changes from this document.
- No dependency additions without an implementation slice and benchmark gate.
- No Forward+, deferred, virtual texture, or WebGPU code in
  `renderer-core`.
- No renderer-specific streaming protocol.
- No raw WebGL/WebGPU/browser handles in tarstate relations.
- No "support everything by default" glTF loader. Unsupported features need
  explicit diagnostics or skipped fixture tests.
