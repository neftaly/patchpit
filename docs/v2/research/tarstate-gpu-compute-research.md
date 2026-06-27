# Tarstate GPU Compute Research

Date: 2026-06-27.

This is a research/planning note, not an implementation proposal. The current
recommendation is: do not add a GPU backend to Tarstate core yet. Add only a
small benchmark proof if we want to keep the option alive.

Feasibility rating:

- WebGPU: medium for large, fixed-width, columnar batch operators with
  persistent buffers; low for current object-row Tarstate evaluation.
- WebGL: low. Useful as a historical GPGPU sketch or renderer-adjacent lab, not
  as a Tarstate compute backend.
- WASM/SIMD or CPU indexing/JIT: high near-term return. These should beat GPU
  work in the proof matrix before GPU becomes product scope.

## Local Snapshot

Inspected code and docs:

- `packages/tarstate/src/evaluate.ts`
- `packages/tarstate/src/write.ts`
- `packages/tarstate/src/query.ts`
- `packages/tarstate/src/source.ts`
- `scripts/tarstate-evaluator-bench.test.ts`
- `scripts/tarstate-write-bench.test.ts`
- `scripts/tarstate-royal-flow-bench.test.ts`
- `docs/v2/research/tarstate-api-brief.md`
- `docs/v2/research/tarstate-ux-bench.md`
- `docs/v2/research/tarstate-geo-bench.md`
- `docs/v2/research/tarstate-capability-runtime.md`
- `docs/v2/research/tarstate-royal-api.md`
- other `docs/v2/research/*` headings and search hits for benchmark/capability
  pressure

The current evaluator is object/context based:

- `from` reads iterable rows and validates object shape.
- `where` interprets equality predicates, with an optional source lookup fast
  path for simple `field == value`.
- `join` has a simple lookup-join path when the right side is a plain `from`,
  otherwise it falls back to nested loops.
- `select` allocates fresh projected JS objects.
- diagnostics are carried through the hot path.

The writer is also object based:

- patches are applied in order.
- per-relation key indexes are built lazily as JS `Map`s.
- inserts, updates, upserts, and deletes branch on patch kind, validate rows,
  copy JS objects, and emit diagnostics.
- deletes splice arrays and repair indexes after the removed row.

The existing evidence points away from raw GPU first:

- `docs/v2/research/tarstate-ux-bench.md` shows scan joins are unusable, indexed
  joins are viable, and trusted/low-allocation CPU paths are still much faster
  than diagnostic object evaluation.
- `docs/v2/research/tarstate-capability-runtime.md` shows coalescing, bounded
  ephemeral rows, indexed joins, and batching fix the bad runtime shapes.
- `docs/v2/research/tarstate-royal-api.md` says high-rate pointer streams and
  local store selectors should stay direct or coalesced.
- `docs/v2/research/tarstate-geo-bench.md` is the first place a GPU-shaped
  workload may emerge, but only after range/spatial predicates and columnar
  feature batches exist.

Decomplection pressure: keep query algebra, physical row layout, validation,
backend scheduling, and diagnostics as separate ownership boundaries. A GPU
backend should not make Tarstate core depend on browser GPU APIs.

## Source Notes

- [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API):
  WebGPU is still marked limited availability, requires a secure context, has
  first-class compute pipelines, and stores compute data in GPU buffers or
  textures.
- [GPUAdapter.features on MDN](https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter/features):
  adapter features vary by browser, OS, adapter, and security work. Any backend
  must feature-detect and fall back.
- [GPUQuerySet on MDN](https://developer.mozilla.org/en-US/docs/Web/API/GPUQuerySet):
  timestamp queries exist for render and compute passes, but require the
  `timestamp-query` feature.
- [WGSL spec](https://www.w3.org/TR/WGSL/): storage buffers, workgroup memory,
  atomics, barriers, and host-shareable layout rules are the relevant compute
  building blocks.
- [Khronos WebGL 2.0 spec](https://registry.khronos.org/webgl/specs/latest/2.0/):
  WebGL 2 derives from OpenGL ES 3.0 and includes transform feedback, texture
  formats, framebuffer output, and worker exposure, but not a compute-shader
  API.
- [MDN WebGLTransformFeedback](https://developer.mozilla.org/en-US/docs/Web/API/WebGLTransformFeedback):
  transform feedback can capture vertex-stage outputs into buffers.
- [NVIDIA GPU Gems scan chapter](https://developer.nvidia.com/gpugems/gpugems3/part-vi-gpu-computing/chapter-39-parallel-prefix-sum-scan-cuda):
  prefix sum is the primitive behind stream compaction, radix sort, histograms,
  and many filtering pipelines.
- [NVIDIA sorting paper](https://research.nvidia.com/publication/2009-05_designing-efficient-sorting-algorithms-manycore-gpus):
  GPU radix/merge sort performance comes from fine-grained parallelism, minimal
  global communication, shared memory, and scan primitives.
- [CUB DeviceScan and DeviceRadixSort docs](https://nvidia.github.io/cccl/cub/api/structcub_1_1DeviceScan.html):
  production GPU libraries expose scan, selection, radix sort, reduce,
  segmented operations, and related primitives. WebGPU would need custom
  versions or a small library.
- [Efficiently Processing Joins and Grouped Aggregations on GPUs](https://arxiv.org/abs/2312.00720):
  modern GPU DB work still calls out random accesses as a major cost and argues
  for optimizer heuristics, not one universal GPU operator.
- [WebGPU dispatch overhead paper](https://arxiv.org/abs/2604.02344):
  recent WebGPU measurements show per-dispatch overhead matters enough that
  kernel fusion and dispatch count should be first-class benchmark metrics.
- [WebAssembly vector types](https://webassembly.github.io/spec/core/syntax/types.html):
  WebAssembly has `v128` SIMD vector values for packed numeric work.
- [Emscripten SIMD docs](https://emscripten.org/docs/porting/simd.html):
  a practical browser build path exists for SIMD-enabled WASM baselines.

## Workload Fit

Plausible GPU/WebGPU candidates:

| Workload | Fit | Why |
| --- | --- | --- |
| Large scans over numeric or dictionary-coded columns | Good if buffers persist | One predicate per row maps cleanly to parallel mask generation. |
| Filtering and compaction | Good at large sizes | Mask plus prefix sum plus scatter is a standard GPU pipeline. |
| Duplicate-key and relation validation | Medium | Sort/hash fixed-width keys, then detect adjacent duplicates or missing foreign keys. Good as an offline/batch validator, not per-row diagnostics. |
| Equality joins | Medium | Hash joins or sort-merge joins can work for large fixed-width key columns. Random access and output fan-out can dominate. |
| Sort/group/aggregate | Medium to good if Tarstate grows these operators | Radix sort, segmented reduce, and grouped aggregation are mature GPU DB patterns, but Tarstate does not expose these operators yet. |
| Vector-ish spatial probes | Medium only for large feature sets | Bbox, tile, or point-in-rect probes over 100k+ features could fit. Current Royal pointer windows are intentionally tiny after coalescing. |
| Fuzz oracle batches | Medium for fixed invariants | Many generated fixtures could be checked in batch if invariants compile to fixed-width column checks. Dynamic JS oracle logic stays CPU. |
| Writer batch prevalidation | Low to medium | Validate big insert/upsert/delete batches and duplicate keys before CPU apply. Ordered mutation semantics remain CPU-owned. |

Workloads that should stay CPU for now:

- current `evaluate(...)` over JS object rows and alias contexts
- current `applyWrites(...)` ordered patch application
- small app/UX queries at 1k to 10k rows
- Royal render rows, effect-result rows, and coalesced pointer probe windows
- diagnostics that create rich messages, carry arbitrary details, or depend on
  source exceptions
- arbitrary strings, `JSON.stringify` composite keys, arrays such as
  `anchoredPath`, nullable/optional shape checks, and app-specific object copies
- dynamic or branch-heavy query trees where each row may take a different path
- queries where all result rows must immediately become JS objects on the main
  thread
- source adapters that read live stores, Automerge snapshots, or async
  relation sources per query

The current tarstate evidence says CPU indexing and lower-allocation evaluation
are the first optimization frontier. GPU becomes interesting only after the
runtime can keep physical relation data in stable typed buffers.

## WebGL Viability

WebGL can do limited GPGPU-style work:

- fragment shaders can map over textures and write results to framebuffers
- multiple render targets can write several output textures
- float/integer textures and texture arrays exist in WebGL 2 under the format
  rules and extension limits
- transform feedback can capture vertex shader varyings into buffers
- rasterizer discard plus transform feedback can avoid drawing while producing
  stream-like outputs

What is awkward or effectively disqualifying for Tarstate:

- there is no WebGL compute shader stage
- no storage-buffer style arbitrary read/write interface like WebGPU
- no ergonomic atomics, workgroup memory, barriers, or dispatch model for
  prefix sums, hash tables, or radix sort
- compaction requires multi-pass textures/framebuffers or transform-feedback
  tricks
- data shape must be packed into texels or vertex attributes
- readback can stall the CPU/GPU pipeline
- browser/driver texture format behavior is more constrained than a DB operator
  wants
- debugging and correctness traces are poor compared with CPU/WASM baselines

Use WebGL only for a renderer-adjacent experiment if WebGPU is unavailable. Do
not build a Tarstate backend around WebGL.

## WebGPU Viability

WebGPU has the primitives Tarstate would need:

- compute shaders
- storage buffers and host-shareable WGSL layouts
- workgroup memory and barriers
- atomics for counters, hash-table slots, and validation summaries
- command buffers and compute passes
- timestamp queries when the adapter exposes `timestamp-query`
- workers in supporting browsers

Likely kernel shapes:

- scan/filter: generate a `u32` mask, prefix-sum it, scatter selected row IDs.
- lookup join: build or reuse a key hash table, probe left rows, emit match
  counts, prefix-sum counts, scatter pairs.
- sort/group: radix sort keys plus row IDs, then segmented reduce or adjacent
  duplicate detection.
- relation validation: normalize fixed-width keys, sort/hash, report compact
  code/count summaries.
- spatial probe: test boxes against viewport/tile/pointer columns and compact
  hits.

The backend must assume feature gates:

- `navigator.gpu` may be missing.
- adapter/device creation may fail.
- core vs compatibility mode may change limits.
- `timestamp-query` is optional.
- limits for buffer sizes, workgroup storage, binding counts, and workgroup
  sizes vary.
- all paths need CPU and preferably WASM/SIMD fallbacks.

The main risk is not whether WebGPU can run the kernels. It can. The risk is
whether Tarstate can avoid paying more for data movement, dispatches, readback,
and JS object materialization than it saves.

## Data Shape Requirements

A GPU-compatible Tarstate source needs a physical relation layer that does not
exist today:

- columnar relation batches, not arrays of JS objects
- fixed-width fields for hot operators: `u32`, `i32`, `f32`, packed booleans,
  row IDs, dictionary string IDs
- dictionary tables for string/id/ref fields, with stable integer codes
- explicit null/undefined bitmaps for optional and nullable fields
- composite keys encoded as fixed-width lanes or prehashed values with collision
  checks
- stable row IDs separate from physical order
- relation version numbers and dirty ranges
- buffer ownership in adapters, not query data
- persistent GPU buffers across frames/evaluations
- small result descriptors first: counts, row ID ranges, and compact diagnostic
  codes before JS row materialization
- incremental upload of dirty ranges, not full relation uploads per query

This is also useful for a CPU/WASM path. That is important: the first investment
should be a backend-neutral columnar source shape, not WebGPU-specific code.

## API And Decomplection

Keep `packages/tarstate` independent:

- no `GPUDevice`, `GPUBuffer`, WebGL context, browser feature detection, or WGSL
  code in `packages/tarstate/src`
- query values stay declarative and serializable
- `RelationSource.rows()` and optional `lookup()` remain the simple object-row
  boundary
- physical columnar sources are additive adapter capabilities
- diagnostics from GPU backends are backend/probe diagnostics, not richer
  source row errors unless materialized and checked on CPU

Possible package split:

- `packages/tarstate-columnar`: typed physical relation batches, dictionary
  encoding, null bitmaps, row IDs, dirty ranges, CPU scan/index helpers
- `packages/tarstate-wasm`: optional SIMD kernels over the same columnar batch
  ABI, if benchmarks justify it
- `packages/tarstate-webgpu`: browser-only WebGPU backend, planner, WGSL
  kernels, feature detection, timestamp/query instrumentation
- `packages/tarstate-bench`: shared fixtures and browser harnesses, if the
  scripts grow beyond one proof file

Planner shape:

- core query data remains the logical algebra
- a backend planner receives query data plus source capabilities
- the planner either returns an executable physical plan or a fallback reason
- callers should not choose scan/index/GPU manually in app code

Probe/diagnostic rows a GPU backend should expose:

| Field | Purpose |
| --- | --- |
| `backend` | `cpu-object`, `cpu-columnar`, `wasm-simd`, `webgpu`, or fallback. |
| `featureLevel` | WebGPU core/compatibility/missing. |
| `fallbackReason` | Unsupported operator, missing feature, small input, unstable buffers, readback required, etc. |
| `relationName` | Relation touched by the backend. |
| `rowsScanned` | Physical rows read by kernels or CPU fallback. |
| `rowsEmitted` | Compact output row IDs or materialized rows. |
| `bytesUploaded` | Host-to-GPU transfer volume for this evaluation. |
| `bytesDownloaded` | GPU-to-host transfer volume for counts/results/materialization. |
| `dirtyRanges` | Count or bytes of relation ranges refreshed before execution. |
| `dispatches` | Number of WebGPU dispatches. |
| `gpuMs` | Timestamp-query measurement when available. |
| `wallMs` | End-to-end host wall time. |
| `materializeMs` | Time to turn compact GPU results into JS rows, if requested. |
| `correctnessHash` | Optional checksum for CPU/GPU comparison in benchmarks. |

Decomplection moves:

- separate logical queries from physical layouts
- separate validation policy from hot evaluation
- separate backend probes from user-facing result rows
- separate benchmark kernels from product runtime code
- separate GPU capability detection from app query call sites
- separate row identity from physical column positions

## Benchmark Plan

Do not benchmark WebGPU against the current object evaluator alone. That would
only show that object evaluation is slow. The proof must compare against the
simpler paths we would actually ship first.

Baseline variants:

1. Current object Tarstate evaluator/source.
2. Hand-written JS lower bound using arrays and `Map`s.
3. CPU columnar JS over typed arrays.
4. WASM/SIMD over the same columnar buffers.
5. WebGPU over persistent buffers.
6. WebGPU with forced full upload/download, as a worst-case anti-goal.

Workloads:

- equality filter on dictionary category or numeric field
- filter plus compact selected row IDs
- equality left join on fixed-width product/inventory IDs
- duplicate-key validation for one relation
- foreign-key validation between two relations
- optional bbox/spatial filter from the geo benchmark shape

Sizes:

- keep existing 1k, 5k, and 10k cases for continuity
- add 50k, 100k, 500k, and 1M rows
- vary selectivity: 0.1%, 1%, 10%, 50%
- vary join fan-out: 0, 1, 2, and many matches per key
- vary dirty range: 0%, 1%, 10%, 100% upload

Metrics:

- p50, p95, max wall time
- browser frame hitch time when run near rendering
- CPU time before submit
- WebGPU dispatch count
- GPU timestamp time when `timestamp-query` is available
- upload bytes and time
- download bytes and time
- JS materialization time
- heap delta and retained heap after forced GC where possible
- output row count and checksum
- diagnostics count and fallback reason
- browser, OS, GPU adapter, feature level, and timestamp availability

Likely break-even hypothesis to test:

- below 10k rows, GPU loses unless the data is already on GPU and output stays
  compact
- 50k to 100k rows may break even for simple scans only with persistent buffers
  and minimal readback
- 100k to 500k rows may be the first plausible range for filter/compact and
  validation
- joins, sort, and group need larger batches or repeated queries to amortize
  table/sort setup
- full JS object materialization can erase GPU wins even when kernels are fast

## First Benchmark Design

First proof: `tarstate-columnar-filter-join-bench`.

Goal: decide whether a columnar ABI is worth building before any GPU backend.

Fixture:

- products: `idCode:u32`, `categoryCode:u32`, `price:f32`, `labelCode:u32`
- inventory: `productIdCode:u32`, `stock:i32`, `warehouseCode:u32`
- dictionaries are generated once and excluded from per-query timing unless a
  scenario explicitly measures ingest
- query matches existing evaluator bench: category filter plus inventory
  left join

Runs:

- current object `evaluate`
- hand JS `Map`
- CPU typed-array scan plus `Map` or sorted index
- WASM/SIMD filter mask if the setup cost is small enough
- WebGPU filter mask plus compact row IDs
- WebGPU filter plus lookup/probe join only after scan/compact beats CPU

Gate:

- continue to WebGPU join only if WebGPU scan/compact beats CPU columnar or
  WASM/SIMD by at least 1.5x at 100k+ rows with persistent buffers and compact
  output
- do not count a win if the JS materialized result is slower end-to-end
- record fallback and feature data so missing WebGPU is a normal outcome

This benchmark can live as a docs-backed proof script later. It should not alter
Tarstate public API until it has evidence.

## Explicit Non-goals

- no GPU code inside `packages/tarstate/src`
- no WebGL compute backend for Tarstate core
- no replacement of indexed object sources with GPU sources
- no per-frame writer apply on GPU
- no rich diagnostic message generation in shaders
- no arbitrary string, object, or array processing on GPU
- no hidden browser requirement for apps that use Tarstate
- no query API changes until CPU columnar and WASM/SIMD baselines are measured
- no benchmark win that ignores upload, download, dispatch, materialization, or
  fallback cost

## Recommendation

No-op on GPU implementation for now.

The next useful step is a columnar CPU/WASM benchmark, not WebGPU code. If that
benchmark shows large fixed-width relation batches and compact row-ID outputs
matter for Patchpit, then add a WebGPU scan/compact prototype behind a separate
adapter package. Only proceed to GPU joins, validation, or spatial kernels after
scan/compact beats CPU columnar and WASM/SIMD under end-to-end browser metrics.
