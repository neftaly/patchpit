# Tarstate UX Benchmark Notes

Benchmark branch: `codex/tarstate-ux-bench`.

The benchmark is intentionally UX-shaped:

- first-load JS size for the runnable Tarstate example
- single-query latency as likely main-thread hitch size
- rough heap delta during evaluation
- scan source vs indexed source behavior

Run:

```sh
pnpm build
pnpm bench:tarstate
pnpm bench:tarstate:memory
```

## Current Branch Run

Run on the merged Patchpit/Royal monorepo branch
`codex/tarstate-perf-api-pressure`.

```sh
pnpm bench:tarstate
pnpm bench:tarstate:memory
```

Latest local run:

| check | result |
| --- | ---: |
| Tarstate example JS | `193.69 KB` |
| Tarstate example gzip JS | `60.36 KB` |
| 5k hand join median | `0.62 ms` |
| 5k scan join median | `1354.73 ms` |
| 5k indexed join median | `12.58 ms` |
| 100x 5k hand retained heap | `29.78 MB` |
| 100x 5k indexed retained heap | noisy; latest `26.55 MB` |

The branch lands production lookup-planned joins and lazy object-source indexes,
but not the prototype trusted evaluator.

## First Load

The Tarstate example app built to about `194 KB` JS, `60 KB` gzip.

This is mostly React/Vite/example overhead, not a Tarstate-specific warning yet.
Keep watching it once Tarstate adapters and hooks grow.

## Baseline Finding

Before the benchmark branch optimization, `leftJoin` evaluated both sides fully and nested
every left row against every right row.

Baseline result for `5,000` todos joined to `5,000` assignments:

| source | median |
| --- | ---: |
| scan | `14,265 ms` |
| indexed | `14,193 ms` |

The indexed source did not help because joins never used lookup. The helper also
filtered rows per lookup instead of building an index.

## Branch Optimization

This branch tries the smallest decomplection that matches the pressure:

- `fromIndexedObjectSource` builds lazy per-field lookup indexes
- `evaluateJoin` plans simple equality joins as per-left-row lookups when the
  right side is a plain `from(...)`
- unsupported sources fall back to the existing nested join

Post-change result for `5,000` todos joined to `5,000` assignments with the
production evaluator and diagnostics enabled:

| source | median | max |
| --- | ---: | ---: |
| scan | `1355 ms` | `1432 ms` |
| indexed | `12.58 ms` | `13.04 ms` |

A prototype trusted hot path from the earlier branch, where row validation and
diagnostics are out of band, got much closer to the hand-written lower bound:

| source | 5k median | heap delta |
| --- | ---: | ---: |
| hand lower bound | `1-2 ms` | about `1 MB` |
| trusted indexed | `3-4 ms` | about `3-4 MB` |

That prototype remains evidence only. It is not exported and is not part of the
reviewable production API. The remaining production gap is generic plan,
projection, validation, and allocation machinery.

## Memory And GC

A repeated indexed join benchmark ran `100` evaluations of `5,000` joined rows.
Numbers vary under concurrent machine load; treat the variation as signal that
allocation and scheduler pressure matter.

| source | median | p95 | retained heap after forced GC |
| --- | ---: | ---: | ---: |
| hand lower bound | `0.91 ms` | `3.29 ms` | `29.78 MB` |
| diagnostic indexed | `40.42 ms` | `56.01 ms` | noisy; latest `26.55 MB` |
| trusted indexed prototype | `3-4 ms` | `7-8 ms` | not in this branch |

The trusted path is not a final API recommendation. It is a benchmark scaffold
showing that the query model can get closer to a hand loop once validation,
duplicate-key diagnostics, generic context rows, async lookup boundaries, and
projection interpretation are separated from the hot path.

Treat this as a pressure signal, not a final GC profile. Node/V8 retained heap is
not the same thing as browser frame-time GC behavior, and the current evaluator
still allocates heavily per run.

For a game engine, this still needs a Chrome trace or engine-host benchmark that
tracks frame budget, minor/major GC pauses, and retained objects while queries
run near the render loop.

## Async And Yielding

`evaluate(...)` is async by API, but it is not cooperative. It awaits source
reads, then CPU-heavy query work runs synchronously until the evaluation
finishes.

Microtask chunking is not the right UX primitive. Microtasks run before paint and
can still starve a frame. If Tarstate needs to evaluate on the main thread near a
game loop, yielding should use host/frame boundaries such as `scheduler.postTask`,
`requestAnimationFrame`, `MessageChannel`, `setTimeout(0)`, or a worker.

That should live in the core evaluator runtime, probably as an evaluation option
or separate cooperative evaluator:

```ts
evaluate(source, query, { scheduler, budgetMs })
```

Do not put scheduler policy in query data, source adapters, or React hooks.
Queries should describe what to derive; the evaluator/runtime should decide how
to spend frame budget.

## Guidance

## API Pressure

The benchmark justifies these API/ownership seams:

- source adapters should be able to declare relation ownership and lookup
  capability
- evaluator planning should consume source capabilities, not require callers or
  React hooks to choose scan/index paths
- evaluate diagnostics should mean query-touched/source-level diagnostics:
  source read errors, lookup errors, and invalid rows encountered while answering
  the query
- full-source validation should be a separate offline/background concern, not
  hidden work inside latency-sensitive `evaluate`
- a future trusted/hot evaluator should be a separate evaluator mode or package,
  not a flag that silently weakens `evaluate`
- cooperative scheduling belongs in evaluator runtime options, not in query data
  or source adapters
- schema/query data should stay canonical and serializable so plans can be
  cached, explained, and eventually moved to workers

Do not ship UX-sensitive joins on scan-only sources.

The API shape can stay, but source adapters need explicit lookup/index
capabilities. The evaluator should keep planning against those capabilities
instead of making React hooks or callers own the optimization.

For game-engine use, decomplect evaluation policy:

- diagnostic evaluator: validates rows, records duplicate/invalid data, explains
  bad sources
- trusted evaluator: assumes normalized source data, minimizes allocations, and
  keeps diagnostics out of the frame loop
- offline/background diagnostics: validates complete sources outside the hot path

Also design for fewer allocations:

- reuse compiled query plans
- avoid rebuilding alias/null maps per row
- project into stable row containers where possible
- separate full diagnostics scans from latency-sensitive query evaluation
- prefer worker/off-thread evaluation for large updates

Lookup-planned joins only validate right rows they touch. That is intentional:
`evaluate` diagnostics are query-touched/source-level diagnostics, not a promise
to validate every row in every source. Full-source validation should run as a
separate offline/background pass when the app needs complete source health.
