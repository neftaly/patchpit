# Tarstate Royal Store Lens Prototype

This prototype treats Tarstate as a relational lens over app-owned stores, not as
the app's primary state container.

The concrete code lives in:

- `packages/tarstate/src/royal-prototype.ts`
- `tests/tarstate-royal-prototype.test.ts`
- `scripts/tarstate-royal-flow-bench.test.ts`

The prototype is intentionally export-free from `packages/tarstate/src/index.ts`
so Tarstate core can stay flexible while the recommended app pattern hardens.

## Layers

### Unopinionated Core And Lens Primitives

Core Tarstate should stay small:

- typed relations and fields
- relation sources
- inspectable query data
- one-shot evaluation
- optional write patches
- diagnostics

The lens prototype adds only adapter primitives:

- `ReadableStore<State>`: `getState()` plus optional `subscribe()`
- `WritableStore<State>`: `setState()` for middleware-style write routing
- `StoreLens<State, Row>`: maps one store state to rows for one relation
- `createStoreLensSnapshot(lenses)`: reads each store once, exposes a
  `RelationSource` plus `LensProbe`
- `createStorePatchDispatcher(routes)`: optional route from Tarstate write
  patches back into app-owned store middleware

This is compatible with TanStack Store/Zustand-like APIs because the adapter
depends only on `getState`, optional `subscribe`, and immutable `setState`
semantics. It does not require React, a global tree, or Tarstate-owned storage.

API rule: app logic should not receive raw state trees by default. It receives
relations, query results, probes, effect intents/results, and diagnostics. Raw
state remains inside adapters, interpreters, and tests.

Writer rule: Tarstate write patches are transport commands, not canonical
Tarstate-owned state. A writer route exposes only a relation and an `apply`
function. The route captures a private store and translates relation-shaped
patches into store-native mutations. If no route exists, the dispatcher reports
an `unsupported_lookup` diagnostic and leaves stores untouched.

### Recommended React/Store Pattern

For React apps, use a semi-opinionated boundary:

```ts
const boundary = createRoyalAppBoundary({
  capabilityStore,
  documentStore,
  layoutStore,
  interactionStore,
})

const renderRows = await boundary.query(royalQueries.renderRows)
const probe = boundary.probe()
```

Recommended app file split for `apps/tarstate-capability-lab`:

- `schema.ts`: app relations, queries, row types, effect intent/result rows
- `store.ts`: TanStack/Zustand-like stores and immutable update helpers
- `runtime.ts`: capability interpreters that may touch browser/store/renderer
  handles
- `demoData.ts`: Royal layout, pointer, effect, and diagnostic fixtures
- `App.tsx`: React selects query/probe results, not raw stores

React hooks can wrap this shape later:

```ts
const rows = useSelector(appStore, () => boundary.query(renderRowsQuery))
```

The important part is ownership: React state libraries own mutation and
subscription; Tarstate owns cross-store relational views, diagnostics, probes,
and invariant checks.

### Writer Organization

Use Tarstate writers when the caller wants to express a mutation at a
relational boundary:

- effect result rows flowing back from a capability interpreter
- cross-store command surfaces where a relation name is the stable API
- test fixtures, replay logs, and distributed patches that should not know the
  private store tree
- diagnostics for patches that cannot be routed safely

Use store-native mutation when the update is local and already belongs to one
store:

- high-rate pointer/keyboard streams before coalescing
- renderer lifetime and resource handle updates
- local UI toggles with no cross-store invariant
- frame-critical layout/runtime data where selectors are already clear

Organize multiple state trees by ownership, not by Tarstate relation:

- document store: editable spec/tree and durable asset references
- layout store: derived boxes, pick targets, layout grid, and render geometry
- interaction store: active/focus/hover, coalesced pointer windows, transient
  interaction diagnostics
- capability store: effect intents/results and capability diagnostics

Routes may target any of those stores, but they should stay adapter-only. For
example, an `effectResults` route accepts a relation row with `scopeId` and
stores a private `EffectResultInput` without `scopeId`; the lens re-attaches the
scope when publishing rows. That makes the relation API stable without turning
Tarstate into the backing data model.

### Capability Boundary Contract

The prototype codifies a strict boundary:

- app code must not import or use `window`, `document`, `navigator`, DOM nodes,
  raw store state, renderer roots, or browser resource handles
- adapters/interpreters may use those handles
- app code emits effect intents and reads effect results/diagnostic rows
- unavoidable leaks are encoded as rows, not thrown through app logic

Typed leak/result codes:

- `activation_required`
- `permission_denied`
- `stale_snapshot`
- `resource_lost`
- `backpressure_dropped`
- `unsupported`
- `policy_denied`
- `partial_failure`

Example:

```ts
effectIntents: request_fullscreen(canvas:main)
effectResults: failed(result-fullscreen)
capabilityDiagnostics: activation_required(result-fullscreen)
```

This keeps the functional/capability-OS style non-leaky at the app boundary
without pretending browsers never leak policy state.

## Royal Data Shape

The prototype models Royal-style state as multiple stores:

- document store: layout spec/tree and asset refs
- layout store: grid, layout boxes, pick targets
- interaction store: active/focus/hover, pointer samples, asset failures
- capability store: effect intents/results and capability diagnostics

Rows include:

- `layoutNodes`
- `layoutBoxes`
- `pickTargets`
- `renderFlags`
- `activationStates`
- `pointerSamples`
- `assets`
- `assetDiagnostics`
- `effectIntents`
- `effectResults`
- `capabilityDiagnostics`

Queries include:

- `renderRows`: layout boxes plus active/focus/hover flags
- `pickProbeRows`: pointer samples plus pick target metadata
- `capabilityResultRows`: effect results plus capability diagnostics
- `scopedCapabilityResultRows`: correctness-oriented scoped variant

The current evaluator only uses lookup joins for simple equality joins. That
makes `capabilityResultRows` the fast path when `resultId` is globally stable.
`scopedCapabilityResultRows` uses `(scopeId, resultId)` and is much slower today.

## Shape Data For Distribution

Use stable IDs from containment/path/object identity instead of UUID spam:

- prefer real object IDs where available, such as Automerge object IDs
- use semantic app IDs for stable controls and resources
- fall back to containment paths for local repeated nodes
- include `scopeId` for relation keys, but use globally stable event/result IDs
  for hot joins when possible
- keep foreign keys between stores explicit
- keep duplicated data minimal; put derived/indexed data in lens output

For repeated local nodes:

```ts
doc-a/root/children/1
doc-a/root/children/2
```

For distributed object-backed nodes:

```ts
automerge:node-a
```

Do not join effect diagnostics by low-cardinality resource handles when a result
ID exists. The benchmark found that joining by `resourceId` created accidental
fan-out. Diagnostics should point to `resultId` or `intentId` first, then carry
`resourceId` as context.

Avoid row field names that collide with Tarstate alias metadata. In the current
DSL, `relation` is reserved by `as(relation, alias)`, so diagnostic rows use
`relationName`.

## Why Tarstate Over Selectors Only

Selectors are still the fast local path. Tarstate adds value when selectors
become cross-cutting policy:

- cross-store joins without one forced global tree
- typed foreign keys and stale-reference diagnostics
- relation-level probes and fuzz snapshots
- effect intent/result loops as data
- derived relational invariants independent of React render timing
- distribution-friendly data shape
- benchmarks that expose when a query is too abstract or under-indexed

The recommended rule is not "replace selectors." Use direct selectors for local
single-store hot paths. Use Tarstate for boundaries where data crosses stores,
capabilities, peers, derived state, or diagnostics.

## Benchmark Results

Command:

```sh
pnpm exec vitest run scripts/tarstate-royal-flow-bench.test.ts --reporter verbose
```

Observed on this workspace:

| Scenario | Direct median | Tarstate median | Notes |
| --- | ---: | ---: | --- |
| fullscreen-ish low frequency effect result | 0.00 ms | 0.22 ms | viable for low-frequency capability results |
| pointer high-rate event coalescing | 0.01 ms | 0.83 ms | viable only after coalescing 10k events to 96 rows |
| Royal render state projection | 0.01 ms | 0.24 ms | viable for small render-state view |
| cross-store pointer target join | 0.01 ms | 0.54 ms | acceptable for probe windows, not raw pointer streams |
| effect result loop fast resultId join | 0.12 ms | 3.45 ms | viable for diagnostics panels and post-frame loops |
| effect result loop scoped slow join | 0.05 ms | 24.00 ms | too slow as a hot path with current evaluator |

The fast/slow split is the key decision. Tarstate is viable for Royal-style app
architecture if high-rate inputs are windowed/coalesced and hot joins use stable
lookup-friendly IDs. It is too abstract if every pointer sample or render handle
becomes a raw relation row evaluated every frame.

## Perf Guidance

- Coalesce high-rate streams before lensing them.
- Expose summaries/windows, not unbounded event logs.
- Keep browser, renderer, and store handles private to interpreters.
- Prefer globally stable result/intent IDs for hot effect joins.
- Use scoped composite joins for correctness checks, not hot paths until the
  evaluator supports composite lookup planning.
- Materialize/index only after benchmark evidence.
- Keep direct selectors for local single-store state.
- Query Tarstate for cross-store joins, diagnostics, probes, and invariants.

## Writer Benchmark Gates

Keep the writer route abstraction only if focused benchmarks keep showing these
properties:

- dispatch overhead stays negligible for low-frequency effect/capability loops
- routed writer patches do not appear in frame-critical render or pointer hot
  paths
- rejected or unroutable patches produce diagnostics without store mutation
- route translation remains cheaper and clearer than exposing raw store state to
  callers
- cross-store queries remain the main Tarstate value; local store updates remain
  store-native

If writer dispatch starts carrying per-frame input streams or renderer resource
lifetimes, remove that route and use store-native mutation plus a coalesced lens.
If a route needs many relation-specific indexes to stay fast, materialize the
store-native projection first and expose that through a read lens.

## App Worker Guidance

For the capability lab workers:

- Ramanujan runtime/store/schema should keep raw stores and handles behind
  `createRoyalAppBoundary`-style adapters.
- Parfit UI should render query/probe/effect result rows, not call raw stores or
  browser APIs.
- Epicurus shell wiring should expose app resources as opaque IDs and pass
  capability interpreters into runtime setup, not through component props.

If the app prototype chooses different names, keep the contract:

```txt
raw handles -> adapter/interpreter only
app logic -> rows, probes, intents, results, diagnostics
React -> query/probe consumption
stores -> mutation/subscription
Tarstate -> relational lens and invariant surface
```

## Current Recommendation

Proceed with a semi-opinionated React/store integration, not a Tarstate-owned
state runtime.

The viable architecture is:

1. Stores remain app-owned and can be TanStack Store, Zustand, or a tiny custom
   immutable store.
2. Tarstate lenses publish relation snapshots across those stores.
3. App code consumes the lens boundary, not raw store trees or browser handles.
4. Capability interpreters translate effect intents into browser/renderer/store
   operations and report effect results/diagnostics as rows.
5. Hot paths stay direct or coalesced until benchmarks justify materialization.

This is concrete enough to build: it simplifies Royal's imperative data flow at
the boundaries while preserving fast direct paths inside local store/runtime
mechanics.
