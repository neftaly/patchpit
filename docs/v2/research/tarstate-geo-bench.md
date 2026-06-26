# Tarstate Geo Benchmark

This is evidence for Patchpit v2 geo-shaped rendering queries. It is not an API
proposal.

The benchmark lives in `scripts/tarstate-geo-bench.test.ts` and runs with:

```sh
pnpm bench:tarstate:geo
```

## What It Stresses

The fixture generates synthetic map-like data at 10k and 50k feature rows:

- durable features with `id`, `minX`, `minY`, `maxX`, `maxY`, `styleId`,
  `assetId`, `label`, and a coarse `viewportCell`
- style rows joined by `feature.styleId = style.id`
- ephemeral presence rows keyed by `featureId` and `peerId`
- a render-ready projection containing bbox, asset, label, style, and optional
  presence fields

The Tarstate query uses the current public algebra:

- `where(eq(feature.viewportCell, targetCell))` as a viewport-ish filter
- `join(from(style), eq(feature.styleId, style.id))`
- `leftJoin(from(presence), eq(feature.id, presence.featureId))`
- `project(...)` for render-ready rows

The benchmark also includes a hand-written lower bound that performs a real bbox
overlap filter and map-backed equality joins. That row is present to show the
shape of the desired workload, not to assert Tarstate should become hand code.

## Current Pressure

Tarstate can express equality filters and equality joins today. That is enough
for the coarse `viewportCell` version of the query, and the optional source
`lookup` hook can serve equality lookups without changing the production API.

That is not enough for real viewport selection. Bbox/range/spatial queries need
operators and source capabilities beyond equality lookup:

- bbox overlap cannot be expressed as `minX <= viewport.maxX` and similar range
  predicates yet
- equality lookup on `viewportCell` can reduce rows, but it is an app-owned
  approximation rather than a spatial query
- joins still evaluate through the current nested evaluator shape, so large
  right-side relations should stay small in this evidence benchmark

The likely API pressure is a future source capability for range or spatial
lookups, with query predicates that remain declarative and planner-readable.
Streaming or cooperative evaluation may also matter for UI hitches, but that can
come later. This benchmark should not add those APIs now.

## Reading Results

The console table reports median, p95, max, rows/ms, and heap-ish deltas for:

- hand bbox + map joins lower bound
- Tarstate scan source
- Tarstate source with the current equality lookup hook

Heap numbers are process-local deltas around each sample. They are useful for
relative pressure, not retained heap proof.
