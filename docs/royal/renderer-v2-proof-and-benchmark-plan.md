# Renderer V2 Proof And Benchmark Plan

This document maps renderer v2 architecture invariants to proof mechanisms.
Use it to decide whether an invariant needs a unit test, property/fuzz test,
import or bundle-shape test, GPU benchmark, or a skipped v2 acceptance test.

## Proof Classes

- Active unit tests prove behavior that exists in v1 or has landed in v2.
- Fuzz/property tests prove ordering, lifecycle, cache, or transport invariants
  across generated inputs.
- Import and bundle-shape tests prove module boundaries and absent-feature
  claims.
- GPU benchmarks prove frame-time, upload, allocation, latency, and draw-lane
  claims under hardware rendering.
- `test.todo` and `test.skip` entries track v2-only invariants before the API
  exists. They should become active tests as each implementation slice lands.

## Matrix

| Invariant | Proof Type | Current Status | First Proof |
|---|---|---|---|
| Stable handles cross the render hot path | unit/property | partial v1 coverage | active tests for explicit `batchKey`, glTF geometry/texture keys, future v2 handle interning |
| Retained workspaces back render planning | unit + benchmark | partial v1 coverage | active draw-queue buffer reuse tests, future allocation-count benchmark |
| Feature wiring resolves at construction | import/bundle + unit | v2 todo | v2 renderer-module acceptance tests |
| Absent modules have no hot-path work | import/bundle + benchmark | v2 todo | primitive-only renderer acceptance plus compact shader tests |
| Poses are separate from assets | unit + benchmark | partial v1 coverage | glTF cache-key tests, runtime pose roadmap tests |
| Unsupported advanced glTF targets are tracked | skipped tests | not yet complete | advanced glTF roadmap `test.skip` suite |
| High-frequency updates bypass React reconciliation | unit + benchmark | partial v1 coverage | transform handle/SAB tests plus future React commit-count benchmark |
| Scene patches have lanes | unit/fuzz | v2 todo | `ScenePatchBatch` lane/revision/recovery acceptance tests |
| Transforms are columnar transport | fuzz/property | active v1 coverage | shared transform store/fuzz tests, future transform publication lane tests |
| Backends own GPU resources and frame scheduling | unit + GPU benchmark | partial v1 coverage | XR render-view/frame-clock tests plus XR frame-time benchmark |
| `react-regl-fiber` is primary React API and core works without React | import/package tests | v2 todo | package boundary tests |
| Transport, interest, and renderer metrics stay separate | unit/script | partial Infinigen coverage | interest-policy tests and WebTransport timing schema assertions |
| Donnybrook-style replication stays above rendering | unit/property + benchmark | research scoped | attention-set ranking tests, clustered-battle benchmark, and import checks excluding peer transport from renderer packages |
| Forward+ is optional lighting, not a base renderer cost | import/bundle + GPU benchmark | partial v1 coverage | no-Forward+ primitive import test plus Forward+ light-count benchmark |
| Offscreen remains a backend, not a second renderer | unit/fuzz + benchmark | partial v1 coverage | Offscreen transform lane tests plus worker frame-time benchmark |
| Kept v1 capabilities require parity gates | benchmark matrix | v2 todo | named v1/v2 scenario thresholds |

## Active V1 Tests To Prefer First

- Draw queue: fresh geometry/material descriptors with matching explicit
  `batchKey` coalesce into one instanced lane.
- Draw queue: disabling instancing avoids instancing identity work.
- Draw queue: instanced batch buffers are not recreated after warmup.
- glTF source cache: multiple sampled poses do not reload source bytes.
- glTF animation sampling: sampling does not mutate source JSON.
- Infinigen interest policy: network and feature-window budgets do not contain
  renderer patch fields.
- Infinigen request frame smoke: transport flow-control metrics and
  feature-window metrics remain separate.

## V2 Acceptance Skeletons

Put repo-wide boundary and bundle-shape proofs in root `tests/*.test.ts`. Put
package behavior proofs under `packages/*/tests` only when the behavior belongs
to that package.

Use `test.todo` for API-shape invariants and `test.skip` only when a concrete
proof scene or fixture exists but the implementation is intentionally absent.

Acceptance tests should read like executable requirements. Avoid vague TODO
text such as "support streaming later".

## Benchmark Gates

Each kept v1 capability needs a named scenario, metric, and allowed regression
budget before its v2 replacement is accepted. Initial scenario families:

- `primitive-static`
- `helmet-gltf`
- `card-stress-textures`
- `repeated-gltf-instancing`
- `forward-plus-light-stress`
- `offscreen-transform-5k`
- `streaming-infinigen`
- `clustered-battle-attention`
- `xr-smoke-multiview`

Initial metrics:

- first nonblank frame
- p50/p95/p99 frame time
- p95 input latency
- allocation count after warmup
- full-root frame count
- root-patch count
- draw count
- scalar versus instanced draw lanes
- texture upload count and total upload time
- per-unique-texture readiness
- glTF source/evaluation/scene/first-draw/readiness timings
- worker transform throughput
- XR frame time and snapshot cost
