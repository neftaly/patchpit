# Royal Launch List And Monorepo Name

This note is the tidy handoff list for cutting a shipping Royal/Tarstate
monorepo out of patchpit. It assumes patchpit remains the lab, history, and
research repo, while the new repo carries packages, examples, docs, benchmarks,
and acceptance tests that are meant to ship.

## Recommendation

Name the shipping monorepo `royal`.

Use `royal` unless there is a concrete collision in the host, registry,
organization naming, or product naming. It is short, stable, readable in local
paths, and does not overfit React, WebGL, WebGPU, workers, or any single
renderer backend. It also matches the intended public package scope:
`@royal/*`.

Tarstate can still live in the same shipping repo as `@tarstate/core` and
`@royal/tarstate-lens`. A repo named `royal` does not have to mean every package
is in the Royal scope; it means Royal is the product stack that currently owns
the extracted distribution.

If a more distinctive repository name is required, use `royal-foundry`. It
still reads as a shipping/build repo, not a prototype repo. Use
`royal-society` only if the public tone can be playful. Avoid `royal-labs` for
the first shipping repo because "labs" blurs the boundary with patchpit.

## Name Candidates

| Candidate | Verdict | Rationale |
| --- | --- | --- |
| `royal` | Recommended | Short, direct, package-scope aligned, backend-neutral, framework-neutral, and easy to explain. Best default for a shipping monorepo. |
| `royal-foundry` | Best fallback | Suggests production and artifact creation without implying experiments. Distinctive enough if `royal` is unavailable. |
| `royal-stack` | Acceptable | Signals that Royal plus Tarstate are shipped together. Slightly broad and infra-flavored, but not tied to React or WebGL. |
| `royal-system` | Acceptable but bland | Covers renderer, state, examples, and workers. Clear enough, but less memorable than `royal` or `royal-foundry`. |
| `royal-society` | Playful option only | Memorable and coherent if the brand wants whimsy. Risk: sounds like a community, nonprofit, or joke repo rather than a package monorepo. |
| `royal-labs` | Weak for shipping | Good name for experiments, but patchpit is already the lab/history/research place. It undercuts the "shipping repo" distinction. |
| `royal-tarstate` | Too literal | Accurately names the merge, but locks the repo to today's package pairing and makes future renderer-only or backend work feel secondary. |
| `tarstate-royal` | Not recommended | Leads with the generic state engine and reads awkwardly for a renderer/product repo. Better to keep Tarstate visible through package names. |

## Launch List

### Must-Have Packages

Move only packages that have a clear shipping contract or a direct role in
proving that contract.

| Package | Public name | Launch role |
| --- | --- | --- |
| `packages/tarstate-core` | `@tarstate/core` | Generic schema, relation source, query, evaluation, write, diagnostics, and benchmarkable query engine. |
| `packages/renderer-core` | `@royal/renderer-core` | Dependency-light scene data, transforms, cameras, passes, materials, text contracts, and authoring helpers. |
| `packages/react-royal-fiber` | `@royal/react` | Canonical React adapter, JSX runtime, `<Canvas>`, hooks, and current imperative root facade. |
| `packages/react-royal-fiber-compat` | `react-royal-fiber` | Alias package that re-exports `@royal/react` for searchability and migration. No implementation policy. |
| `packages/react-regl-fiber-compat` | `react-regl-fiber` | Temporary deprecated bridge for patchpit and prototype consumers. Remove after migration. |
| `packages/royal-tarstate-lens` | `@royal/tarstate-lens` | Royal row schema, store lenses, query projections, diagnostics, writer routes, and scene-source adapters over Tarstate. |

Defer these until their contracts are proven:

| Deferred package | Public name | Gate |
| --- | --- | --- |
| `packages/vanilla` | `@royal/vanilla` | Stable framework-free root, scene source, scheduler, input dispatch, and headless or OffscreenCanvas story. |
| `packages/solid-royal` | `@royal/solid` | Solid fixture proves lifecycle, signals/resources, and TypeScript setup. Do not promise a JSX runtime before compiler proof. |
| `packages/backend-webgl` or `packages/webgl` | `@royal/backend-webgl` or `@royal/webgl` | Root/backend contract is measured and can leave `@royal/react` without churn. |
| `packages/royal-state` | `@royal/state` | More than one adapter needs stable row/command/diagnostic contracts without depending on Tarstate. |

### Examples

Ship examples as fixtures first, showcases second.

- React primitive scene: first nonblank frame, resize, unmount, and no ReactDOM
  dependency for the imperative root path.
- React glTF helmet scene: repeated instances, delayed asset readiness,
  unmount-before-ready disposal, and texture readiness diagnostics.
- Tarstate scene source example: Tarstate rows project into a Royal scene source
  without renderer-core importing Tarstate.
- Capability matrix example: WebGL1/WebGL2 feature rows, extension gates, timer
  query availability, and fallback reasons.
- Text/layout example: fixed grid labels plus shaped-run or simulated shaped-run
  proof. Keep it honest if real font shaping is not in the launch.
- Picking example: CPU oracle plus GPU ID/depth readback when the backend proof
  is ready.
- Worker/SAB example only if isolation headers, fallback behavior, and benchmark
  gates are part of the same launch. Otherwise keep it in patchpit.

### CI

Minimum launch CI should run on every pull request:

- install with a frozen lockfile
- TypeScript build for all packages
- package unit tests
- package boundary tests
- example builds
- generated API/docs check, if docs are generated
- lint or format check if the repo has an established formatter
- browser smoke tests for the examples that claim browser behavior
- artifact size check for adapter packages once public bundles exist

CI should not require a hardware GPU for ordinary correctness. Hardware GPU
runs should be a separate optional job or scheduled job with explicit labels.

### Docs

The shipping repo should contain settled docs, not patchpit research logs.

- package READMEs with install, imports, examples, and stability notes
- `docs/decisions/*` for short decisions on package names, backend boundary,
  layout/text policy, Tarstate ownership, and compatibility aliases
- generated API docs, if the public TypeScript surface is large enough to need
  them
- migration guide from `react-regl-fiber` and `@patchpit/tarstate`
- capability matrix docs for browser and backend features
- asset and license docs for examples, fonts, glTF fixtures, and screenshots

### Benches

Benchmarks must have named fixtures, stable metrics, and a promotion threshold.

- renderer primitive baseline: first frame, p95 frame time, draw count,
  allocations, disposal
- `card-stress-textures`: 500 to 5k cards, upload count, readiness, draw lanes,
  warm allocations
- `helmet-gltf-readiness`: source fetch/decode, texture readiness, first/all
  ready, repeated instances, disposal
- `frustum-10k-boxes`: planner time, visible count, draw count, allocations
- `gpu-pick-helmet-fuzz`: mismatch count against CPU oracle and p95 readback
  latency
- Tarstate query/lens perf: relation count, row count, query compile/evaluate
  time, incremental update time, allocation pressure, diagnostics emitted
- text shaping/layout perf: 1k, 10k, and 50k short labels, outline/cache hit
  rates, overflow diagnostics, and stable grid anchoring

### Capability Tests

Capability tests should publish facts as rows or structured results, not hidden
globals.

- WebGL1 and WebGL2 context creation
- instancing, VAO, draw buffers, depth textures, compressed texture formats,
  timer queries, and readPixels behavior
- color/depth ID picking conventions
- canvas resize and device pixel ratio behavior
- context loss and recovery smoke
- browser feature matrix for OffscreenCanvas, SharedArrayBuffer,
  cross-origin isolation, Web Workers, WebGPU availability, and WebXR
- graceful fallback path when a feature is unavailable

### Text Rendering

Launch should decide what text means at the public API boundary before moving
code.

- Keep raw strings as authoring input only if they lower into explicit text
  runs before backend rendering.
- Define shaped text rows or nodes with glyph IDs, clusters, advances, offsets,
  feature flags, and diagnostics.
- Keep shaping separate from framework adapters.
- Keep grid anchoring separate from glyph positioning. Grid/cell layout owns
  boxes; font layout owns glyph positions inside boxes.
- Decide launch text lane honestly: current vector rectangles, SDF/MSDF atlas,
  curve/vector tessellation, or simulated shaped-run proof only.
- Record missing glyph, fallback, overflow, outline miss, atlas miss, and
  unsupported feature diagnostics as row-shaped data.

### Layout And Yoga Decision

Do not let layout become an implicit renderer side effect.

- Use the tiny TypeScript flex subset only for deterministic API pressure tests:
  row/column, wrap/nowrap, gap, grow/shrink/basis, fixed measured sizes, and
  start/stretch alignment.
- Use WASM Yoga when production examples need min/max sizes, percentages,
  absolute positioning, aspect ratios, baseline alignment, custom measure
  functions, or text measurement inside layout.
- Keep layout service output as explicit layout boxes or rows.
- Keep renderer-core free of Yoga runtime dependency unless a decision record
  says the dependency is part of the public contract.
- Add a Yoga parity fixture for the subset if the TypeScript path ships.

### Tarstate Lens And Query Perf

Tarstate must launch with enough evidence that it can serve probes and
diagnostics without becoming the render hot path.

- Define the generic `@tarstate/core` boundary before the split.
- Define the Royal-specific `@royal/tarstate-lens` row schema, query names,
  snapshot helpers, writer routes, and diagnostics.
- Measure full snapshot, incremental update, compiled query, and lens projection
  paths.
- Track allocation pressure and row materialization cost.
- Keep renderer handles, DOM nodes, GPU resources, raw stores, and framework
  state out of Tarstate rows.
- Decide whether a temporary compatibility shim remains in patchpit or in the
  shipping repo, and set a removal condition.

### Fuzzing And Picking

Picking should be a service boundary with deterministic truth tests.

- Keep CPU picking as the oracle for early tests.
- Add fuzz cases for bounds, overlapping targets, disabled targets, z/depth
  ordering, offscreen samples, high-DPI scaling, and stale target ids.
- Add GPU ID/depth readback only behind a capability gate.
- Publish pick probes as rows: sample id, pointer position, expected id, actual
  id, depth, owner/pass id, mismatch class, and readback latency.
- Keep pointer streams bounded or coalesced. Do not store unbounded raw pointer
  history in Tarstate.

### Browser Capability Lab

Keep the lab small enough to run and honest enough to trust.

- one browser page for capability matrix inspection
- one automated smoke that records structured results
- explicit browser/version output
- no assumptions that WebGPU, WebXR, OffscreenCanvas, or SharedArrayBuffer are
  always present
- isolated hardware GPU jobs for checks that need real GPU timing or screenshots

### Worker And SAB Experiments

Worker and SharedArrayBuffer work should not be mixed into the first stable root
unless the isolation and fallback story is complete.

- Keep SAB row-surface and worker roots in patchpit until the message protocol,
  lifecycle, and fallback behavior are stable.
- If promoted, document COOP/COEP requirements, cross-origin isolation checks,
  transfer ownership, frame ids, queue limits, dropped update counters, and
  context loss behavior.
- Keep worker protocol types separate from renderer-core scene data.
- Do not make SAB a required dependency for the ordinary browser examples.

### Licensing And Assets

The shipping repo needs a boring asset policy before it carries fixtures.

- root license for code
- package-level license metadata
- third-party notices for fonts, glTF assets, images, screenshots, and WASM
  assets
- provenance for DamagedHelmet and any derived screenshots
- explicit policy for generated assets and benchmark fixtures
- no hidden CDN/runtime fetches in examples or tests unless documented and
  optional
- checked-in fixture size budget and large-file policy

## What Moves

Move code and docs that represent settled public contracts:

- `@tarstate/core` implementation and tests once the generic boundary is named
- `@royal/renderer-core` implementation and tests
- `@royal/react` adapter, JSX runtime, root facade, and examples
- compatibility alias packages with explicit deprecation notes
- `@royal/tarstate-lens` implementation and tests
- small fixture assets with clean licensing
- package READMEs, migration docs, API docs, and short decision records
- benchmark harnesses that have named fixtures and stable metrics
- browser capability tests that gate public behavior

## What Stays In Patchpit

Patchpit should remain the place for research, prototypes, and archaeology:

- prototype apps such as chargrid-lab and capability labs until promoted
- migration narratives and research notes
- renderer wishlist and prioritization drafts
- dependency research that has not become an implementation slice
- fuzz notebooks, one-off repro scripts, and exploratory benches
- worker/SAB experiments until root protocol and fallback behavior are stable
- tarstate/Royal experiments that still change row names or ownership rules
- old compatibility shims needed only for local patchpit history
- large or unclear-license assets

Patchpit should consume the shipping repo packages by public names after the
split. It should not keep using workspace-only private paths as if they were the
public API.

## Stable API Decisions Needed Before Split

Make these decisions before cutting the shipping repo, even if some
implementations stay simple.

- Monorepo name: default to `royal`; fallback to `royal-foundry` if needed.
- Package scopes and public names: `@royal/*`, `@tarstate/core`, and which
  compatibility aliases exist.
- Export maps for each package, including `root`, `jsx-runtime`,
  `jsx-dev-runtime`, and any `testing` subpath.
- Whether `@royal/react/root` can avoid importing React and ReactDOM.
- Whether `createRoot` lives temporarily in `@royal/react` or starts in
  `@royal/vanilla`.
- The renderer backend split point and whether WebGL stays inside
  `@royal/react` for launch.
- Scene source contract: snapshots, subscriptions, patch lanes, scheduler
  behavior, and disposal.
- Capability row schema and feature-gate vocabulary.
- Tarstate row schema, query names, writer routes, diagnostics, and compatibility
  shim policy.
- Text contract: raw strings, shaped runs, vector text, atlas text, diagnostics,
  and fallback behavior.
- Layout contract: TypeScript subset, Yoga dependency, or explicit deferred
  status.
- Picking contract: CPU oracle, GPU ID/depth availability, probe rows, and fuzz
  thresholds.
- Asset identity: source bytes, decoded assets, recipes, GPU resources,
  readiness, and disposal.
- Worker/SAB status: out of launch, optional experiment, or stable package
  contract.
- Versioning and deprecation policy for `react-regl-fiber` and other bridges.

## Decomplection Checklist

Run this checklist during extraction and again before launch.

- Package ownership is explicit: core data, framework adapters, backend effects,
  state projection, examples, and benches live in separate places.
- Alias packages contain re-exports and deprecation metadata only.
- Renderer-core has no React, Solid, DOM, WebGL, WebGPU, worker, or Tarstate
  runtime dependency.
- Tarstate core has no Royal, renderer, browser, or framework dependency.
- Royal Tarstate lens has no React, Solid, DOM, WebGL, backend resource, or app
  package dependency.
- Framework adapters subscribe to scene sources and hand snapshots or patches to
  roots; they do not own query engines or GPU resources.
- Backend code owns GPU resources, context loss, frame scheduling, and readback
  queues; it does not own app state.
- Text shaping, layout, picking, visibility, and asset readiness are separate
  services or rows, not implicit side effects of rendering.
- Benchmarks use named fixtures and stable metrics rather than ad hoc scripts.
- Browser capability checks are structured data and can be consumed by docs,
  examples, tests, and Tarstate probes.
- Worker/SAB code has a fallback and isolation story before it becomes public.
- Shipping docs describe settled contracts. Research notes stay in patchpit.
- Every promoted prototype has a removal plan for old patchpit shims and import
  paths.
