# SharedArrayBuffer worker seams for Tarstate and Royal

Date: 2026-06-27

Scope: research and planning only. This note audits where SharedArrayBuffer
could be useful as a cheap cross-worker surface, where it is a trap, and which
benchmarks should happen before any API commitment. It does not propose making
SAB a public Tarstate or Royal API.

## Local context

Relevant local reads:

- `docs/royal/*`: Royal v2 already wants stable handles, retained workspaces,
  transform-only fast paths that bypass React, backend-owned GPU/frame
  scheduling, row/lane-oriented scene patches, worker protocols with ACKs and
  coalescing, and a documented non-SAB fallback.
- `docs/v2/research/*`: Tarstate is a small relational query/write layer over
  app-owned stores. Current research repeatedly says high-rate pointer streams
  must be coalesced before relations, scan joins are not viable for hot paths,
  query data should stay serializable, diagnostics should be rows, and Royal row
  lenses are the likely integration seam.
- `packages/tarstate/src/evaluate.ts`: evaluator materializes object contexts
  and object result rows. It has a clean source/evaluator boundary, an existing
  `lookup` optimization hook, and obvious allocation pressure in joins,
  projection, validation, and `JSON.stringify` row keys.
- `packages/tarstate/src/write.ts`: writes are schema-rich object patches with
  validation, key indexes, and adapter policy. This is a bad first SAB target.
- `packages/tarstate/src/query.ts`: query trees are data, which makes a worker
  evaluator/query compiler plausible once source snapshots are stable.
- `packages/tarstate/src/source.ts`: `RelationSource.rows`, optional `lookup`,
  and diagnostics are the best Tarstate adapter seam for columnar SAB sources.
- `scripts/tarstate-*.test.ts`: existing benches already establish that
  per-event snapshots and scan joins lose badly, while indexed lookups and
  batching are viable. SAB should be measured against those baselines, not
  assumed faster.
- `packages/renderer-core/src/*`: current renderer-core descriptors are
  object-shaped. SAB belongs below this API, after stable handles/lenses exist.
- `packages/react-regl-fiber/src/*`: current root is a main-thread WebGL root.
  Caches and text rendering assume same-thread WebGL and DOM canvas access.
  OffscreenCanvas would be a backend/protocol change, not a small transport swap.
- `apps/chargrid-lab/src/*`: the lab has real Royal-shaped input, layout,
  picking, render rows, and deterministic pick fuzz samples. This is the best
  source for the first pointer-ring benchmark.
- `scripts/gpu.ts`: the CDP/GPU harness pattern can verify nonblank rendering
  and collect traces once the benchmark reaches OffscreenCanvas or render stats.

No delegation/subagent facility was exposed in this environment; the audit was
done directly.

## Current platform facts

Primary sources:

- [MDN SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer):
  SAB is fixed-length shared binary memory, can be shared with workers without
  detaching, and web access is gated by secure context plus cross-origin
  isolation.
- [MDN Atomics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics):
  Atomics are the synchronization surface for shared typed arrays.
- [MDN Atomics.waitAsync](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/waitAsync):
  `waitAsync` is the non-blocking wait path and can be used on the main thread,
  but it is newer and needs a fallback.
- [MDN structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
  and [Worker.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage):
  `postMessage` uses structured clone, with an optional transfer list for
  transferable objects.
- [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
  and [OffscreenCanvas.getContext](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/getContext):
  OffscreenCanvas is transferable and can be used in workers, with 2d, webgl,
  webgl2, and webgpu contexts depending on browser support.
- [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API):
  WebGPU is secure-context only, limited availability, and exposed on workers
  through `WorkerNavigator.gpu` where supported.
- [Chrome: enabling SharedArrayBuffer](https://developer.chrome.com/blog/enabling-shared-array-buffer/):
  Chrome's current web path is cross-origin isolation, usually COOP
  `same-origin` plus COEP `require-corp`.
- [Mozilla: safely reviving shared memory](https://hacks.mozilla.org/2020/07/safely-reviving-shared-memory/):
  cross-origin isolation is an opt-in isolation model; cross-origin subresources
  must consent through CORS/CORP-style mechanisms.
- [Mozilla: parallel primitives](https://hacks.mozilla.org/2016/05/a-taste-of-javascripts-new-parallel-primitives/):
  shared memory can outperform message passing for the right workload, but
  synchronization, load balancing, and flat-memory data structures are the hard
  parts.
- [WebKit: concurrent JavaScript](https://webkit.org/blog/7846/concurrent-javascript-it-can-work/):
  SAB shares only explicit binary memory; general JS heap/object sharing is a
  much harder problem and should not be assumed.
- [WHATWG structured data](https://html.spec.whatwg.org/multipage/structured-data.html):
  SAB is serialized by sharing backing data within the same agent cluster, while
  transferred objects use the structured serialize-with-transfer path.
- [WHATWG web app APIs](https://html.spec.whatwg.org/multipage/webappapis.html):
  `crossOriginIsolated` is exposed on Window/Worker globals, and SAB sharing is
  defined in terms of agent clusters.
- [WHATWG canvas / OffscreenCanvas](https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface):
  OffscreenCanvas is exposed on Window and Worker and is transferable.

Transport distinction:

- Structured clone is the default and easiest path. It copies supported JS data
  graphs, does not preserve every JS object behavior, and creates allocation
  pressure for high-rate rows.
- Transfer moves ownership of transferable objects such as `ArrayBuffer`,
  `OffscreenCanvas`, and `ImageBitmap`. It avoids many copies but detaches the
  sender's buffer, so useful protocols are usually batch or double-buffered.
- SharedArrayBuffer keeps one fixed backing store visible to multiple agents.
  It avoids clone/transfer churn but makes synchronization, memory layout,
  lifetime, and debugging explicit protocol work.

## Deploy and security requirements

SAB must be a runtime capability, not an assumption:

- Gate all SAB backends with `globalThis.crossOriginIsolated` and a successful
  `SharedArrayBuffer` construction probe.
- Serve app and benchmark pages over a secure context with:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp` or a tested `credentialless`
    path where the browser matrix permits it.
- Audit asset implications before enabling those headers globally. Cross-origin
  glTF buffers, images, fonts, WASM, worker scripts, and CDN resources need CORS
  or `Cross-Origin-Resource-Policy` consent. Some third-party iframes and popup
  relationships will break under COOP/COEP.
- Local dev/test must serve the same headers. A `file://` demo is not enough,
  and a Vite/dev-server benchmark needs explicit headers.
- `Atomics.wait` is for blocking-capable agents, normally workers. Main-thread
  waits need `Atomics.waitAsync` where available or a `postMessage` /
  `MessageChannel` fallback.
- Fallback must remain correct when isolation is missing: structured clone for
  object snapshots, transfer for typed batches, and rAF/event coalescing for
  input.

## Good SAB targets in this repo

SAB is promising for bounded, numeric, high-frequency lanes with stable schema:

- Transform lanes: stable slot ids, 16-float matrices, dirty ranges, and publish
  versions match Royal v2's desired transform fast path.
- Pointer/event rings: main-thread pointer capture can write compact samples to
  a bounded ring while a worker coalesces, picks, or fuzzes.
- Layout/render row snapshots: layout boxes, render flags, activation states,
  pick target geometry, and visibility outputs are mostly numeric/id fields.
- Dirty bitsets: row/range dirtiness is a compact synchronization primitive for
  both relation evaluation and renderer invalidation.
- Worker fuzzing: deterministic pointer-sample spam can stress race and
  lifecycle bugs without allocating an object per sample.
- Tarstate columnar relations: numeric columns plus interned ids can back a
  `RelationSource` adapter and avoid object materialization until the boundary.
- Renderer stats/probes: frame counters, queue depth, dropped sample counts,
  draw counts, and latency histograms are tiny shared counters.
- Asset decode queues: decode workers can publish bounded job/result headers and
  transfer decoded payloads such as `ImageBitmap` separately.

## Bad SAB targets

SAB is a poor fit for:

- Object graphs. It does not share JS objects, prototypes, maps, or closures.
- String-heavy rows. Strings require interning, external tables, or copying, so
  they erase most of the simplicity win.
- Schema-rich writer patches. Tarstate writes carry validation and adapter
  intent; binary patch queues would be premature.
- Userland ownership confusion. Raw buffers in app code would make races and
  lifetime bugs hard to localize.
- Anything that first needs simple debugging. Clone/transfer protocols are
  slower but far easier to inspect while ownership and data shape are unstable.

## Tarstate seams

Recommended Tarstate split: keep the public query/write API object-shaped and
add SAB only as a source/evaluator backend after row-lens descriptors stabilize.

Candidate seams:

- Columnar relation buffers. Add an adapter that maps a relation descriptor to
  typed columns: numbers and booleans in typed arrays, ids/refs as interned
  integer indexes, and strings only through explicit intern tables. This plugs
  into `RelationSource`, not the app API.
- Immutable snapshot headers. Each relation snapshot should have a header with
  schema id/hash, capacity, row count, generation, relation id, flags, and data
  offsets. Writers fill columns first, then atomically publish a version.
- Dirty ranges and bitsets. Relation producers can publish row ranges or bitsets
  for incremental evaluator work. This is an adapter contract, not a query
  language feature.
- Result buffers. Worker evaluators should write row ids or compact projected
  numeric columns into result buffers, then materialize object rows only at the
  consumer boundary.
- Worker evaluator/query compiler. `query.ts` is already serializable data, so a
  worker can compile plans once and evaluate against typed sources. The existing
  `lookup` hook points to typed indexes as the first meaningful optimization.
- Writer boundary. Keep `WritePatch` and adapter validation outside SAB for now.
  Later, a low-level adapter may accept a binary command queue, but that should
  encode already-decided commands, not become the canonical write shape.
- Diagnostics rows. Use bounded diagnostics relations with numeric codes and
  interned details. Do not use SAB for arbitrary error strings or stack payloads.

Tarstate ordering:

SAB should follow Tarstate writer and Royal row-lens integration. The exception
is a standalone columnar source microbench that mirrors `layoutBoxes`,
`renderFlags`, and coalesced `pointerSamples` without changing Tarstate APIs.

## Royal seams

Recommended Royal split: make SAB a runtime backend detail beneath stable
handles, row lenses, and renderer backend protocols.

Candidate seams:

- Main-thread input ring. DOM input stays on the main thread. Pointer samples
  are compact records with sequence, type, x/y, buttons, target/focus id,
  timestamp, and coalescing flags. Overflow policy must be explicit: drop old,
  drop new, or coalesce by pointer id.
- Worker layout/planning. A worker can consume app/lens snapshots and produce
  layout boxes, activation states, pick targets, and render row snapshots.
  String labels and style objects should stay in interned tables or clone
  messages until stable.
- OffscreenCanvas backend. Transfer the canvas once and let the worker own the
  WebGL/WebGPU context. GPU resources stay backend-owned; main-thread code does
  not share GL objects. This must remain an optional backend with a main-thread
  fallback.
- Transform publication. Use stable slot ids, 16-float aligned matrices,
  per-slot versions, dirty ranges, and a seqlock-style publish protocol. This
  matches the existing Royal v2 architecture notes.
- Visibility/culling service. Worker reads layout/render rows and camera state,
  writes visible row ids, dirty bitsets, and culling stats. Renderer consumes the
  compact output, not the full app model.
- GPU command planning. Workers can prepare command plans keyed by stable asset
  and material handles. Actual WebGL resource creation and draw submission stay
  with the backend that owns the context. WebGPU worker support is plausible but
  browser-dependent and should not drive the first milestone.
- Text/asset decode queues. Decode or measure work can be queued through SAB
  job headers, while decoded binary/image payloads move through transfer where
  that is the browser-native mechanism. The current text cache's DOM canvas
  assumption is a separate seam to decomplect.
- Fuzz harness. Reuse chargrid-lab's seeded pointer samples to spam the input
  ring, then verify pick/visibility outputs against the current synchronous
  oracle.

Royal ordering:

Do not put SAB ahead of Royal row-lens and stable transform-slot work. A narrow
input-ring and transform-lane benchmark can start now because it proves
transport cost without exposing buffers to app code.

## API and decomplection rules

Keep these boundaries explicit:

- SAB is an adapter/backend detail. Public app code speaks descriptors, query
  rows, write patches, handles, and lenses.
- Single writer per lane. A field/lane has exactly one producer. Multiple
  readers are fine if they obey the version protocol.
- Version counters are mandatory. Use odd/even or begin/end generation counters
  for multi-field records so readers can detect torn snapshots.
- Schema descriptors own memory layout. Descriptors define relation id, field
  order, column type, byte offset, stride, capacity, intern table ids, and
  alignment. Validate descriptors before constructing typed-array views.
- Ring buffers have contracts. Producer/consumer indexes, capacity, wrap mask,
  overflow policy, sequence numbers, and wakeup behavior must be documented per
  ring.
- Typed-array views should be boring. Prefer column arrays and fixed matrix
  slots over `DataView` offset arithmetic scattered through code.
- Diagnostics are first-class. Shared counters and bounded diagnostic rows must
  expose drops, stale reads, version conflicts, queue depth, and fallback mode.
- Decomplect after each benchmark. Keep transport, scheduling, relation schema,
  query planning, renderer backend ownership, and asset decoding separate. If a
  benchmark needs to entangle two of those to work, the seam is not ready.

## Benchmark plan

Compare structured clone, transfer, and SAB under the same workload. Do not
compare SAB only against a deliberately bad object-per-event path.

Metrics:

- p50/p95/p99 event-to-worker-ack latency
- p50/p95 frame time and rAF gaps on the main thread
- throughput in samples, rows, or transforms per second
- allocations and heap growth after warmup
- worker wakeup overhead for `postMessage`, `Atomics.notify`/`wait`, and
  `waitAsync` where available
- dropped/coalesced samples and stale snapshot reads
- CPU time per worker and main-thread long tasks
- for rendering milestones: first nonblank frame, draw calls, context loss, and
  frame stats

Benchmarks, in order:

1. Royal pointer-ring microbench. Use chargrid-lab pointer sample shapes and
   seeded fuzz input. Compare object `postMessage` batches, transferred
   double-buffered typed arrays, and a SAB ring with worker `Atomics.wait`.
   Measure latency, rAF gaps, allocation, drops, and wakeups. Serve with
   COOP/COEP and also verify fallback when not isolated.
2. Royal transform-lane microbench. Publish 5k and 50k 4x4 transform matrices
   from worker to main renderer. Compare structured clone of arrays, transfer
   double-buffering, and SAB slots with dirty ranges. Measure renderer consume
   cost and frame stability.
3. Tarstate columnar source microbench. Mirror `layoutBoxes`, `renderFlags`, and
   coalesced `pointerSamples` as typed columns. Compare current object lens plus
   indexed source, worker structured clone snapshots, transferred column
   batches, and SAB relation snapshots.
4. OffscreenCanvas smoke benchmark. Transfer canvas to a worker backend, render a
   minimal scene, and use the GPU harness style to verify nonblank frames and
   collect stats. Do this after the transport lanes have evidence.

Recommended first benchmark:

Build the Royal pointer-ring microbench first. It is small, high-signal, and
tests the hardest deployment question immediately: whether cross-origin
isolation, Atomics wakeups, and fallback behavior are acceptable before any
Tarstate or renderer API is reshaped.

## Feasibility

Rating: medium-high for bounded numeric lanes; medium for OffscreenCanvas
backend work; low for general Tarstate object rows and writes.

The practical path is not "move Tarstate/Royal to SAB." It is:

1. Prove a main-thread input ring and worker coalescer.
2. Prove transform publication through stable slots and dirty ranges.
3. Stabilize Royal row lenses and Tarstate relation descriptors.
4. Add a columnar `RelationSource` adapter and worker evaluator benchmark.
5. Only then consider OffscreenCanvas as a backend option.

Non-goals:

- Do not expose raw SABs as the application API.
- Do not rewrite Tarstate storage, writer patches, or diagnostics around binary
  buffers.
- Do not introduce a global shared-memory app state.
- Do not make COOP/COEP mandatory for the whole product before asset and embed
  implications are audited.
- Do not use SAB to hide missing indexing, batching, or row-lens ownership.
- Do not start with WebGPU. WebGPU worker support is useful later but adds too
  many variables for the first transport benchmark.
