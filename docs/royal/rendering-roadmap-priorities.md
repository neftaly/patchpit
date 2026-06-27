# Rendering Roadmap Priorities

This is the decision layer for the Royal rendering wishlist. The detailed
research and first-benchmark catalog remains in
`docs/royal/rendering-wishlist-and-benchmarks.md`; this file ranks what to
prototype now, what should wait, and what proof should gate promotion.

Current baseline: `@royal/renderer-core` is pure scene data, `react-regl-fiber`
owns the WebGL1 executor and direct shaders, and `chargrid-lab` is the strongest
local workload with Yoga layout, fitted DamagedHelmet previews, CPU picking,
simulated GPU ID/depth picking, and texture paging probes.

Decomplection rule: every prototype must keep authoring data, asset/cache
policy, visibility/picking policy, GPU backend effects, and Tarstate probe rows
separate until measurements prove a tighter seam is needed.

## Priority Key

| Priority | Meaning |
| --- | --- |
| Prototype now | Small proof can run against current scenes or a narrow WebGL2 fixture and will unblock several later choices. |
| Prototype later | Plausible feature, but it needs upstream fixtures, probes, package seams, or evidence of pressure first. |
| Non-goal now | Do not build as renderer v2 product work. Keep only research notes or explicit skipped fixtures. |

## Lighting And Shading

| Item | Priority | Why | First gate | Likely split | Tarstate probe rows | Browser/API constraints |
| --- | --- | --- | --- | --- | --- | --- |
| Simple forward | Prototype now | This is the cheap WebGL1 card/table path and current behavior. Add probes before replacing it. | `primitive-static` and `card-stress-textures`: first nonblank frame, p95 frame time, draw count, warm allocations. | `renderer-core` scene data; WebGL executor owns programs, resources, frame stats. | `renderer_capability`, `render_lane`, `frame_stats`, `gpu_timing`. | WebGL1 baseline; WebGL2 can add VAO/instancing fixtures but must not raise the default floor yet. |
| Forward+ | Prototype later, after WebGL2 fixtures | Useful for many local lights, but should not tax primitive/card builds. Needs light collector and tile-list proof first. | `forward-plus-light-stress`: 0, 16, 64, 256, 1024 lights over helmet plus boxes. | Optional lighting module plus backend tile-list implementation; no point-light collector in `renderer-core`. | `light_rows`, `light_tile_rows`, `lighting_budget_rows`, `feature_gate`. | Realistic WebGL target is WebGL2. WebGPU later for compute/storage-buffer culling. |
| Clustered forward | Prototype later | Better for deep scenes and XR, but only after Forward+ proves light-list value. | Reuse `forward-plus-light-stress` with near/far sweeps and dual-view/XR-shaped cameras. | Optional lighting module sharing light packing policy with Forward+. | `cluster_grid`, `cluster_light_count`, overflow diagnostics. | WebGL2 with packed textures is possible; WebGPU is the natural implementation. |
| Deferred and tiled deferred | Prototype later, maybe non-goal for cheap builds | Competes with transparent UI/text/card workloads. Only worth testing if Forward+ fails on many-light scenes. | `deferred-gbuffer-smoke`, then tiled light accumulation if naive deferred is fill-bound. | Separate deferred backend path, G-buffer format policy, postprocess owner. | `gbuffer_attachment`, `deferred_pass_time`, `deferred_tile`, `material_variant_usage`. | WebGL2 minimum for serious proof; WebGL1 extension stack is research-only. |
| PBR and IBL | Prototype later, after asset readiness | Needed for real glTF inspection, not for boxes/text. Must be measured as asset/material readiness, not just shader code. | `helmet-pbr-readiness`: source, decode, upload, first draw, all textures ready, shader compile. | Asset/material recipe cache, environment map cache, backend shader variants. | `material_recipe`, `texture_readiness`, `environment_map`, unsupported-extension diagnostics. | WebGL1 can do a minimal path; WebGL2 improves mips/formats; KTX2/IBL assets gate quality. |
| Shadows | Prototype later | Useful for rich 3D inspection, but easy to damage cheap UI performance. Start with one directional proof only. | `directional-shadow-helmet`: no shadow vs 1-map vs 3-split shadow. | Optional shadow module plus backend depth resources and caster collection. | `shadow_map`, caster count, update reason, atlas/depth-format diagnostics. | WebGL2 depth texture path preferred; WebGL1 needs extension or encoded fallback. |

## Visibility And Interaction

| Item | Priority | Why | First gate | Likely split | Tarstate probe rows | Browser/API constraints |
| --- | --- | --- | --- | --- | --- | --- |
| Frustum culling | Prototype now | Backend-neutral, directly useful for repeated props and streamed scenes. | `frustum-10k-boxes`: planner time, visible count, draw count, allocations. | Visibility service over scene/asset bounds; planner consumes visible set. | `visibility_candidate`, `visible_instance`. | CPU path works in WebGL1, WebGL2, WebGPU, main thread, and worker. |
| BVH/spatial indexes | Prototype now, narrowly | Shared pressure for CPU picking, frustum, and source windows. Current chargrid pick fuzz gives an oracle. | `bvh-pick-and-frustum`: linear vs grid/hash vs BVH over helmet triangles plus 10k boxes. | Visibility/picking package, not React or `renderer-core`. | `spatial_index_stats`, rebuild/refit/query diagnostics. | CPU first; WebGPU refit/build is later research. |
| GPU ID/depth picking | Prototype now | It gates rendered-truth picking and should precede HZB occlusion. Chargrid already has a simulated bridge. | `gpu-pick-helmet-fuzz`: mismatch count vs CPU oracle and p95 readback latency. | Picking service plus backend pick pass/readback queue. | `pick_sample`, `pick_result`, `pick_readback_latency`, `debug_id_pixel`. | WebGL `readPixels` is synchronous; use tiny probe viewports or queued reads. WebGPU readback is async. |
| Occlusion queries | Prototype later | Query latency and asynchrony make this optional. It should reject heavy hidden props only if measured. | `occlusion-hidden-helmets`: no cull vs query cull vs CPU bounds-only. | Backend query pool plus visibility service result consumption. | `occlusion_query`, issued/available frame, `late_result`. | WebGL2 query objects or WebGPU query sets; no same-frame correctness dependency. |
| HZB/software occlusion | Prototype later | Needs GPU pick/depth conventions and deterministic occluder policy first. | `hzb-card-stack`: CPU software raster vs WebGL2 HZB vs no occlusion. | Visibility service plus backend depth pyramid resources. | `occluder_set`, `hzb_level_stats`, `software_occlusion_stats`. | CPU software path works everywhere; WebGL2 depth pyramid; WebGPU compute later. |
| Portal/sector culling | Non-goal now | Only useful for room-like streamed worlds and requires source metadata that does not exist yet. | `portal-room-graph` after a source adapter provides sector metadata. | Scene-source/visibility metadata package. | `sector_visibility`, `portal_traversal`. | CPU-only policy; backend agnostic. |
| LOD and impostors | Prototype later | Valuable for repeated props, but needs asset readiness, pick policy, and atlas pressure first. | `lod-repeated-props`: full mesh vs impostor vs distance hide across zoom levels. | Asset LOD recipes plus visibility/planner selection; impostor atlas in asset/backend layer. | `lod_choice`, missing LOD, atlas pressure. | CPU selection everywhere; impostor rendering works in WebGL1 once atlas exists. |

## Textures And Assets

| Item | Priority | Why | First gate | Likely split | Tarstate probe rows | Browser/API constraints |
| --- | --- | --- | --- | --- | --- | --- |
| Texture atlas | Prototype later, immediately after texture stress | Likely first practical texture optimization, but benchmark pressure must come first. | `card-stress-textures`: 500 to 5k cards, upload count, draw lanes, readiness. | Asset/cache package for atlas allocation; backend owns texture pages/uploads. | `atlas_page`, `atlas_allocation`, `texture_upload`, fragmentation/eviction diagnostics. | WebGL1 works; WebGL2 array textures are optional; WebGPU resource tables later. |
| Virtual/megatexture | Prototype later | Useful for huge boards/maps, but WebGL has no sparse residency. Current chargrid paging is a policy proof, not a renderer feature. | `virtual-texture-board`: 16k/32k tiled board, pan/zoom, resident bytes, upload time, missing-page count. | Asset cache/page-table policy plus backend page uploads; no `renderer-core` code. | `texture_page_request`, `texture_page_residency`, `texture_cache_budget`. | App-managed ordinary textures in WebGL/WebGPU; no assumption of sparse textures on web. |
| KTX2/Basis | Prototype later, before virtual textures graduate | Best delivery path for many real glTF/card textures, but requires transcoder and format gates. | `ktx2-helmet-and-cards`: bytes, transcode, upload, GPU memory estimate, first/all ready. | Asset pipeline/cache package, worker transcoder, backend format selection. | `texture_source`, `transcode_job`, `gpu_texture_format`, fallback diagnostics. | WebGL needs compressed texture extension matrix; WebGPU still needs feature/format gating. |
| Streaming glTF | Prototype now, as cache/readiness expansion | Repeated assets and future streamed scenes need source/decode/recipe/GPU identities split before richer materials. | Expanded `helmet-gltf`: duplicate URLs to same content, delayed textures, repeated instances, unmount-before-ready. | Asset source/decode/cache package; backend GPU realization; React keeps declarative `<gltf src />`. | `asset_source`, `asset_decode`, `asset_gpu_resource`, `asset_readiness`. | Mostly API-neutral; browser fetch/image decode and cancellation behavior must be explicit. |
| Material variants | Prototype later | Useful for skins/configuration, but depends on material recipe identity and glTF cache split. | `material-variant-switch`: 8 variants, interaction-rate toggles, resource reuse, shader switches. | glTF material recipe and material-binding layer. | `asset_variant`, `selected_variant`, `material_binding`. | Backend agnostic except shader/material binding. |

## Platform And Backends

| Item | Priority | Why | First gate | Likely split | Tarstate probe rows | Browser/API constraints |
| --- | --- | --- | --- | --- | --- | --- |
| WebGL extension gating | Prototype now | Required before trusting any advanced benchmark. Capabilities must be rows, not hidden globals. | `capability-matrix-smoke`: primitive, helmet, card stress, timer query across WebGL1/WebGL2. | Backend capability probe plus Tarstate probe adapter. | `renderer_capability`, `feature_gate`, `context_version`, `webgl2_feature`. | Extension gates per feature: instancing, VAO, draw buffers, depth textures, compressed textures, timer queries. |
| WebGL2 root and fixtures | Prototype now | Forward+, deferred, HZB, occlusion, and reliable GPU timing all need a WebGL2 fixture path. | `check:gpu` and `profile:gpu` over identical WebGL1/WebGL2 proof scenes. | Backend package/submodule; shared scene/planner inputs. | Same as extension gating plus `gpu_timing`. | WebGL1 stays default cheap path until carrying it has measured cost. |
| WebGPU backend | Prototype later | Should be another backend under the same scene, asset, planner, visibility, and probe contracts. | No-feature WebGPU root after WebGL2 fixtures: `primitive-static`, same probe rows, disposal. | Backend package only: pipelines, bind groups, resource lifetime, queries, copies. | `renderer_capability`, `feature_gate`, `gpu_timing`, `resource_lifetime`. | Requires browser WebGPU availability and device-loss handling; do not fork scene model. |
| OffscreenCanvas | Prototype later, after probe rows | Important for latency and throughput, but it changes backend scheduling and message protocol. | Worker root smoke: primitive and helmet with frame ids, queue limits, coalesced transforms. | Runtime backend/client protocol; GPU resources remain worker-owned. | `frame_stats`, `resource_lifetime`, transform publication rows, queue/drop diagnostics. | OffscreenCanvas support varies; include non-worker fallback and context-loss handling. |
| XR | Prototype later, API-shaped now | Architecture must not assume mono camera or main-thread canvas, but product proof waits for backend seams. | XR smoke scene: per-eye/multiview frame time, snapshot cost, main-thread stalls. | XR runtime backend and input/view integration, sharing logical recipes/planner. | `xr_view`, `renderer_capability`, `frame_stats`, input rows. | WebXR availability and multiview extensions are browser/device dependent. |

## Recommended Next 5 Prototypes

1. `capability-matrix-smoke` plus WebGL2 root fixtures.
   This unblocks reliable extension decisions, timer-query reporting, and all
   advanced-renderer gates.

2. `card-stress-textures`.
   Measure texture upload count, texture readiness, draw lanes, and warm
   allocations before building atlas, KTX2, or virtual texture machinery.

3. `gpu-pick-helmet-fuzz`.
   Turn the simulated chargrid GPU ID/depth bridge into a real backend proof and
   use it as the pick/visibility truth gate.

4. Expanded `helmet-gltf` streaming/cache readiness.
   Split URL/source/decode/asset recipe/GPU resource identity with repeated
   instances, delayed texture decode, and unmount-before-ready disposal.

5. `frustum-10k-boxes` plus narrow BVH comparison.
   Establish a visibility service seam and avoid baking picking/culling into
   React, `renderer-core`, or a specific backend.

## Dependency Chain

- WebGL extension rows -> WebGL2 fixtures -> Forward+ light stress -> clustered
  forward or deferred/tiled deferred experiments.
- `card-stress-textures` -> texture atlas -> KTX2/Basis delivery -> virtual or
  megatexture promotion.
- Expanded `helmet-gltf` cache/readiness -> PBR/IBL material recipes -> material
  variants -> shadows and richer inspection scenes.
- GPU ID/depth picking -> stable depth/ID conventions -> HZB/software occlusion
  -> occlusion-query/HZB comparison -> LOD/impostor visibility policy.
- Frustum culling -> BVH/static-dynamic spatial split -> streamed scene windows
  -> portal/sector culling only if source metadata appears.
- Probe rows and deterministic fixtures -> OffscreenCanvas worker root -> XR
  backend smoke -> WebGPU backend parity.

## Wait List And Non-Goals

- Wait on Forward+, clustered forward, deferred, tiled deferred, HZB, shadows,
  and WebGPU until WebGL2 fixtures and probe rows exist.
- Wait on atlas until `card-stress-textures` proves texture pressure; wait on
  virtual textures until atlas and KTX2/Basis prove delivery/cache pressure.
- Wait on portal/sector culling until a source adapter emits sector metadata.
- Keep raw WebGL/WebGPU/browser handles out of Tarstate rows.
- Keep advanced renderer modules out of `@royal/renderer-core`.
- Do not add product renderer behavior from wishlist docs alone; every promoted
  item needs a named fixture, metric, and package seam.
