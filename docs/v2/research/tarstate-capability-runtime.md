# Tarstate Capability Runtime Prototype

This note records the local Node prototype in `scripts/tarstate-capability-bench.test.ts`.

## Boundary Rule

App code sees only:

- opaque resource ids
- effect intents
- effect results
- runtime diagnostics
- tarstate relation rows

Raw `window`, `document`, `navigator`, store, renderer, and browser API handles are adapter-only. The adapter owns the opaque registry and translates app intents into effect result rows that can be projected back through tarstate.

## Prototype Shape

The benchmark simulates:

- fullscreen-like low-frequency effects through `effectIntents` and `effectResults`
- high-rate pointer input reduced into bounded `pointerWindows`
- renderer resource status as ephemeral tarstate rows
- cross-store joins between app objects, store visibility, and renderer resources
- an effect result loop where app code consumes serializable result rows instead of handles

Tarstate core is unchanged. The prototype uses existing object sources, indexed object sources, joins, and projections.

## Decomplection Moves To Preserve

- Coalesce high-rate browser input before it enters app-visible relations.
- Bound ephemeral event relations by count or time window.
- Materialize lookups for resource ids and foreign-key joins before repeated projection work.
- Keep opaque resource registry cost adapter-local; do not let registry maps become an app API.
- Treat diagnostics as rows, not exceptions that leak host object details.

## Benchmark Results

Command:

```bash
pnpm exec vitest run tests/tarstate-capability-boundary.test.ts scripts/tarstate-capability-bench.test.ts --reporter verbose
```

Measured locally on 2026-06-27. Rows/ms is based on output rows for projections/effects and input events for stream ingestion.

| Scenario | Size | Fast direct p50 | Slow/naive capability p50 | Optimized capability p50 | Optimized throughput |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cross-store renderer projection | 500 objects | 0.18 ms | 18.69 ms scan | 1.17 ms indexed | 341.49 rows/ms |
| Cross-store renderer projection | 2,000 objects | 0.32 ms | 392.09 ms scan | 4.92 ms indexed | 325.20 rows/ms |
| Cross-store renderer projection | 5,000 objects | 0.86 ms | 2,285.96 ms scan | 13.28 ms indexed | 301.14 rows/ms |
| High-rate pointer stream | 5,000 events | 0.06 ms | 200.85 ms full snapshot per 200 events | 0.03 ms bounded/coalesced | 183,958.79 events/ms |
| High-rate pointer stream | 20,000 events | 0.18 ms | 729.70 ms full snapshot per 200 events | 0.09 ms bounded/coalesced | 224,527.37 events/ms |
| High-rate pointer stream | 50,000 events | 0.20 ms | 1,940.78 ms full snapshot per 200 events | 0.11 ms bounded/coalesced | 471,004.94 events/ms |
| Fullscreen effect result loop | 41 intents | 0.01 ms | 4.38 ms per-intent query | 0.09 ms batched indexed query | 445.41 rows/ms |
| Fullscreen effect result loop | 166 intents | 0.01 ms | 132.83 ms per-intent query | 0.28 ms batched indexed query | 586.05 rows/ms |
| Fullscreen effect result loop | 416 intents | 0.03 ms | 1,976.57 ms per-intent query | 0.76 ms batched indexed query | 547.27 rows/ms |

## What Prevents Theoretical Minimum

The direct baseline is the theoretical lower bound for these synthetic cases: one Map build or direct loop, no boundary rows, no diagnostics, and no query planning/evaluation. The optimized capability path remains above that floor for concrete reasons:

- Projection allocation: tarstate returns new projected row objects instead of reusing selector output.
- Query evaluation: joins and projections still walk query nodes, even when indexed lookup avoids the scan blow-up.
- Validation and diagnostics: relation-shaped data makes invalid states visible, but the evaluator still checks and carries diagnostics.
- Event buffering: app-visible input must be coalesced into bounded rows, which adds a small adapter step before projection.
- Effect result bookkeeping: every imperative call becomes an intent/result row pair so the app can observe outcomes without receiving handles.
- Store snapshot boundaries: a capability adapter must publish serializable relation snapshots instead of handing app code mutable stores.

## Data-Backed Recommendations

- Keep indexed lookup/materialized maps mandatory for resource-id joins. At 5,000 objects, scan projection was 2,285.96 ms while indexed projection was 13.28 ms; this is the difference between unusable and viable.
- Never project high-rate events one-by-one from growing snapshots. A capped 200-event naive replay already reached 1,940.78 ms when the resource snapshot was large; bounded coalescing handled 50,000 events in 0.11 ms.
- Batch low-frequency effect result projection. For 416 fullscreen intents, per-intent querying took 1,976.57 ms; one batched indexed result query took 0.76 ms.
- Keep capability registries adapter-local and expose only stable resource rows. Registry lookup cost was not the limiting factor in the optimized paths; query shape and snapshot cadence dominated.
- Use tarstate projection for app-visible joins where consistency and boundary hygiene matter, but keep hot inner loops in adapters as coalescing/materialization passes before relation publication.

## Viability

The non-leaky capability runtime is viable for a prototype app if the optimized path is the default policy: coalesced streams, bounded ephemeral relations, indexed joins, and batched effect result projection. The naive baselines are not viable and should be treated as regression tests for accidental app-boundary leaks through full snapshots, unbounded event rows, or per-event query evaluation.
