# Renderer V2 Target Architecture

This document records the current v2 target for the renderer. Keep it as a
short architecture checkpoint, not a coordination log.

Package naming correction: this checkpoint predates the React facade rename.
Read claims that call `react-regl-fiber` the branded or primary React surface as
historical wording. The canonical React import and JSX source is now
`@royal/react`; `react-regl-fiber` remains the legacy bridge implementation.

## Design Goal

V2 should be a light, fast renderer for primitives, glTF, streamed scene data,
and XR. The branded React wrapper should be `react-regl-fiber` and should stay
close to the v1 JSX surface while the internals become smaller, more modular,
and easier to benchmark against v1.

The primary workload is Probability/Tarpatch-style rendering: many textures,
many repeated objects, a few reusable glTF assets, automatic instancing, and
predictable interaction latency. Dynamic detail and LOD policy must handle both
fast-moving views and slow inspection paths without making transport,
replication, culling, or shader feature policy the same concept. The renderer
should also support richer glTF, streaming, and XR without forcing those costs
into the smallest build.

V2 is not a general scene-authoring engine, a Three.js clone, or a Unity-style
runtime. It is a renderer and scene-source pipeline for Probability/Tarpatch
applications, with enough glTF, streaming, and XR support to use real assets and
real interaction modes.

## Architecture Invariants

These are v2 constraints, not implementation preferences:

- Stable handles cross the render hot path. Asset recipes must intern into
  stable geometry, material, texture, environment, and source handles before
  planning. Fresh descriptor objects may exist at source boundaries, but not as
  draw identity.
- Render planning uses retained workspaces. A pure planner means pure policy
  over reusable arenas, scratch arrays, typed arrays, draw lanes, and instancing
  buffers; it does not mean allocating a full draw plan every frame.
- Feature wiring resolves at construction. Renderer modules produce concrete
  capabilities such as collectors, material slot layouts, shader variants,
  lighting implementations, batchers, and draw commands. Hot paths do not
  iterate generic plugin hooks per draw.
- Absent modules have no hot-path work. If Forward+, advanced glTF materials,
  animation, streaming, or XR are not wired into a renderer build, their draw
  commands, resource lookups, shader branches, and per-frame collectors are not
  present in that build's hot path.
- Poses are separate from assets. glTF source bytes, asset recipes, animation
  poses, and GPU resources have separate identities. Static accessors and
  textures are not keyed by pose.
- Unsupported advanced glTF targets are tracked by skipped tests. A feature may
  be incomplete, but it must have an explicit fixture or test target rather than
  disappearing from the roadmap.
- High-frequency updates do not require React reconciliation. Animation loops,
  camera motion, XR input, and streamed transform changes must have handle,
  external-store, or columnar transport paths.
- Scene patches have lanes. Full snapshots, structural patches, node prop
  patches, render-state patches, and transform publications have different
  ordering, coalescing, and recovery semantics.
- Transforms are columnar transport. Shared transform slots/publications are
  not ordinary scene patches.
- Backends own GPU resources and frame scheduling. Main-thread, offscreen, and
  XR can share logical recipes and policies, but not WebGL resource lifetimes or
  frame clocks.
- XR is a supported backend, not a later compatibility patch. V2 APIs must not
  assume a single mono camera, single view, single frame clock, or main-thread
  canvas-only execution model.
- `react-regl-fiber` is the primary React API, but the renderer core is usable
  without React. React may describe scene structure and feature wiring; it does
  not own asset recipes, planning, caches, or GPU execution.
- Transport, interest policy, and renderer patch metrics stay separate.
  WebTransport chunking, scene feature windows, and renderer patch boundaries
  are distinct concepts.
- Kept v1 capabilities require parity gates. A v2 replacement is not accepted
  for a kept feature until it has a named scenario, metric, and allowed
  regression budget against v1 or an explicitly documented reason that v1 is the
  wrong baseline.

## Compatibility Anchors

These v1 surfaces should survive unless a replacement is clearly simpler:

- `createRoot` with canvas, render, frame subscription, XR, and unmount support.
- The intrinsic JSX scene vocabulary: `scene`, `pass`, `perspectiveCamera`,
  lights, `mesh`, and `gltf`.
- The primitive example shape: module-level geometry/material creation followed
  by simple `<mesh geometry material translation />` use.
- The glTF helmet example shape: declarative `<gltf src translation scale />`.
- Primitive helpers such as box, plane, and wire-box geometry.
- Plain geometry/material objects with optional `batchKey` for batching and
  automatic instancing.
- Camera-control interop where controls own camera state and pass camera props
  into the renderer.

## Architecture Layers

V2 should separate policy from effects:

1. Scene API: `react-regl-fiber`, Solid, and native entry points that describe
   scenes.
2. Asset recipes: pure or pure-ish primitive, glTF, texture, and streamed
   descriptor extraction.
3. Runtime caches: source bytes, decoded buffers/images, evaluated glTF state,
   material recipes, geometry recipes, and scene-source cursors.
4. Render planner: culling, batching, auto-instancing, feature policy, upload
   planning, and draw-lane construction.
5. GPU executor: WebGL resources, shader programs, buffer uploads, texture
   uploads, draw submission, and disposal.
6. Runtime backends: main-thread, OffscreenCanvas worker, and XR.

Pure functions should own descriptors, cache keys, feature selection,
replication decisions, and render planning. Mutable systems should own frame
collectors, caches, resource lifetimes, and GPU submission.

Treat this as a default rule: prefer pure data transforms at asset and policy
boundaries, and break that rule only when a benchmark, profiling trace, or
specific data-structure analysis proves that the pure version is wrong for the
hot path. Even then, first check whether the data structure is the problem
before moving more policy into mutable code.

Allocation count is a benchmark metric, not an implementation detail.

## Feature Modules

The core should stay small. Features should be construction-time modules where
possible so unused features can be tree-shaken and unsupported paths fail
clearly.

First-class modules:

- primitives
- glTF mesh
- glTF textures/materials
- glTF variants
- glTF animation
- glTF skinning and morph targets
- advanced glTF material extensions
- automatic instancing
- Forward+ lighting
- image-based lighting
- streamed scene sources
- XR

Runtime feature policy can still exist, but it should not be the only gating
mechanism. A cheap card-game build should not import advanced glTF or Forward+
code if it does not use it.

Feature disabling should usually be wiring: construct a renderer with fewer
modules instead of passing a large negative configuration object through every
layer. This follows the "Out of the Tar Pit" pressure to avoid hidden mutable
state and control-flow tangles. Prefer explicit data and simple composition over
generic plugin machinery until repetition proves the abstraction is needed.

Avoid per-draw plugin iteration or polymorphic feature hooks in the hot path.

## React Wrapper

The React package is `react-regl-fiber`. It is the primary React import path
and owns JSX rendering, React root lifecycle, and React hooks.

`react-regl-fiber` may re-export stable renderer-core authoring helpers so React
examples do not require a second import for common geometry, materials, or asset
helpers. That facade rule stops at authoring APIs. Planner internals, cache
internals, backend internals, transport, and shader/build tooling must not be
re-exported through the React package.

Renderer core remains usable without React. The dependency direction is:
`react-regl-fiber -> renderer-core`.

Keep the surface direct:

- `createRoot`
- `RendererProvider`
- `useFrame`
- intrinsic scene elements
- `<mesh />`
- `<gltf />`
- future `<stream />` or a thin streamed-source component

Avoid turning every internal renderer subsystem into a React component. React
should describe scene structure and opt into feature modules; the asset,
planning, cache, and GPU layers should remain usable without React.

## XR

XR is a supported Probability use case and must remain in the architecture from
the start. It should be a runtime backend and view/input integration layer, not
a forked renderer.

The same scene state, asset caches, render planner, and GPU executor concepts
should serve main-thread, offscreen, and XR rendering. XR-specific code should
own session support, input sources, origins, render views, and frame scheduling.
Logical asset recipes and policies can be shared across backends; GPU resources
and frame scheduling are backend-owned. XR acceptance must measure per-eye or
multiview frame time, snapshot cost, and main-thread stalls.

## glTF

V2 should keep v1's declarative `<gltf src />` surface while decomplecting the
implementation into asset recipes, runtime caches, and GPU realization.

Keep:

- source/evaluated/scene/geometry/texture cache separation
- variants
- animation sampling and preloading
- texture cache and readiness instrumentation
- material feature policy
- clear cache keys for content, evaluation, and GPU resources

Change:

- Do not make cloning JSON and rebuilding full glTF documents the scalable
  animation path. Keep it as a compatibility path while adding runtime pose,
  morph, and material evaluation.
- Static geometry and textures should be content-global where possible.
  Dynamic/skinned/morphed geometry should be explicitly marked as per-pose or
  per-instance.
- Split glTF identity into separate keys: source bytes/content, asset recipe,
  evaluation or pose, and GPU resource. Textures and static accessors should not
  be keyed by pose. Same bytes loaded through different URLs should have a path
  to share decoded immutable resources once content identity is known.
- CPU-baked skinning and morphing are compatibility paths with bounded preload
  budgets. The scalable animated-actor path should use runtime pose state,
  shared pose buffers, GPU skinning/morphing, or another representation that
  does not rebuild/upload unique geometry for every sampled pose.
- Animation preloading should prepare pose data without retaining full evaluated
  scenes or GPU resources unless explicitly requested. Cache limits should be
  resource-class or byte aware, not only entry-count based.
- Unsupported advanced glTF features should have explicit failing or skipped
  tests that describe the desired behavior. They should not silently disappear
  from the roadmap.

Use `test.skip` or equivalent tracked skipped tests for unsupported glTF feature
targets. The tests should name the desired behavior and fixture, not become
permanent red CI.

The React API should expose animation, skinning, and morph intent without
forcing the first implementation to be complete:

```tsx
<gltf
  src="/character.glb"
  selectedAnimation="walk"
  sampleAnimationTime={time}
  animationPlayback="sampled"
  skinning="auto"
  morphTargets="auto"
  morphWeights={{ Smile: 0.7 }}
  preloadAnimationTimes={[0, 0.25, 0.5]}
/>
```

Suggested prop meanings:

- `selectedAnimation`: chooses a named or indexed glTF animation.
- `sampleAnimationTime`: deterministic sampled pose time for external clocks,
  tests, timelines, and server-driven animation.
- `animationPlayback`: future policy for sampled, playing, or disabled
  animation.
- `skinning`: `auto`, `gpu`, `cpu`, or `off` once both paths exist.
- `morphTargets`: `auto`, `gpu`, `cpu`, or `off` once both paths exist.
- `morphWeights`: named or indexed morph target weights.
- `preloadAnimationTimes`: asks the runtime to prepare nearby animation samples
  without changing the render result.

## Streaming And Interest

Streaming should feed the same scene state and render planner as local meshes
and glTF. It should not be a separate renderer path.

The generic shape is:

```txt
SceneSource -> ScenePatchBatch -> SceneState -> RenderPlan -> GPU executor
```

`ScenePatchBatch` must be precise enough to preserve offscreen and streaming
performance. It should distinguish at least:

- `fullSnapshot`
- `structuralPatch`
- `nodePropsPatch`
- `renderStatePatch`
- `transformPublication`

Each batch needs source cursor or scene revision semantics, ordering rules,
coalescing rules, and a fallback-to-snapshot recovery path. Structural patches
are atomic against a known revision. Node prop patches are not the same thing as
structural patches. Transform publications are a columnar transport lane, not
ordinary patch payloads.

Sources may include static fixtures, local glTF, game-table state, replay data,
or Infinigen/WebTransport streams. Infinigen should be one source adapter, not
the renderer architecture.

Keep the current interest work as a scheduling and transport layer:

- declarative scene interest
- interest-derived budget and replication hints
- descriptor catalogs
- feature windows
- cache keys and invalidations
- WebTransport runtime path

Transport code should move bytes and preserve ordering/backpressure. Scene
policy should decide which features or entities matter.

Transport metrics, interest-policy metrics, and renderer patch metrics should
remain separate. WebTransport chunking must not define scene patch boundaries,
and feature windows must not define QUIC flow-control windows.

## Dynamic State Prototype Boundary

The Donnybrook-style prototype should live above rendering. It should derive
attention and replication decisions, then emit scene patches or dynamic-state
frames.

Use P2P3V only for a narrow reliable dynamic-state event log:

- deterministic event reducers
- causal cursors
- snapshots plus missing-event reconciliation
- scheduled deterministic events

P2P3V can shape a future source-level event API, but not the renderer API.
The API decision to keep is a generic dynamic-state source that can emit
dynamic-state frames or `ScenePatchBatch` lanes with event kind, source cursor,
recovery metadata, and authority classification. Do not expose peer identity,
signaling, mesh topology, or WebRTC concepts through renderer-core,
`react-regl-fiber`, asset recipes, or scene patches.

Do not copy full mesh WebRTC topology, peer authority for combat-critical
state, global lockstep simulation, or persistence policy into v2.

## Offscreen And Multi-Core

OffscreenCanvas and SharedArrayBuffer transform transport should remain runtime
backends. They are important for throughput and interaction latency, but should
not create a second renderer model.

Keep:

- worker-backed root renderer
- main-thread root client protocol
- SharedArrayBuffer transform slots
- transform-only update fast path
- fuzz and stress coverage for slot lifecycle and scene mutation

Transform transport keeps its own publication protocol: stable slot ids,
16-float aligned matrices, publish versions, dirty ranges, reattach-on-growth,
and a documented non-SAB fallback. High-frequency `useFrame` work should mutate
transform handles or external stores, not force React prop updates.

Worker protocols should include frame ids, applied-revision acknowledgements,
queue limits, drop/coalesce policy by batch kind, and resync/error handling.
Root/structural batches are barriers; camera, render-state, and transform
updates can be coalesced only when doing so preserves revision semantics.

## Forward+ Lighting

Forward+ should survive as an optional lighting module. It should not be
mandatory for a cheap card-game build.

Keep the concepts:

- point-light collection
- light-slot packing
- tiled light textures
- scalar and instanced draw compatibility

V2 should make the simple-light path cheap and make Forward+ opt in.

## Benchmarks And Acceptance

Every v1 feature we keep must have a v1-versus-v2 benchmark or parity check.
V2 should not rely on anecdotal performance wins.

Benchmarks need named scenarios and thresholds. Do not accept open-ended
"faster" claims. Each kept v1 capability should have a scenario, metric, and
allowed regression budget.

Required proof scenes:

- primitive example
- glTF helmet example
- Probability/card stress scene with many textures, repeated tokens, and
  repeated glTF props
- streaming/Infinigen scene source
- XR smoke scene

Required metrics:

- first nonblank frame
- input latency
- frame diagnostics
- draw count
- scalar versus instanced draw lanes
- texture upload count and upload time
- per-unique-texture readiness
- glTF source/evaluation/scene/first-draw/readiness timings
- full-root frame count
- root-patch count
- worker/offscreen transform throughput

Use the existing hardware WebGL harness as the release benchmark path:
`pnpm check:gpu` for checks and `pnpm profile:gpu` for traces.

The historical chat logs and implementation notes are part of the design
corpus. Use them to recover requirements and tradeoffs, but keep durable
architecture decisions in this document or focused package docs.

API sketches for each proof scene should come before major implementation. The
first milestone can be API-first for primitives, helmet glTF, card stress,
streaming, and XR, then implementation can proceed in slices.

## Defer Or Exclude From First Cut

Defer:

- full persistent streamed cache/data-service integration
- multiplayer persistence policy
- full Donnybrook replication implementation
- full P2P/WebRTC mesh transport
- peer authority for combat-critical state
- global deterministic lockstep as the default model

Exclude:

- renderer-specific streaming protocols
- HTTP fallback in the hot streaming runtime
- Three.js-style mutable object hierarchy as the core model
- support-everything-by-default glTF loading
- benchmark/history Markdown logs that do not change architecture

## First Implementation Shape

The first v2 slice should prove one core pipeline across local and streamed
inputs:

```txt
scene API
  -> asset recipes
  -> runtime caches
  -> render planner
  -> GPU executor
  -> main/offscreen/XR backend
```

The primitive, helmet, card-stress, streaming, and XR examples should all use
that pipeline.
