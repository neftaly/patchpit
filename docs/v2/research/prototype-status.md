# Prototype Status And Decision Map

Snapshot: current workspace after the Tarstate, Royal/chargrid, capability lab,
rendering, GPU/SAB, and web-platform capability research pass.

This is an index and decision map. It does not replace the deeper notes in this
directory or `docs/royal/`.

## Current Decisions Vs Speculative Research

| Area | Current decision | Still speculative |
| --- | --- | --- |
| Tarstate core | Keep core as typed object relations, sources, query evaluation, write patches, and diagnostics. Tarstate is a relational lens over app-owned stores, not the app's primary state container. | Lower-allocation evaluator, query planner, columnar source ABI, WASM/SIMD backend, GPU backend. |
| Royal integration | Use row lenses and probes for layout boxes, pick targets, render flags, pointer samples, assets, effect rows, and diagnostics. Raw stores, DOM, browser, and renderer handles remain adapter-only. | Stable renderer probe package, worker row lenses, transform slots, GPU ID/depth pick rows, visibility service. |
| Chargrid Royal lab | Treat the lab as the strongest current Royal workload: Yoga layout, fitted glTF previews, text, checker tiles, CPU picking, Tarstate render/pick rows, and deterministic pick fuzz. | GPU ID/depth picking, reusable fuzz report schema, SAB pointer ring, renderer probe rows. |
| Capability lab | App code sees opaque resource ids, effect intents/results, event rows, fullscreen rows, and diagnostics. Runtime owns browser/simulated handles. High-rate input is coalesced before publication. | Browser policy matrix, iframe/header fixture server, clipboard/popup/pointer-lock/file-picker rows, storage/network/worker browser smokes. |
| Rendering research | `renderer-core` stays pure scene/authoring data. Advanced renderer features need benchmark gates and probe rows before implementation. WebGL1 cheap forward path remains the baseline. | WebGL2 advanced root, texture atlas/KTX2, GPU pick pass, Forward+, WebGPU root, culling services, asset pipeline split. |
| GPU compute for Tarstate | Do not add GPU code to `packages/tarstate/src`. First useful proof is CPU columnar/WASM style benchmarking, not WebGPU. | WebGPU scan/compact and joins only after persistent columnar buffers beat CPU/WASM end-to-end. |
| SharedArrayBuffer | SAB is adapter/backend detail only. Good for bounded numeric lanes, not object rows or writer patches. Fallbacks through clone/transfer remain mandatory. | Pointer-ring microbench, transform-lane microbench, columnar relation source microbench, OffscreenCanvas smoke. |
| Web platform capabilities | Browser APIs map to observed rows, effect intents, event streams, opaque resources, renderer backends, and app-host policy rows. Unsupported/denied is normal product state. | Full browser matrix, manual Safari/iOS checklists, promotion of specific APIs to supported lab behavior. |

## Active Prototypes And File Locations

- Tarstate write path: `packages/tarstate/src/write.ts`.
  Object-backed `insert`, `update`, `upsert`, and `delete` patches validate rows,
  build relation key indexes lazily, copy rows on mutation, and return
  diagnostics instead of throwing for invalid or ambiguous writes.
- Tarstate Royal lens prototype: `packages/tarstate/src/royal-prototype.ts`.
  Defines store lens primitives, `createStoreLensSnapshot`,
  `createStorePatchDispatcher`, Royal row schemas, `royalQueries`, leak codes,
  and the capability boundary contract. It remains intentionally unexported
  from the public Tarstate package surface.
- Chargrid Tarstate lens: `apps/chargrid-lab/src/royalTarstateLens.ts`.
  Converts chargrid `LayoutBox`, `PickTarget`, scene state, and pointer samples
  into `layoutBoxes`, `pickTargets`, `renderFlags`, and `pointerSamples`, with
  missing-ref diagnostics.
- Chargrid Royal primitives: `apps/chargrid-lab/src/royalChargridPrimitives.ts`.
  Holds Yoga layout, pixel/cell snapping, render-root construction, fitted glTF
  frames, CPU picking, navigation, text cell anchors, and DamagedHelmet pick
  geometry helpers.
- Helmet pick fuzz: `apps/chargrid-lab/src/helmetPickFuzz.test.ts`.
  Samples 56 x 44 fitted-frame points, compares CPU picking against a projected
  visibility oracle, and rejects hidden glTF triangle hits.
- Capability lab runtime: `apps/tarstate-capability-lab/src/runtime.ts`.
  Owns simulated/browser handles for media, renderer, socket, worker, lock, and
  fullscreen resources; app-visible state is rows, events, results, fullscreen
  status, and diagnostics.
- Research docs:
  `docs/v2/research/tarstate-royal-api.md`,
  `docs/v2/research/tarstate-capability-runtime.md`,
  `docs/v2/research/tarstate-gpu-compute-research.md`,
  `docs/v2/research/shared-array-buffer-seams.md`,
  `docs/v2/research/web-platform-capability-inventory.md`, and
  `docs/royal/rendering-wishlist-and-benchmarks.md`.

## Benchmark And Proof Gates

Latest recorded results are from the research docs and checked scripts; this
pass did not rerun long benchmarks.

| Gate | Script/doc | Latest known signal |
| --- | --- | --- |
| Royal capability flow | `scripts/tarstate-royal-flow-bench.test.ts`, `tarstate-royal-api.md` | Low-frequency effect result 0.22 ms Tarstate median; coalesced pointer 0.83 ms; render projection 0.24 ms; cross-store pointer join 0.54 ms; fast resultId effect loop 3.45 ms; scoped slow join 24.00 ms. |
| Capability runtime | `scripts/tarstate-capability-bench.test.ts`, `tarstate-capability-runtime.md` | Indexed renderer projection is viable; scan is not. At 5k objects, scan was 2,285.96 ms versus 13.28 ms indexed. Coalesced 50k pointer events in 0.11 ms. Batched 416 effect intents in 0.76 ms versus 1,976.57 ms per-intent. |
| Tarstate evaluator | `scripts/tarstate-evaluator-bench.test.ts` | Compares hand lower bound, scan source, and indexed source for category filter plus inventory left join. Diagnostics must remain empty. |
| Tarstate writes | `scripts/tarstate-write-bench.test.ts` | Compares hand object mutation against `applyWrites` for write batches; expected write result includes applied patch count and no diagnostics. |
| Tarstate UX/geo/memory | `scripts/tarstate-ux-bench.test.ts`, `scripts/tarstate-geo-bench.test.ts`, `scripts/tarstate-memory-bench.test.ts` | Maintain pressure around indexed joins, visible-row filtering, heap pressure, and repeated evaluation. Scan joins are known anti-goals for hot paths. |
| Royal chargrid | `scripts/royal-chargrid-bench.test.ts` | Layout gate: p95 under 250 ms, integer-cell violations zero, expected box/target counts. Render-row gate: scene build p95 under 250 ms with mesh/text/glTF nodes. Picking gate: p99 under 250 ms and more than 25 samples/s. |
| Helmet pick fuzz | `apps/chargrid-lab/src/helmetPickFuzz.test.ts` | No false positives, false negatives, or mismatch points across 2,464 fitted-frame samples; also rejects back-triangle hits hidden behind the preview plane. |
| Rendering research | `docs/royal/rendering-wishlist-and-benchmarks.md` | First gates should be `card-stress-textures`, `gpu-pick-helmet-fuzz`, and WebGL2-only `forward-plus-light-stress` before broader renderer changes. |
| GPU/SAB research | `tarstate-gpu-compute-research.md`, `shared-array-buffer-seams.md` | No product implementation gate passed yet. First useful proofs are columnar CPU/WASM and Royal pointer-ring/transform-lane microbenches. |
| Web capabilities | `web-platform-capability-inventory.md` | First expansion should be a capability matrix and browser fixture harness, then activation-gated effects, then storage/network/worker isolation. |

## Known Abstraction Leaks And Their Row Shapes

- Browser activation and permission policy leak through result rows and
  diagnostics, not raw exceptions: `activation_required`, `permission_denied`,
  `policy_denied`, `unsupported`, `manual_required`.
- Renderer/browser resource lifetime leaks through opaque resource rows and
  diagnostics: `resource_lost`, `context_lost`, `device_lost`,
  `extension_missing`, `gpu_adapter_unavailable`.
- High-rate input and transport backpressure leak through bounded event/window
  rows: `pointerSamples`, `pointerWindows`, `input_event_windows`,
  `network_backpressure_rows`, and diagnostics such as `backpressure_dropped`
  or `input_dropped`.
- Stale, missing, or mismatched relation edges leak through Tarstate
  diagnostics: `missing_ref`, `invalid_row`, duplicate key diagnostics,
  unsupported patch routes, and source/evaluator diagnostics.
- Cross-origin isolation and host policy leak through policy rows:
  `host_policy_rows`, `isolation_results`, `shared_memory_rows`,
  `security_policy_rows`, plus `cross_origin_isolation_required`,
  `cors_failed`, `corp_missing`, and `csp_blocked`.
- Renderer feature availability leaks through probe rows rather than app state:
  `renderer_capability`, `feature_gate`, `frame_stats_rows`,
  `asset_readiness`, `texture_upload`, `gpu_timing`, and fallback diagnostics.
- Storage/network durability leaks are telemetry and deterministic traces:
  storage quota/persistence rows, fake network trace rows, queue depth, drops,
  reorders, and `quota_exceeded` or `evicted_or_missing`.

## Decomplection Map

| Concern | Owner |
| --- | --- |
| Logical relations, fields, object sources, query data, evaluator, write patches, and generic diagnostics | Tarstate core |
| Physical row layout, columnar batches, SAB snapshots, WASM/SIMD kernels, GPU planners | Future Tarstate adapter/backend packages, not core |
| Royal authoring scene data, layout specs, stable handles, pure descriptors | Royal core / `renderer-core` style packages |
| WebGL/WebGL2/WebGPU contexts, GPU resources, shader programs, frame scheduling, timer/readback/context-loss handling | Renderer backend |
| Asset source bytes, decoded buffers/images, glTF/KTX2/Basis readiness, texture upload/cache metrics | Asset pipeline or backend-adjacent cache |
| Visibility, picking, culling, CPU/GPU pick oracles, spatial indexes | Visibility/picking service |
| Browser APIs, permission prompts, fullscreen/clipboard/popup/file picker, workers, storage, network, media handles | Capability adapters/interpreters |
| React/component state, UI selection, local toggles, display of rows/results/diagnostics | App UI |
| Fixture data, hardware/browser runners, trace summaries, benchmark tables, regression thresholds | Benchmarks and harnesses |

## Next Work

### Immediate

- Keep the Tarstate Royal prototype export-free until the app pattern hardens.
- Use indexed sources, stable result IDs, batching, and coalescing as default
  policies in any next prototype.
- Add capability-lab policy matrix fixtures before adding many new browser API
  rows.
- Convert helmet pick fuzz output into a reusable report schema before adding
  GPU ID/depth picking.
- Start with Royal pointer-ring or transform-lane microbench if SAB work
  resumes.
- Start GPU compute work with a columnar CPU/WASM benchmark, not WebGPU.

### Later

- WebGL2 root/probe rows, then `card-stress-textures`,
  `gpu-pick-helmet-fuzz`, and `forward-plus-light-stress`.
- Storage, network, worker, iframe, and isolation browser smokes with explicit
  denied/unsupported rows.
- Columnar `RelationSource` adapter once relation descriptors and row lenses
  are stable enough to avoid rewriting the ABI.
- Worker evaluator/query compiler proof after clone/transfer/SAB transport
  baselines are measured.
- Renderer capability rows that can feed Tarstate probes without importing
  renderer/backend handles.

### Non-Goals

- No raw browser, DOM, WebGL/WebGPU, media, worker, or store handles in app
  Tarstate rows.
- No GPU or WebGL compute backend inside `packages/tarstate/src`.
- No SAB as a public app API or global shared-memory app state.
- No per-event/per-frame Tarstate hot path without coalescing/materialization.
- No renderer feature implementation from research docs alone; each feature
  needs a benchmark gate and package seam.
- No generic "support every Web API" abstraction in the capability lab.

## Cleanup And Merge Candidates

- Merge this status doc into a future research README if `docs/v2/research/`
  grows an index; no README exists now.
- Later, split stable Tarstate/Royal lens decisions out of
  `tarstate-royal-api.md` into implementation docs once the API is exported.
- Keep `tarstate-gpu-compute-research.md` and `shared-array-buffer-seams.md`
  as research notes until at least one microbench exists; then replace broad
  planning sections with links to measured proofs.
- Fold web-platform capability family rows into capability-lab schema docs only
  after specific APIs graduate from inventory to supported behavior.
- Rendering wishlist remains a proof-gate catalog; merge only the rows and
  package split that are exercised by real renderer benchmarks.
