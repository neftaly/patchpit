# Tarstate Boundary For Royal

This note decides where Tarstate belongs relative to Royal
`renderer-core`, `react-regl-fiber`, and the chargrid lab. It is based on the
current code and research notes, especially:

- `docs/v2/research/tarstate-royal-api.md`
- `docs/v2/research/prototype-status.md`
- `docs/royal/renderer-v2-target-architecture.md`
- `packages/renderer-core/src/*`
- `packages/react-regl-fiber/src/*`
- `packages/tarstate/src/royal-prototype.ts`
- `apps/chargrid-lab/src/royalTarstateLens.ts`
- current Tarstate, Royal, chargrid, GPU pick, and benchmark tests

## Decision

Tarstate should not live inside `@royal/renderer-core`.

Tarstate should live near Royal as an adapter/lens layer, first as a
Royal-specific package that depends on Tarstate but not on React, WebGL, DOM, or
renderer backend internals. The practical first package is:

- `@royal/tarstate-lens` in `packages/royal-tarstate-lens`

If row contracts become useful outside Tarstate, split the package into:

- `@royal/state` in `packages/royal-state`: renderer-independent row,
  command, diagnostic, and snapshot type contracts.
- `@royal/tarstate-lens` in `packages/royal-tarstate-lens`: Tarstate schema,
  queries, `RelationSource` adapters, store lenses, and writer routes over
  `@royal/state` rows.

This keeps the dependency direction clear:

```txt
@patchpit/tarstate
        ^
        |
@royal/tarstate-lens  -> optional @royal/state contracts

react-regl-fiber -> @royal/renderer-core
```

`@royal/tarstate-lens` currently depends on `@patchpit/tarstate` and rehomes
the first Royal row/schema/query/store-lens/writer-route prototype. A temporary
compatibility shim remains at `packages/tarstate/src/royal-prototype.ts` so
older prototype tests and benchmarks can migrate incrementally.

`@royal/tarstate-lens` may consume public `@royal/renderer-core` value types
only if a concrete adapter needs them. It must not import
`react-regl-fiber`, `packages/react-regl-fiber/src/webgl/*`, React, DOM, WebGL,
browser resource handles, or renderer caches.

Decomplection pressure: renderer authoring data, renderer execution, app-owned
state, capability effects, relation projection, and debug probes are separate
concerns. Putting Tarstate in renderer-core would tie those concerns together
at the package with the strictest hot-path and dependency constraints.

## Why Not Renderer Core

`@royal/renderer-core` is currently a dependency-light authoring package. It
exports value objects and helper constructors for cameras, scenes, passes,
meshes, materials, lights, glTF URL nodes, vector text, transforms, coordinate
systems, and `RenderRoot`. Its current public shape has no store, evaluator,
backend, cache, browser, worker, relation, or diagnostics runtime.

Putting Tarstate inside renderer-core would be wrong for three reasons.

First, dependency direction would invert. Tarstate is a generic relational
query/write package. Royal row lenses are app/runtime adapters over app-owned
stores. Renderer core should remain usable by direct authors, React, workers,
tests, and future backends without pulling in a relation evaluator or store
lens policy.

Second, it would put non-render policy into the render authoring surface. The
existing Royal Tarstate prototype already includes store ownership,
capability-effect rows, write dispatch routes, stale-reference diagnostics,
pointer samples, and app boundary contracts. Those are valuable Royal app
boundaries, but they are not renderer primitives.

Third, it would invite hot-path misuse. The renderer v2 architecture requires
stable handles, retained workspaces, construction-time feature wiring,
columnar transform transport, backend-owned GPU resources, and tight culling
and draw loops. Tarstate currently materializes object contexts and projected
rows during query evaluation. That is useful for probes, diagnostics, policy
joins, and app-visible snapshots, but not for every draw, every pointer event,
or every frame.

## Package Placement

### Recommended First Package

Use `packages/royal-tarstate-lens` with package name
`@royal/tarstate-lens`.

Dependencies:

- `@patchpit/tarstate`

Allowed type-only or later dependencies:

- `@royal/state`, if row contracts split out first
- `@royal/renderer-core`, only for public value types in optional adapters

Forbidden dependencies:

- `react`
- `react-regl-fiber`
- `packages/react-regl-fiber/src/webgl/*`
- DOM, WebGL, WebGPU, worker, and browser resource handles as public API
- app packages such as `@patchpit/chargrid-lab`

This package should initially own:

- Royal Tarstate schema and row types from `packages/tarstate/src/royal-prototype.ts`
- reusable store-lens primitives if they are still only used by Royal
- `createRoyalLensSnapshot`
- `createRoyalAppBoundary`
- `royalQueries`
- Royal writer routes for relation-shaped commands
- Royal probe and diagnostics helpers

If another app needs the generic store lens outside Royal, split those helpers
later into `@patchpit/tarstate-store-lens`:

- `ReadableStore`
- `WritableStore`
- `StoreLens`
- `createStoreLensSnapshot`
- `createStorePatchDispatcher`

Do not create that generic package until real second-use pressure exists.

### Optional Contract Package

Use `packages/royal-state` with package name `@royal/state` only when more than
one adapter needs row contracts without depending on Tarstate.

Dependencies:

- Prefer no runtime dependencies.
- If relation descriptors live here, it may depend on `@patchpit/tarstate`.
  The cleaner split is plain TypeScript row/command/diagnostic types in
  `@royal/state` and Tarstate relation refs in `@royal/tarstate-lens`.

This package would own stable contract names, not execution:

- scene row contracts
- layout row contracts
- pick/probe row contracts
- capability row contracts
- writer command contracts
- diagnostic code contracts
- benchmark/probe snapshot contracts

## API Surface

The Royal Tarstate layer should expose relation-shaped data and adapter
helpers. It should not expose renderer handles, raw app stores, DOM nodes, or
GPU resources.

### Scene Rows

Scene rows should describe renderable intent and stable identity without
becoming `RenderRoot` itself.

Useful rows:

- `sceneSources`: source id, coordinate system id, revision, authority, status
- `scenePasses`: pass id, scene id, camera id, clear policy
- `sceneNodes`: node id, parent id, kind, order, stable source path or object id
- `sceneNodeTransforms`: node id, transform slot id or value, revision
- `sceneAssets`: asset id, node id, kind, src or durable asset ref
- `renderRows`: layout/render projection rows for app-visible inspection and
  tests
- `renderLaneRows`: future probe rows for scalar/instanced lanes, not draw
  commands

`RenderRoot` remains direct renderer input. A row-to-`RenderRoot` adapter may
exist, but it is an adapter, not renderer-core state.

### Layout Rows

Current prototypes already point at the right shape:

- `scopes`: scope id, compact flag, grid columns/rows
- `layoutNodes`: durable node identity, parent, path, order, labels, role,
  group, asset id
- `layoutBoxes`: box id, cell rect, primitive, tone, text, asset id,
  interaction flag
- `renderFlags`: active, focused, hovered state by box id
- `assets`: stable asset ids and source refs
- `assetDiagnostics`: asset readiness/failure rows

Layout computation remains owned by the layout service or app adapter, such as
the chargrid Yoga code. Tarstate publishes, joins, validates, and probes the
layout rows.

### Pick And Probe Rows

Picking should be an adapter/service boundary. The chargrid CPU picker, helmet
fuzz test, and GPU ID/depth prototype already separate pick target publication
from hit-test execution.

Useful rows:

- `pickTargets`: target id, box id, bounds, role, label, group, layer,
  disabled flag
- `pointerSamples`: bounded/coalesced input samples, not raw unbounded pointer
  streams
- `pointerWindows`: optional high-rate coalesced windows with sample count and
  drop count
- `pickProbeRows`: sample plus target metadata
- `gpuPickProbeRows`: pixel, cell, decoded target id, depth, owner id, pass id
- `visibilityCandidateRows`: object bounds and culling inputs for probes
- `visibleInstanceRows`: visible output ids plus culling reason
- `pickFuzzRows`: deterministic fuzz sample id, expected id, actual id,
  mismatch class

The pick service owns spatial indexes, CPU triangle tests, GPU ID/depth passes,
readback policy, and throttling. Tarstate owns row visibility, stale-reference
diagnostics, deterministic probe snapshots, and cross-store joins.

### Capability Rows

Capability rows keep browser, renderer, and host effects observable without
leaking handles into app logic.

Current and near-term rows:

- `effectIntents`
- `effectResults`
- `capabilityDiagnostics`
- `rendererCapabilities`
- `featureGates`
- `assetReadiness`
- `textureUploadRows`
- `frameStatsRows`
- `resourceRows`

Known diagnostic/result codes should include the current Tarstate and
capability codes: `missing_ref`, `invalid_row`, `duplicate_key`,
`unsupported_lookup`, `activation_required`, `permission_denied`,
`policy_denied`, `resource_lost`, `context_lost`, `device_lost`,
`extension_missing`, `backpressure_dropped`, `unsupported`, and
`partial_failure`.

Capability interpreters remain adapter-owned. App code emits intents and reads
results; it does not receive `window`, `document`, `navigator`, WebGL contexts,
renderer roots, or raw store state.

### Writer Commands

Tarstate writes are transport commands at a relation boundary, not canonical
Tarstate-owned state.

The package should expose writer routes for low-frequency cross-boundary
commands such as:

- activation updates
- focus/hover state reconciliation after a pick
- effect result insertion/upsert
- capability diagnostic insertion
- debug/fuzz result publication
- benchmark/probe snapshot publication

Routes translate relation-shaped patches into private store mutations. If no
route exists, the dispatcher returns diagnostics and leaves stores untouched.
Current `unsupported_lookup` behavior is the right pattern even if the code name
is later refined for writes.

Use store-native mutation for local hot updates:

- raw pointer/keyboard events before coalescing
- renderer resource lifetime
- GPU/cache updates
- local UI toggles that do not cross stores
- frame-critical transforms and culling state

### Diagnostics And Probe Snapshots

The package should expose inspectable snapshots that are cheap to record in
tests and benchmarks:

- relation names
- row counts by relation
- selected relation rows
- diagnostics
- query timing metadata when supplied by a benchmark harness
- frame/probe ids
- input sample counts and drop counts
- allocation/heap counters when supplied by a benchmark harness
- renderer capability and feature-gate rows when supplied by a backend adapter

The snapshot API should stay pull-based:

```ts
const snapshot = createRoyalLensSnapshot(stores)
const rows = await evaluate(snapshot.source, royalQueries.renderRows)
const probe = snapshot.probe
```

React hooks can wrap this later, but the package API should not require React.

## What Stays Direct

The following remain outside Tarstate ownership:

- `RenderRoot` and public renderer-core value objects
- `react-regl-fiber` root lifecycle and `<Canvas>` rendering of one complete
  `RenderRoot`
- WebGL/WebGPU context creation
- shader programs
- `GeometryCache`, `GltfCache`, `TextCache`, and future renderer caches
- WebGL buffers, textures, framebuffers, queries, and other GPU resources
- glTF fetch/decode/upload state
- frame scheduling, resize scheduling, DPR handling, and context loss handling
- draw loops, draw-lane construction, and retained render workspaces
- tight frustum/occlusion culling loops
- CPU/GPU pick execution and readback timing
- raw high-rate input streams
- transform handle or columnar transform fast paths

Tarstate may observe these through rows after an adapter has coalesced,
indexed, bounded, or summarized them. It should not own them.

## How This Decomplects Royal Work

Occlusion culling becomes a visibility service that owns bounds, spatial
indexes, retained workspaces, and CPU/GPU culling details. It can publish
`visibilityCandidateRows`, `visibleInstanceRows`, counters, and diagnostics for
tests and debug panels. Renderer hot loops consume visible handles directly;
Tarstate validates and explains the state outside the draw loop.

Picking becomes a pick service with CPU and GPU implementations behind the same
probe rows. The current chargrid CPU picker and GPU ID/depth prototype can both
publish decoded target ids and depth/owner rows. Tarstate joins those rows to
layout, interaction, and fuzz metadata without putting `readPixels` or triangle
tests in app logic.

Layout becomes a producer of `layoutNodes`, `layoutBoxes`, `pickTargets`, and
render flags. Yoga, chargrid cell snapping, and future layout engines stay
owned by layout adapters. Tarstate checks stale references and provides
cross-store render/pick/capability views.

Capability effects become intent/result loops. Browser policy leaks,
activation requirements, permissions, renderer resource loss, and unsupported
features become rows and diagnostics instead of exceptions or handles crossing
into app logic.

Debug and fuzz state becomes serializable. Pick fuzz mismatches, stale
relation refs, renderer capability fallbacks, texture paging diagnostics,
pointer drops, and benchmark snapshots can be recorded and replayed without
replaying browser handles or GPU resources.

## Migration Plan

1. Keep `packages/tarstate/src/royal-prototype.ts` as a temporary
   compatibility shim while imports move to `@royal/tarstate-lens`.
   Decomplection check: do not widen the Tarstate core API while extracting
   Royal-specific behavior.

2. Maintain `packages/royal-tarstate-lens` as the docs-backed package slice
   that owns the Royal schema, queries, probe types, snapshot helpers, and
   writer routes from `royal-prototype.ts`. Decomplection check: the package
   depends on `@patchpit/tarstate` only, with no React, DOM, WebGL, or app
   imports.

3. Move the duplicate chargrid lens shape toward the package. Keep
   chargrid-specific `LayoutBox`, `PickTarget`, and Yoga conversion code in the
   chargrid app until those types graduate. The package should accept plain
   Royal lens input rows; chargrid owns conversion from its local primitives.
   Decomplection check: app adapters convert local state to row inputs, while
   the package owns relation names, queries, and diagnostics.

4. Update tests to import the package instead of
   `packages/tarstate/src/royal-prototype.ts` and
   `apps/chargrid-lab/src/royalTarstateLens.ts`. Decomplection check:
   package-boundary tests should prove the new package does not depend on app
   packages, `react-regl-fiber`, or WebGL internals.

5. Delete the app-local duplicate lens only after the package tests and
   chargrid tests cover render rows, pick probe rows, stale references, writer
   routes, and capability rows. Decomplection check: deletion should reduce
   duplicate schema/query logic, not hide app-specific conversion.

6. Add optional `@royal/state` only when another adapter needs row contracts
   without Tarstate. Decomplection check: do not split just to make the package
   layout look complete.

7. Move Tarstate closer to renderer-adjacent workflows only after benchmark
   gates pass. Decomplection check: rows/probes can move closer to renderer
   boundaries; renderer hot state and GPU resources still do not move into
   Tarstate.

## Benchmark Gates Before Moving Closer To Core

The package can become the standard Royal state/probe layer only if these gates
stay green or gain explicit thresholds:

- `tests/package-boundaries.test.ts`: renderer-core remains below React,
  shader tooling, apps, and Tarstate lens packages.
- `tests/tarstate-royal-prototype.test.ts` or its package replacement:
  store lenses do not expose raw state, renderer handles, browser handles, or
  routes' private stores.
- `apps/chargrid-lab/src/royalTarstateLens.test.ts` or its package
  replacement: render rows, pick probe rows, row counts, and stale-reference
  diagnostics remain identical.
- `scripts/tarstate-royal-flow-bench.test.ts`: coalesced pointer windows,
  render projection, cross-store pick joins, and fast result-id capability joins
  remain viable. The current scoped slow join path is not a hot-path gate until
  the evaluator can optimize compound lookups.
- `scripts/tarstate-capability-bench.test.ts`: indexed projection and batched
  effect loops remain the default; scan joins, per-event snapshots, and
  per-intent queries remain regression examples, not accepted paths.
- `scripts/tarstate-evaluator-bench.test.ts`,
  `scripts/tarstate-write-bench.test.ts`, and
  `scripts/tarstate-memory-bench.test.ts`: indexed lookup, writes, and repeated
  evaluation do not regress enough to make Royal probes visibly hitch.
- `scripts/royal-chargrid-bench.test.ts`: layout p95 under the existing
  250 ms gate, render-row scene build p95 under 250 ms, picking p99 under
  250 ms, and no integer-cell violations.
- `apps/chargrid-lab/src/helmetPickFuzz.test.ts`: no false positives, false
  negatives, or mismatch points for the DamagedHelmet fitted-frame samples.
- `apps/chargrid-lab/src/gpuPickPrototype.test.ts`: the GPU ID/depth model
  continues to match the CPU picker before real WebGL readback is wired.
- `tests/render-webgl.test.ts`, `scripts/render-bench.spec.ts`, and
  `scripts/gltf-lifetime-bench.spec.ts`: renderer resource lifetime,
  first-draw behavior, and hardware-facing render metrics do not regress when
  probes are added.

Before using Tarstate for any frame-adjacent path, add a named benchmark with:

- snapshot cadence
- row count
- p50/p95/p99 evaluation time
- allocation or retained heap after warmup
- input latency if input is involved
- direct-selector or direct-service lower bound

## Non-Goals

- Tarstate-owned renderer state.
- Tarstate-owned app state.
- Tarstate-owned `RenderRoot`.
- Per-frame full row materialization as the renderer update path.
- Per-pointer-event Tarstate evaluation.
- Relation APIs in `<Canvas>`.
- React hooks as the base package API.
- WebGL/WebGPU handles, DOM nodes, browser handles, renderer roots, caches, or
  stores in Tarstate rows.
- GPU resources, culling workspaces, pick framebuffers, or draw commands in
  Tarstate.
- Making `renderer-core` depend on `@patchpit/tarstate`.
- Exporting the current Royal prototype from `@patchpit/tarstate`.
- A generic support-every-renderer or support-every-browser-capability state
  abstraction before the Royal row contracts are proven by tests and benches.
