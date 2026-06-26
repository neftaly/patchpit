# Automerge JS Benchmark Plan

This note sets direction for Automerge work in Patchpit v2. The next step is
measurement, not a rewrite.

## Direction

Benchmark current Automerge JS/WASM first, using Probability-shaped workload
fixtures before changing the document model or CRDT engine.

The first benchmark should answer:

- whether current Automerge cost is actually on the critical path
- which costs come from first load, WASM setup, document operations, sync, or
  materialization
- whether browser behavior, especially Safari, changes the tradeoff
- which workload shapes Patchpit should optimize for

A tiny workload-specific JS CRDT is a second-stage experiment only. It should be
used to test a narrow workload hypothesis after Automerge has a measured
baseline, not as a replacement plan.

Do not start a full Automerge rewrite yet.

## Workload Fixtures

Use Probability workload fixtures rather than synthetic-only documents:

- small workspace open with common metadata
- medium document with repeated local edits
- many small docs loaded through a shell-like index
- presence and ephemeral peer state alongside durable document state
- sync between two or more peers with realistic patch sizes
- materialization into render/query-ready rows

Fixtures should be stable enough to compare runs across engines and branches.

## Metrics

Record at least:

- first-load JS size, gzip size, and loaded module graph
- Automerge WASM bytes, fetch/load timing, parse time, and instantiate time
- first document open and decode time
- common document operations: create, update, delete, merge, save, and load
- materialization time into Patchpit-facing data structures
- sync encode/decode/apply time and message sizes
- heap growth, retained memory after GC, and allocation-heavy phases
- visible GC or long-task pressure in browser runs
- Safari behavior for WASM setup, storage/cache reuse, and main-thread stalls

Treat Node numbers as useful lower-friction evidence, but keep browser runs in
the decision path.

## Staged Artifacts

1. Add a small runnable benchmark harness around current Automerge JS/WASM and
   Probability fixtures.
2. Capture browser first-load and WASM setup costs separately from document
   operation costs.
3. Add sync and materialization cases once the single-document baseline is
   stable.
4. Compare Safari, Chromium, and Firefox for browser-visible costs.
5. Only then prototype a tiny workload-specific JS CRDT for the narrow fixture
   that still shows unacceptable Automerge pressure.

## Risks

- Synthetic documents can hide the real cost of materialization and shell
  indexes.
- A JS-only CRDT may look cheaper on one fixture while losing merge semantics,
  storage compactness, or sync behavior Patchpit needs later.
- WASM setup may dominate first load even when steady-state doc operations are
  acceptable.
- Safari can change the outcome enough that Chromium-only numbers should not
  drive the rewrite decision.

## Decomplection Notes

Keep benchmark ownership separate from product runtime code. Keep CRDT engine
choice separate from materialization policy, sync transport, and UI scheduling.
