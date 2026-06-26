# Browser Resource Requirements

This note turns the browser storage and performance research into requirements
for future Patchpit shell, chargrid, 3D, and terminal work. It is not a final
benchmark suite. It is the minimum bar future browser-heavy work should design
against before relying on local storage, GPU state, or smooth frame budgets.

## Current Requirements

- Treat browser-managed storage as recoverable unless the data is synced,
  exported, or otherwise backed by a durable user-visible document.
- Keep OPFS, IndexedDB, Cache Storage, and localStorage behind explicit lifetime
  policy. They are origin-private, quota-bound, and cleared with site data.
- Handle `QuotaExceededError` on every bounded write path that can grow:
  document cache, asset cache, terminal scrollback, renderer cache, OPFS blob,
  and IndexedDB index/data writes.
- Use `navigator.storage.estimate()` as telemetry only. Quota and usage are
  estimates, may be padded, and are not guarantees that future writes can
  succeed.
- Ask for persistent storage with `navigator.storage.persist()` only when the
  product has a user-visible reason. Still treat denial as normal.
- Design runtime surfaces to survive origin-wide data loss: reconnect sync,
  rebuild caches, recreate renderer/terminal state, and present missing local
  artifacts as recoverable.
- Keep browser performance tests tied to user-facing degradation: frame gaps,
  input latency, long tasks, terminal backpressure, chargrid throughput, WebGL
  context loss, and memory growth.

## Browser Storage Facts

Safari/WebKit is the strictest planning case:

- Safari 17+ and WebKit browser apps can grant an origin up to about 60% of
  total disk space. Embedded WebViews get about 15%.
- WebKit also caps total website data at about 80% of disk for browser apps and
  20% for embedded WebViews.
- WebKit evicts storage on an origin-wide LRU basis under overall quota pressure,
  storage pressure, or inactivity policy.
- WebKit estimates are upper bounds, not promises. Quota can vary for privacy
  and usage reasons.
- Safari's Intelligent Tracking Prevention can delete script-writable storage
  after seven days of Safari use without user interaction with the site.

Chrome, Chromium, and Firefox are less Safari-specific but still quota-bound:

- Browser storage is generally per-origin and best-effort by default.
- Browsers evict least-recently-used origins under storage pressure.
- Persistent storage changes eviction behavior, but browser support and grant
  policy differ.
- OPFS is part of the origin's quota-managed storage pool, not a durable local
  filesystem contract.

Primary sources:

- WebKit, [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- WebKit, [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- MDN, [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## Immediate Repo Benchmarks To Add Later

Add these as small, independently runnable browser checks before the related
feature work becomes large:

- `resource:storage-smoke`: report `navigator.storage.estimate()`,
  `persisted()`, and `persist()` result where available.
- `resource:opfs-bounded-write`: write bounded chunks to OPFS, catch quota
  failures, delete test data, and report throughput and failure mode.
- `resource:indexeddb-bounded-write`: same shape as OPFS, but through IndexedDB
  records large enough to exercise real quota paths.
- `perf:raf-gaps`: collect `requestAnimationFrame` gaps during idle, chargrid
  render, terminal output, and 3D scene activity.
- `perf:long-tasks`: record Long Tasks API entries when the browser exposes
  them, with a fallback to rAF gaps when it does not.
- `perf:terminal-pressure`: stream large output into the terminal surface and
  report dropped frames, input delay, retained scrollback size, and memory.
- `perf:chargrid-render`: render dense grids, edits, selection, and viewport
  scroll; report frame gaps and cell throughput.
- `perf:webgl-context-loss`: force or simulate WebGL context loss and prove the
  renderer can recreate resources or fail recoverably.
- `perf:browser-memory`: record browser memory APIs where available and treat
  missing support as expected.

## Safari Manual Harness

Playwright WebKit is useful for WebKit engine behavior, but it is not branded
Safari and should not be treated as the Safari storage or ITP acceptance gate.

The manual macOS Safari harness should:

- run in real Safari and Safari Technology Preview when available
- load a local or preview build over HTTPS when testing persistence heuristics
- print storage estimate, persisted state, persist request result, browser name,
  OS version, and user activation state
- run bounded OPFS and IndexedDB writes with cleanup
- test app restart and browser restart recovery
- include an inactivity checklist for ITP-sensitive data, even when the full
  seven-day window is not practical for every run
- include a WebGL context-loss action for 3D surfaces
- record whether the app is opened in Safari, standalone web app mode, or an
  embedded WebView-like host

## Inferred Thresholds

These thresholds are starting gates for future tests. They should be tightened
only after real app surfaces exist:

- No user-facing state may exist only in OPFS, IndexedDB, Cache Storage, or
  localStorage.
- Cache rebuild must not require manual browser data cleanup.
- Storage smoke must pass with persistent storage denied.
- Bounded write tests must stop at a configured cap before filling the origin.
- rAF checks should report any frame gap over 50 ms and fail sustained gaps over
  100 ms during normal interaction.
- Long task checks should report any task over 50 ms and fail repeated long
  tasks during terminal, chargrid, or 3D interaction.
- WebGL context loss must either restore the scene or show an explicit
  recoverable error state.
- Terminal and chargrid tests should cap retained history/render buffers rather
  than depending on browser eviction.

## Caveats

- Browser quota numbers are not capacity targets. They are upper-bound policy
  context for error handling and recovery design.
- `navigator.storage.estimate()` can be rounded or padded; never use it as an
  exact accounting source.
- Persistent storage is not portable enough to be a data durability guarantee.
- Safari ITP behavior depends on Safari use, site interaction, install mode, and
  WebKit policy. Keep a manual Safari check in the release path for storage-heavy
  changes.
- Embedded WebViews have materially smaller WebKit quotas than browser apps.
- Eviction is origin-wide in the policies that matter here, so mixed critical
  and disposable data in one origin must still tolerate whole-origin loss.

## Decomplection Notes

Future work should keep these concerns separate:

- storage lifetime policy belongs with the data owner, not inside shell widgets
- benchmark harnesses should be small commands, not hidden inside app code
- renderer, terminal, and chargrid caches should expose explicit caps and reset
  paths
- durable document semantics should remain independent from local browser cache
  optimizations
