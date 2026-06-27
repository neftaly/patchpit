# Web Platform Capability Inventory

Date: 2026-06-28

Scope: research and planning only. This inventory maps current browser platform
features to Patchpit, Tarstate, and Royal capability seams. It is not a promise
to support every API, and it should not cause implementation changes by itself.

No delegation or subagent facility was exposed in this environment, so the audit
was done directly.

## Local Context

Local files inspected before writing:

- `apps/tarstate-capability-lab/src/*`
- `docs/v2/research/browser-resource-requirements.md`
- `docs/v2/research/shared-array-buffer-seams.md`
- `docs/v2/research/tarstate-capability-runtime.md`
- `docs/v2/research/tarstate-royal-api.md`
- `docs/royal/rendering-wishlist-and-benchmarks.md`

Current local shape:

- The capability lab already models `resources`, `capabilities`,
  `effectIntents`, `effectResults`, `diagnostics`, `events`, `viewport`, and
  `fullscreen`.
- Raw browser, renderer, worker, socket, media, lock, and fullscreen handles are
  runtime-private. App code sees opaque resource ids and serializable rows.
- High-rate pointer data is coalesced before it becomes event rows.
- Storage and network behavior are currently represented as telemetry and
  deterministic traces, not durable guarantees.
- Prior research already separates renderer backends, SAB transport, Tarstate
  relation lenses, and browser policy gates.

## Source Index

Breadth source:

- MDN, [Web APIs index](https://developer.mozilla.org/en-US/docs/Web/API)

Behavior-sensitive source set:

- WHATWG, [HTML Standard](https://html.spec.whatwg.org/multipage/)
- WHATWG, [DOM Standard](https://dom.spec.whatwg.org/)
- WHATWG, [URL Standard](https://url.spec.whatwg.org/)
- WHATWG, [Fetch Standard](https://fetch.spec.whatwg.org/)
- WHATWG, [Streams Standard](https://streams.spec.whatwg.org/)
- WHATWG, [Storage Standard](https://storage.spec.whatwg.org/)
- WHATWG, [Fullscreen API](https://fullscreen.spec.whatwg.org/)
- WHATWG, [WebSockets Standard](https://websockets.spec.whatwg.org/)
- WHATWG, [Encoding Standard](https://encoding.spec.whatwg.org/)
- WHATWG, [Compression Standard](https://compression.spec.whatwg.org/)
- W3C, [Permissions](https://w3c.github.io/permissions/)
- W3C, [Permissions Policy](https://w3c.github.io/webappsec-permissions-policy/)
- W3C, [Indexed Database API](https://w3c.github.io/IndexedDB/)
- W3C, [File API](https://w3c.github.io/FileAPI/)
- WICG, [File System Access](https://wicg.github.io/file-system-access/)
- WICG, [Storage Access API](https://privacycg.github.io/storage-access/)
- WICG, [Cookie Store API](https://cookiestore.spec.whatwg.org/)
- W3C, [Service Workers](https://w3c.github.io/ServiceWorker/)
- WICG, [Background Sync](https://wicg.github.io/background-sync/spec/)
- WICG, [Background Fetch](https://wicg.github.io/background-fetch/)
- W3C, [WebRTC](https://w3c.github.io/webrtc-pc/)
- W3C, [WebTransport](https://w3c.github.io/webtransport/)
- Khronos, [WebGL 2.0](https://registry.khronos.org/webgl/specs/latest/2.0/)
- Khronos, [WebGL extension registry](https://registry.khronos.org/webgl/extensions/)
- W3C, [WebGPU](https://gpuweb.github.io/gpuweb/)
- W3C, [WebXR Device API](https://immersive-web.github.io/webxr/)
- W3C, [WebCodecs](https://w3c.github.io/webcodecs/)
- W3C, [Media Capture and Streams](https://w3c.github.io/mediacapture-main/)
- W3C, [Screen Capture](https://w3c.github.io/mediacapture-screen-share/)
- W3C, [Web Audio](https://webaudio.github.io/web-audio-api/)
- W3C, [Picture-in-Picture](https://w3c.github.io/picture-in-picture/)
- W3C, [Web Animations](https://drafts.csswg.org/web-animations-1/)
- W3C, [Pointer Events](https://w3c.github.io/pointerevents/)
- W3C, [Pointer Lock](https://w3c.github.io/pointerlock/)
- W3C, [Input Events](https://w3c.github.io/input-events/)
- W3C, [Selection API](https://w3c.github.io/selection-api/)
- W3C, [UI Events](https://w3c.github.io/uievents/)
- W3C, [Gamepad](https://w3c.github.io/gamepad/)
- W3C, [Geolocation](https://w3c.github.io/geolocation-api/)
- W3C, [Generic Sensor](https://w3c.github.io/sensors/)
- W3C, [Device Orientation and Motion](https://w3c.github.io/deviceorientation/)
- W3C, [Screen Wake Lock](https://w3c.github.io/screen-wake-lock/)
- WICG, [Web Serial](https://wicg.github.io/serial/)
- WICG, [WebHID](https://wicg.github.io/webhid/)
- WICG, [WebUSB](https://wicg.github.io/webusb/)
- WICG, [Web Bluetooth](https://webbluetoothcg.github.io/web-bluetooth/)
- W3C, [Web NFC](https://w3c.github.io/web-nfc/)
- W3C, [Credential Management](https://w3c.github.io/webappsec-credential-management/)
- W3C, [Web Authentication](https://w3c.github.io/webauthn/)
- W3C FedID CG, [FedCM](https://fedidcg.github.io/FedCM/)
- W3C, [Payment Request](https://w3c.github.io/payment-request/)
- WHATWG, [Notifications](https://notifications.spec.whatwg.org/)
- W3C, [Push API](https://w3c.github.io/push-api/)
- W3C, [Badging](https://w3c.github.io/badging/)
- W3C, [Clipboard API](https://w3c.github.io/clipboard-apis/)
- W3C, [Web Share](https://w3c.github.io/web-share/)
- W3C, [Web Locks](https://w3c.github.io/web-locks/)
- W3C, [Web Cryptography](https://w3c.github.io/webcrypto/)
- W3C, [Intersection Observer](https://w3c.github.io/IntersectionObserver/)
- CSSWG, [Resize Observer](https://drafts.csswg.org/resize-observer-1/)
- CSSWG, [CSSOM](https://drafts.csswg.org/cssom/)
- CSS Houdini, [CSS Typed OM](https://drafts.css-houdini.org/css-typed-om-1/)
- WICG, [URLPattern](https://wicg.github.io/urlpattern/)
- WICG, [View Transitions](https://drafts.csswg.org/css-view-transitions-1/)
- W3C, [Content Security Policy](https://w3c.github.io/webappsec-csp/)
- W3C, [Reporting API](https://w3c.github.io/reporting/)
- W3C, [Performance Timeline](https://w3c.github.io/performance-timeline/)
- W3C, [Navigation Timing](https://w3c.github.io/navigation-timing/)
- W3C, [Resource Timing](https://w3c.github.io/resource-timing/)
- W3C, [User Timing](https://w3c.github.io/user-timing/)
- W3C, [Long Tasks](https://w3c.github.io/longtasks/)
- W3C, [Web App Manifest](https://w3c.github.io/manifest/)
- WICG, [Web App Manifest application info extensions](https://wicg.github.io/manifest-incubations/)
- WebKit, [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- WebKit, [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- Chrome, [Making your website cross-origin isolated using COOP and COEP](https://developer.chrome.com/blog/coop-coep/)
- Chrome, [SharedArrayBuffer updates](https://developer.chrome.com/blog/enabling-shared-array-buffer/)
- Mozilla, [Safely reviving shared memory](https://hacks.mozilla.org/2020/07/safely-reviving-shared-memory/)
- MDN, [Features restricted to secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts/features_restricted_to_secure_contexts)
- MDN, [Features gated by user activation](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation)
- MDN, [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## Fit Vocabulary

- `observed rows`: passive state snapshots, support probes, policy snapshots,
  readiness, counters, and status.
- `effect intents`: app-requested host actions that may succeed, fail, be
  denied, or be unsupported.
- `event streams`: bounded and coalesced input or transport events.
- `opaque resources`: runtime-owned browser objects addressed only by stable
  resource ids.
- `renderer backend`: Canvas/WebGL/WebGPU/WebXR/media resources owned below
  Royal authoring data.
- `app-host policy`: deployment, headers, sandbox, permissions, install mode,
  and top-level host decisions.
- `out of scope`: APIs that should be explicit non-goals unless a product slice
  creates a real need.

Common result and diagnostic codes should stay small and typed:

- `ok`
- `unsupported`
- `permission_denied`
- `activation_required`
- `policy_denied`
- `insecure_context`
- `not_top_level`
- `cross_origin_isolation_required`
- `quota_exceeded`
- `resource_lost`
- `backpressure_dropped`
- `timeout`
- `partial_failure`
- `manual_required`

## Capability Families

### Document, Window, Navigation, History, URL, Popups, Dialogs

Likely Patchpit use cases:

- Viewport and DPR rows for layout and renderer sizing.
- URL/history integration for document routes, fixtures, and replayable labs.
- Popup and dialog testing for user activation and browser blocking behavior.
- Page lifecycle telemetry for autosave, sync pause/resume, and renderer cleanup.

Fit model:

- `location`, `history`, viewport, visibility, focus, online/offline, and
  lifecycle become observed rows.
- Navigation and history changes are effect intents with results; app code does
  not receive `Window` or `History` handles.
- `window.open`, `showModalDialog` alternatives, `alert`/`confirm`/`prompt`,
  and `beforeunload` are app-host policy or narrow effect tests, not general app
  primitives.
- `URL`, `URLSearchParams`, and structured route parsing are ordinary pure
  helpers, not capability resources.

Browser gates:

- Popups are transient-activation and browser-policy gated.
- Dialogs and `beforeunload` are heavily constrained by browsers and can block
  automation.
- Navigation behavior differs between top-level documents, iframes, sandboxed
  frames, installed PWAs, and history entries generated by the app.

Test strategy:

- Deterministic unit tests for route/URL parsing and history intent reducers.
- Real browser e2e for `window.open` allowed/blocked, `beforeunload`, focus,
  visibility, `pageshow`/`pagehide`, and navigation result rows.
- Manual Safari/iOS for popup and standalone-app behavior.
- WPT references for HTML navigation, history, page lifecycle, and dialogs.

Tarstate row/result/diagnostic suggestions:

- `viewport_rows`: width, height, DPR, visual viewport where available.
- `document_lifecycle_rows`: visibility, focus, online, page transition reason.
- `navigation_intents` and `navigation_results`: push/replace/reload/open.
- `popup_results`: opened, blocked, closed, returned focus, activation state.
- Diagnostics: `popup_blocked`, `activation_required`, `blocked_dialog_policy`,
  `beforeunload_ignored`, `history_desync`.

### DOM, Editing, Components, Observers, Utility APIs

APIs in this family include DOM nodes/events, Shadow DOM, custom elements,
templates, DOMParser/XMLSerializer, Selection/Range, Input Events, beforeinput,
IME composition, MutationObserver, ResizeObserver, IntersectionObserver,
URLPattern, Encoding, Compression Streams, Web Crypto, Web Locks, View
Transitions, CSSOM, and CSS Typed OM.

Likely Patchpit use cases:

- Text editing, selection, import/export parsing, Royal host element lifecycle,
  app preview embedding, layout/visibility probes, deterministic locks, crypto
  hashes, compressed fixture payloads, and route matching.

Fit model:

- Most DOM and utility APIs are local adapter implementation details, not
  capability rows.
- Selection, focus, edit commands, lock acquisition, and view transitions are
  effect intents when app code requests them across the host boundary.
- Observers are bounded event streams or sampled rows. Do not leak raw element
  handles; target elements are opaque resources.
- Web Crypto, Encoding, Compression Streams, URLPattern, and DOMParser can be
  pure utility helpers unless policy, worker availability, or opaque handles are
  involved.
- Web Locks fits the current `lock` resource shape: request/release intents,
  owner rows, timeout/steal diagnostics.

Browser gates:

- Selection, focus, `beforeinput`, IME, and clipboard-adjacent behavior depends
  on active element, user gesture, contenteditable/input type, platform, and
  browser editing policy.
- Shadow DOM can hide focus and event retargeting details from app code.
- View Transitions and CSS Typed OM support is uneven.
- Observers can produce high-rate or recursive updates; callback timing is
  browser-scheduled.
- Web Crypto is secure-context-sensitive for some operations and can be blocked
  by policy in constrained hosts.

Test strategy:

- Unit tests for URLPattern/route matching, encoding/compression helpers,
  crypto hash wrappers, and lock reducers.
- Browser e2e for selection/range, beforeinput, IME composition, focus,
  observer delivery, event retargeting through Shadow DOM, and view transition
  availability.
- Fuzz/spam harness for observer loops, resize storms, mutation storms, and
  lock contention.
- Manual Safari/iOS for selection, virtual keyboard, IME, view transitions, and
  focus behavior.

Tarstate row/result/diagnostic suggestions:

- `dom_target_resources`: stable id, role, focusable, shadow boundary, mounted.
- `selection_rows`: target id, selection kind, direction if available,
  collapsed, text length only when safe.
- `edit_event_rows`: beforeinput/input/composition summaries, coalesced.
- `observer_event_rows`: observer kind, target id, sequence, summarized rect or
  mutation count.
- `lock_rows`: lock name, owner id, pending count, acquired/released time.
- Diagnostics: `dom_target_missing`, `focus_denied`, `selection_unavailable`,
  `observer_backpressure`, `event_retargeted`, `lock_timeout`,
  `lock_contention`, `view_transition_unsupported`.

### Iframes, Sandbox, Permissions Policy, COOP, COEP, CORP, CORS, Isolation

Likely Patchpit use cases:

- Capability lab frames for hostile, sandboxed, cross-origin, and delegated
  permission scenarios.
- App preview panes that should not leak parent handles.
- SAB, high-resolution timers, OffscreenCanvas worker rendering, and WASM
  threads under cross-origin isolation.
- Royal asset loading under CORS/CORP constraints.

Fit model:

- Iframes are opaque resources with observed lifecycle, origin, sandbox, policy,
  and `postMessage` channels.
- Sandbox and Permissions Policy are app-host policy rows, not app-level
  toggles hidden inside feature tests.
- `postMessage`, `MessageChannel`, and `BroadcastChannel` are event streams with
  origin checks and backpressure diagnostics.
- COOP/COEP/CORP/CORS are deployment seams. They belong in host policy probes,
  asset pipeline diagnostics, and renderer/backend readiness rows.

Browser gates:

- `sandbox` can disable scripts, same-origin, forms, popups, top navigation,
  downloads, modals, pointer lock, and more depending on tokens.
- Permissions Policy can block APIs even when the browser implements them.
- Cross-origin isolation generally requires secure context plus compatible
  COOP/COEP headers and subresource CORS/CORP cooperation.
- COOP can sever opener relationships. COEP can break cross-origin images,
  fonts, scripts, workers, WASM, glTF buffers, and iframes that do not opt in.
- Some APIs are top-level only or require explicit delegation to child frames.

Test strategy:

- Browser e2e matrix with same-origin iframe, sandboxed same-origin iframe,
  cross-origin test origin, and isolated test origin.
- Header fixture server for COOP/COEP/CORP/CORS combinations.
- Message spam/fuzz harness for `postMessage` origin validation and event
  ordering.
- Real browser checks for `crossOriginIsolated`, SAB construction, worker SAB
  transfer, `SharedArrayBuffer` fallback, and asset failure diagnostics.
- Manual Safari/iOS because isolation, iframe permission delegation, and popup
  behavior vary sharply.

Tarstate row/result/diagnostic suggestions:

- `frame_resources`: frame id, origin class, sandbox tokens, loaded/error,
  same-origin-readable flag.
- `host_policy_rows`: secure context, cross-origin isolated, COOP, COEP, CSP,
  Permissions Policy summary.
- `message_channel_events`: source frame id, origin, sequence, accepted/rejected,
  size, drops.
- `isolation_results`: SAB available, worker available, subresource failures.
- Diagnostics: `sandbox_denied`, `permissions_policy_denied`,
  `cross_origin_isolation_required`, `corp_missing`, `cors_failed`,
  `opener_severed`, `third_party_frame_unavailable`.

### User Activation Gated APIs

APIs in this family include fullscreen, clipboard, file picker, popups, pointer
lock, wake lock, web share, payments, serial, HID, USB, Bluetooth, NFC, and
often media capture or screen capture entry points.

Likely Patchpit use cases:

- First real capability lab expansion after fullscreen.
- Testing transient activation consumption and result timing.
- User-visible import/export, copy/paste, fullscreen canvas, pointer-locked
  tools, and explicit device connection workflows.

Fit model:

- All gated operations are effect intents with result rows. The app asks for an
  operation; the adapter owns the actual browser call.
- Activation state is an observed diagnostic snapshot, not a guarantee.
- Device connections produce opaque resources only after a successful user
  gesture and browser prompt.
- Payments, share, and device chooser APIs should remain host policy examples
  until a product flow needs them.

Browser gates:

- Secure context is common.
- Transient user activation is short-lived and can be consumed by the first
  gated call.
- Permissions prompts can be one-time, persistent, session-only, denied,
  unavailable in private mode, or unavailable by browser.
- Top-level context and Permissions Policy delegation matter for file picker,
  clipboard, pointer lock, fullscreen, payments, and hardware APIs.
- Serial/HID/USB/Bluetooth/NFC are not uniformly available across Safari,
  Firefox, and mobile browsers.

Test strategy:

- Real browser e2e with a click-bound button that dispatches exactly one intent
  and records `navigator.userActivation` before and after.
- Negative e2e where the same intent is issued without activation.
- Manual Safari/iOS for every activation API that matters.
- Permission prompt tests should support manual mode and automation stubs.
- Fuzz/spam harness for repeated activation attempts to prove rows show
  activation consumption and denial reasons.

Tarstate row/result/diagnostic suggestions:

- `activation_rows`: hasBeenActive, isActive, consumedByIntentId.
- `gated_effect_intents`: kind, resource, activation policy, top-level need.
- `gated_effect_results`: status, error name, permission state where visible.
- Diagnostics: `activation_required`, `activation_consumed`,
  `permission_denied`, `prompt_dismissed`, `not_top_level`,
  `permissions_policy_denied`, `manual_prompt_required`.

Priority phase 1 APIs:

- `Element.requestFullscreen()`
- `window.open()`
- `navigator.clipboard.readText/writeText/read/write`
- `Element.requestPointerLock()`
- File picker and drag/drop only as a bridge into phase 2 storage/file work.

### Storage, Files, Cookies, Quota, Persistence, Private Mode

APIs in this family include local/session storage, IndexedDB, Cache API, OPFS,
File System Access, File API, storage estimate/persist, cookies, Storage Access
API, Cookie Store, private browsing behavior, and third-party storage policy.

Likely Patchpit use cases:

- Durable document sync, offline cache, renderer/asset cache, replay logs,
  terminal scrollback, fixture cache, and local imports/exports.
- Capability lab storage policy telemetry and quota failure paths.
- Sandboxed app preview storage isolation.

Fit model:

- Browser-managed storage is observed rows and effect intents, never a durable
  truth guarantee by itself.
- OPFS, IndexedDB, Cache Storage, and localStorage sit behind lifetime policy
  owned by the data/cache owner.
- File handles and directory handles are opaque resources.
- Cookies and third-party storage access are app-host policy; they should not be
  central app state.

Browser gates:

- Secure context is required by several storage/file APIs.
- Quota, eviction, persistence grants, private mode, and ITP differ by browser.
- OPFS is origin-private and quota-managed.
- File System Access is not uniformly available; file input fallback remains
  necessary.
- Third-party iframes face cookie blocking, storage partitioning, and Storage
  Access prompts.
- Cache API depends on origin storage and often service worker architecture.

Test strategy:

- Deterministic unit tests for cache policy and quota error handling.
- Real browser smoke for `navigator.storage.estimate()`,
  `persisted()`, `persist()`, IndexedDB bounded writes, OPFS bounded writes,
  Cache API put/delete, local/session storage limits, and file picker fallback.
- Manual Safari/iOS for quota, ITP, private mode, standalone web app mode, and
  embedded WebView-like hosts.
- WPT references for IndexedDB, Storage, Service Worker Cache, and File API.
- Bounded destructive tests only; never fill a user profile.

Tarstate row/result/diagnostic suggestions:

- `storage_policy_rows`: estimate, persisted, persistResult, private mode hint
  if observable, storage bucket/lifetime policy.
- `storage_resource_rows`: idb, opfs, cache, local/session, file handles.
- `storage_effect_results`: open, write, read, delete, export, import.
- Diagnostics: `quota_exceeded`, `persistence_denied`, `evicted_or_missing`,
  `private_mode_limited`, `itp_inactivity_risk`, `storage_access_denied`,
  `file_handle_revoked`.

Explicit non-goals:

- Treating `navigator.storage.estimate()` as capacity planning.
- Storing the only durable copy of user-visible documents in origin-private
  browser storage.
- Depending on third-party cookies for core app state.

### Networking, Streams, Realtime, Background Transfer

APIs in this family include fetch, CORS, streams, WebSocket, WebTransport,
WebRTC data channels, EventSource, Beacon, background sync, background fetch,
and connectivity events.

Likely Patchpit use cases:

- Patch sync, collaborative replay, asset loading, fixture fetches, telemetry,
  and deterministic network-lab traces for drop/reorder/backpressure.
- Worker-driven streaming parsers and asset pipelines.
- Royal remote scene or media feeds only after the basic sync path is stable.

Fit model:

- `fetch` requests are effect intents when they cross app-host policy; pure
  local test fixtures can stay ordinary helpers.
- WebSocket/WebTransport/WebRTC connections are opaque resources with bounded
  event streams and backpressure rows.
- CORS, credentials, CSP connect policy, and mixed-content policy are host
  policy diagnostics.
- Background sync/fetch are optional app-shell capabilities, not core
  correctness mechanisms.

Browser gates:

- Secure context for many modern transport APIs.
- CORS controls response visibility; CORP/COEP affects embeddability under
  isolation.
- CSP `connect-src` can block connections.
- WebTransport support is uneven and requires HTTP/3 server support.
- WebRTC has permission, ICE, network privacy, and enterprise policy surfaces.
- Background sync/fetch availability is limited and mobile/browser dependent.
- Offline/online events are hints, not transport truth.

Test strategy:

- Deterministic fake transport harness for ordering, retry, idempotency, and
  backpressure.
- Real browser e2e with local same-origin and cross-origin fixture servers for
  CORS and credential modes.
- WebSocket echo e2e; WebTransport/WebRTC manual or browser-matrix gated tests.
- Stream cancellation and abort tests for `AbortController` and backpressure.
- WPT references for Fetch, Streams, WebSocket, EventSource, WebRTC, and Service
  Worker integration.

Tarstate row/result/diagnostic suggestions:

- `network_resource_rows`: fetch job, socket, transport, rtc peer, event source.
- `network_event_rows`: opened, message, stream chunk, retry, close, error.
- `network_backpressure_rows`: queue depth, bytes pending, dropped/coalesced.
- `fetch_result_rows`: status, opaque/cors/basic response type, timing id.
- Diagnostics: `cors_failed`, `csp_blocked`, `mixed_content_blocked`,
  `offline_hint`, `backpressure_dropped`, `reconnect_scheduled`,
  `transport_unsupported`, `credentials_policy_denied`.

### Workers, Threads, Worklets, Shared Memory, OffscreenCanvas

APIs in this family include Dedicated Worker, SharedWorker, ServiceWorker,
Worklets, AudioWorklet, Paint/Layout/Animation Worklets, OffscreenCanvas,
SharedArrayBuffer, Atomics, structured clone, transferables, and broadcast
channels.

Likely Patchpit use cases:

- Tarstate query/evaluator workers, sync workers, asset decode workers, Royal
  layout/planning workers, input coalescing, and optional worker renderer
  backends.
- Service worker app shell, cache policy, navigation preload, and offline
  fixture harnesses.
- SAB rings for bounded numeric lanes after fallback paths are proven.

Fit model:

- Worker instances are opaque resources with lifecycle intents and message
  event streams.
- Service worker registration, scope, state, cache, and update lifecycle are
  app-host policy rows plus effect results.
- SAB and OffscreenCanvas are backend transport details, not app-visible state.
- Worklets are renderer/media backend seams; they should not appear as generic
  app capabilities until a workload needs them.

Browser gates:

- Secure context for service workers and several worker-adjacent APIs.
- Module worker support, SharedWorker support, and worklet support vary by
  browser.
- Service worker scope, update, controller, and cache behavior are asynchronous
  and origin-scoped.
- SAB requires cross-origin isolation on the web.
- `Atomics.wait` is worker-only; main-thread waits need `waitAsync` or a
  message fallback.
- OffscreenCanvas context support differs by browser and context type.

Test strategy:

- Unit tests for message protocols and serialization.
- Browser e2e for worker spawn/post/terminate, transferables, BroadcastChannel,
  SharedWorker availability, and ServiceWorker install/activate/update.
- Isolation e2e for SAB success and non-isolated fallback.
- OffscreenCanvas smoke with nonblank frame checks and main-thread fallback.
- Event spam/fuzz harness for worker message ordering, dropped events, and
  termination races.

Tarstate row/result/diagnostic suggestions:

- `worker_resource_rows`: kind, script URL hash, module/classic, status.
- `worker_message_events`: direction, sequence, size, accepted/rejected.
- `service_worker_rows`: scope, installing/waiting/active, controller,
  navigationPreload.
- `shared_memory_rows`: isolated, sabAvailable, atomicsMode, fallbackMode.
- Diagnostics: `worker_spawn_failed`, `message_clone_failed`,
  `transfer_detached`, `service_worker_update_waiting`,
  `cross_origin_isolation_required`, `offscreen_canvas_unsupported`,
  `worker_terminated`.

### Rendering, Graphics, Media, Capture, Animation

APIs in this family include Canvas2D, ImageBitmap, WebGL/WebGL2/extensions,
WebGPU, WebXR, WebCodecs, WebAudio, MediaDevices/getUserMedia, Screen Capture,
MediaRecorder, MediaSource, Picture-in-Picture, Web Animations, CSS Typed OM,
and requestAnimationFrame.

Likely Patchpit use cases:

- Royal 2D/3D renderer backends, chargrid rendering, glTF preview, texture and
  asset pipelines, media inspection, screen-share import, audio graph examples,
  animation probes, and GPU benchmark harnesses.

Fit model:

- Canvas, WebGL, WebGPU, WebXR, WebAudio, MediaStream, WebCodecs, and PiP
  objects are opaque resources.
- Royal authoring data remains pure scene rows/descriptors; GPU/media handles
  stay backend-owned.
- Renderer capabilities, extension support, context loss, device loss, frame
  stats, and media track state are observed rows.
- High-rate frame, audio, and media events are streams or backend metrics, not
  Tarstate hot-loop rows unless coalesced.

Browser gates:

- Secure context for WebGPU, WebXR, media capture, screen capture, WebCodecs in
  several environments, and many media device APIs.
- User activation and permission prompts for camera, mic, display capture,
  autoplay audio, PiP, and XR sessions.
- WebGL context creation can fail or be blocked; context loss is normal.
- WebGPU adapter/device availability depends on hardware, browser, flags, and
  device loss.
- WebXR needs device/runtime support and permissions; it should not drive early
  architecture.
- Screen capture is top-level/user activation sensitive and browser-specific.

Test strategy:

- Deterministic fake renderer and fake media adapters for unit tests.
- Real browser GPU smoke: Canvas2D, WebGL1, WebGL2, extension probes, context
  loss, nonblank frames, timer-query fallback, and readback checks.
- WebGPU and WebXR as gated/manual or Chromium-first tests until project need is
  clear.
- Media manual/e2e with fake devices where automation supports them; Safari/iOS
  manual for capture and playback policies.
- WPT references for Canvas, WebGL, WebGPU, Media Capture, Screen Capture,
  WebCodecs, WebAudio, and Web Animations.

Tarstate row/result/diagnostic suggestions:

- `renderer_capability_rows`: backend, context type, extensions/features,
  isolated, offscreen, worker.
- `frame_stats_rows`: frame id, raf gap, draw count, upload bytes, first
  nonblank, context lost/restored.
- `media_resource_rows`: stream id, tracks, constraints, muted/ended, capture
  surface kind.
- `codec_rows`: encoder/decoder support, configure result, dropped frames.
- `audio_rows`: context state, sample rate, worklet availability, latency.
- Diagnostics: `context_lost`, `device_lost`, `extension_missing`,
  `gpu_adapter_unavailable`, `media_permission_denied`,
  `capture_surface_denied`, `autoplay_blocked`, `codec_unsupported`,
  `xr_unavailable`.

Royal seam:

- Canvas2D/WebGL/WebGPU/WebXR are renderer backends. They should be tested and
  exposed through backend capability rows, not promoted into Tarstate public app
  state.

### Input, Drag/Drop, Sensors, Device State

APIs in this family include pointer, mouse, keyboard, touch, composition/IME,
drag/drop, wheel, pointer capture, pointer lock, gamepad, geolocation, device
orientation/motion, Generic Sensor, vibration, battery status where available,
and virtual keyboard.

Likely Patchpit use cases:

- Royal selection/picking, game-table interactions, keyboard shortcuts, text
  editing, drag/drop import, pointer-locked 3D tools, gamepad demos, and manual
  device/sensor labs.

Fit model:

- Pointer/keyboard/touch/wheel events are bounded event streams, coalesced
  before Tarstate.
- Pointer capture and pointer lock are effect intents with observed state rows.
- Drag/drop and file input produce opaque file resources.
- Sensors, geolocation, gamepad, vibration, battery, and virtual keyboard are
  optional observed rows/effect intents with platform diagnostics.

Browser gates:

- Pointer lock is transient-activation and policy gated.
- Pointer capture depends on active pointer state and target element lifecycle.
- Keyboard shortcuts conflict with browser/OS reserved shortcuts.
- Drag/drop file exposure varies by browser and sandbox.
- Geolocation, sensors, orientation, and motion are secure-context,
  permission-policy, prompt, and mobile-platform sensitive.
- Battery Status is reduced or unavailable in many browsers for privacy.
- Vibration is mobile/browser dependent and may be ignored.

Test strategy:

- Unit tests for coalescing, key binding policy, and drag payload parsing.
- Browser e2e for pointer capture, coalesced events, keyboard focus, drag/drop
  fixture files, and pointer lock allowed/denied.
- Manual mobile Safari/iOS and Android for touch, orientation, motion,
  vibration, virtual keyboard, and geolocation prompts.
- Event spam/fuzz harness for pointer/key ordering, missed capture, focus loss,
  and IME composition.
- WPT references for Pointer Events, Pointer Lock, UI Events, Gamepad,
  Geolocation, and Sensors.

Tarstate row/result/diagnostic suggestions:

- `input_event_windows`: pointer/key/touch/wheel summary windows.
- `pointer_state_rows`: captured element resource, locked element resource,
  buttons, pointer type.
- `drag_resource_rows`: files/items/types, accepted/rejected, sandbox source.
- `sensor_rows`: type, available, permission, sample rate, last reading.
- `gamepad_rows`: connected, id hash, axes/buttons counts, timestamp.
- Diagnostics: `input_dropped`, `focus_lost`, `pointer_capture_lost`,
  `pointer_lock_denied`, `reserved_shortcut`, `geolocation_denied`,
  `sensor_unavailable`, `battery_api_unavailable`.

### Permissions, Identity, Credentials, Payments, Notifications

APIs in this family include Permissions API, Credential Management, FedCM,
WebAuthn, Payment Request, Payment Handler, Notifications, Push, Badging,
Contacts Picker where available, and related browser account/payment surfaces.

Likely Patchpit use cases:

- Diagnostics for capability availability and permission state.
- WebAuthn/FedCM/payment experiments only when product sign-in or purchase flows
  exist.
- Notifications/push/badging for installed/offline app shell work, not core
  document state.

Fit model:

- Permissions are observed rows with caveats, because `navigator.permissions`
  does not cover every API consistently.
- Identity, credential, authenticator, payment, notification, and push handles
  are host-owned resources behind effect intents.
- App code receives result rows and opaque user/session/payment ids only when a
  host policy permits it.
- Payment, FedCM, WebAuthn, push, and notifications are phase 3 manual-gated
  capabilities.

Browser gates:

- Secure context is common.
- Top-level context and Permissions Policy matter.
- WebAuthn and FedCM require real browser ceremony and cannot be reduced to
  deterministic unit tests.
- Payment Request depends on user agent support, payment methods, user setup,
  and region/browser policy.
- Notifications and Push require permission, service workers, and mobile/OS
  integration. iOS support has install-mode constraints.
- Permissions API states can be `prompt`, `granted`, or `denied`, but support
  and naming vary.

Test strategy:

- Unit tests only for result row mapping and host policy reducers.
- Browser smoke for permission query support and denied paths.
- Manual WebAuthn/FedCM/payment/push/notification checklists with fake adapters
  for CI.
- WPT references for Permissions, WebAuthn, Credential Management, Payment
  Request, Notifications, Push, and Badging.

Tarstate row/result/diagnostic suggestions:

- `permission_rows`: name, state, querySupported, source frame, delegated.
- `credential_effect_results`: created, retrieved, conditional UI unavailable,
  mediation.
- `payment_effect_results`: canMakePayment, showed, completed, aborted.
- `notification_rows`: permission, subscription, badge count, service worker.
- Diagnostics: `permission_query_unsupported`, `permission_denied`,
  `credential_ceremony_cancelled`, `authenticator_unavailable`,
  `payment_method_unavailable`, `notification_denied`,
  `push_subscription_failed`.

Explicit non-goals:

- Building a fake identity or payment system inside Tarstate.
- Treating permission rows as authority. Actual API calls remain the authority.

### Security, Privacy, Policy, Observability

APIs and policies in this family include CSP, Trusted Types, SRI, mixed-content
policy, referrer policy, Reporting API, Network Error Logging where available,
Performance Timeline, Navigation/Resource/User Timing, Long Tasks, Event
Timing, Layout Instability, memory measurement APIs, console/error reporting,
privacy/fingerprinting reductions, and browser extension/privacy modes.

Likely Patchpit use cases:

- Capability lab policy matrix.
- Renderer, storage, sync, and worker diagnostics.
- Performance acceptance gates for Royal and chargrid.
- Proving browser policy failures become rows rather than leaked exceptions.

Fit model:

- Security policy is app-host policy rows plus diagnostics.
- Performance APIs are observed rows/events; high-rate entries are coalesced and
  sampled.
- Error/reporting endpoints are app-host integration, not app logic.
- Privacy-budget/fingerprinting-sensitive APIs should be conservative probes
  with missing/rounded data treated as normal.

Browser gates:

- CSP can block scripts, workers, WASM, eval, inline style, connects, images,
  media, frames, and reports.
- Trusted Types is Chromium-centered and requires explicit policy.
- Reporting API delivery is browser and endpoint dependent.
- Performance entries can be reduced, rounded, missing, or gated by same-origin
  and timing allow headers.
- Memory APIs are limited and often Chromium-only.
- Cross-origin isolation affects timer precision and SAB, but also asset/embed
  behavior.

Test strategy:

- Header fixture server for CSP, Trusted Types, mixed-content, referrer, CORP,
  COOP, COEP, and Timing-Allow-Origin.
- Browser e2e for blocked script/worker/connect/image/frame and corresponding
  diagnostics.
- Performance harness for rAF gaps, Long Tasks, User Timing, Resource Timing,
  Navigation Timing, first nonblank frame, and layout shifts.
- Manual browser matrix for reporting endpoint delivery and privacy-reduced
  metrics.
- WPT references for CSP, Reporting, Performance Timeline, Long Tasks, and
  timing specs.

Tarstate row/result/diagnostic suggestions:

- `security_policy_rows`: CSP mode, trusted types, mixed content, referrer,
  isolated, policy source.
- `policy_violation_events`: blockedURI category, directive, disposition,
  reportOnly.
- `performance_rows`: nav timing, resource timing summaries, user marks,
  measures, long tasks, layout shifts, event timing where available.
- `privacy_rows`: timer precision class, memory support, reduced data flags.
- Diagnostics: `csp_blocked`, `trusted_types_violation`,
  `mixed_content_blocked`, `timing_redacted`, `metric_unavailable`,
  `reporting_delivery_unknown`, `fingerprinting_surface_limited`.

### Install, Offline, App Shell, Handlers

APIs in this family include Web App Manifest, install prompts,
`beforeinstallprompt`, service worker app shell, navigation preload, protocol
handlers, file handlers, share target, shortcuts, launch handler, window
controls overlay, and badging.

Likely Patchpit use cases:

- Installed Patchpit shell, offline document/cache behavior, fixture app shell,
  file open/import, share target import, protocol links, and update prompts.

Fit model:

- Manifest and install state are app-host policy rows.
- Install prompt is a gated effect intent with manual/browser-specific results.
- File/protocol/share handlers are app-host integration points that turn launch
  data into opaque file/url/share resources.
- Service worker and cache policy remain separate from document durability.

Browser gates:

- Secure context and service worker are usually required for install/offline.
- Install prompt APIs differ by browser; Safari has separate install behavior.
- File/protocol/share handlers are Chromium-led and install-mode dependent.
- Navigation preload depends on service worker support and registration state.
- Offline support is cache-policy-dependent and can be evicted.

Test strategy:

- Static manifest validation and deterministic routing tests.
- Browser e2e for service worker registration, app shell load, navigation
  preload, cache hit/miss, update waiting, and offline simulation.
- Manual install checks for Chrome, Edge, Safari macOS, iOS/iPadOS standalone,
  and Android.
- WPT references for Web App Manifest and Service Workers where possible.

Tarstate row/result/diagnostic suggestions:

- `app_shell_rows`: manifest URL, display mode, installed hint, service worker
  state, offline ready.
- `install_prompt_results`: available, shown, accepted, dismissed,
  unsupported.
- `launch_resource_rows`: protocol, file, share, shortcut, window mode.
- `offline_cache_rows`: cache version, asset count, hit/miss, update waiting.
- Diagnostics: `install_prompt_unavailable`, `manifest_invalid`,
  `service_worker_unsupported`, `cache_evicted`, `offline_route_missing`,
  `handler_unsupported`.

## Out Of Scope Unless A Product Slice Needs Them

- Raw browser handles in Tarstate rows or React app props.
- Generic "support every Web API" abstraction.
- General-purpose untrusted third-party app hosting without a sandbox and policy
  model.
- Device APIs as a default feature: Serial, HID, USB, Bluetooth, NFC, Contacts,
  and ambient sensors should start as manual diagnostics only.
- Battery Status as a product dependency.
- Background Fetch and Periodic Background Sync as correctness dependencies.
- WebXR, WebGPU compute, and advanced WebCodecs pipelines in the first
  capability-lab phases.
- Payment, FedCM, WebAuthn, Push, and Notifications without a real product
  ceremony and manual browser matrix.
- Using cross-origin isolation globally before auditing embeds, popups, CDN
  resources, images, fonts, workers, WASM, and glTF assets.

## First Capability Lab Expansions

Top 10 APIs or behaviors to test first:

1. Fullscreen intent/result rows with activation, unsupported, denied, and
   browser rejection paths.
2. Popup/window-open rows with allowed, blocked, opener severed, and focus
   return paths.
3. Clipboard read/write text and rich clipboard probes with activation and
   permission diagnostics.
4. Pointer lock plus pointer capture/lost-capture rows.
5. Iframe sandbox and Permissions Policy matrix with `postMessage` event rows.
6. COOP/COEP/CORP/CORS isolation matrix with SAB available/fallback rows.
7. Storage smoke: estimate, persisted, persist request, IndexedDB bounded
   write, OPFS bounded write, Cache API put/delete.
8. Network smoke: fetch CORS modes, abortable stream, WebSocket echo,
   EventSource reconnect, and fake backpressure traces.
9. Worker smoke: Dedicated Worker, transferables, SharedWorker if available,
   ServiceWorker install/update, and SAB fallback.
10. Renderer/media smoke: Canvas2D, WebGL1/2 context loss, OffscreenCanvas
    availability, fake media capture denial, and WebGPU/WebCodecs support probes
    as gated diagnostics.

Decomplection after this phase:

- Keep policy probes, effect interpreters, stream coalescers, and renderer
  backend probes in separate modules when implementation starts.
- Do not expand `ResourceKind` by mirroring every Web API one-for-one. Prefer
  families such as `frame`, `storage`, `network-link`, `worker`, `renderer`,
  `media-stream`, `input-stream`, `device`, `identity`, `payment`, and
  `app-shell`.
- Keep result code mapping shared and tiny; put API-specific details in
  `valueJson` or typed extension rows only after tests prove the field is
  useful.

## Roadmap

### Phase 0: Inventory And Test Harness

- Add docs and a capability matrix fixture, not product behavior.
- Build a browser fixture server that can vary HTTPS, iframe origin, sandbox,
  Permissions Policy, CSP, CORS, CORP, COOP, and COEP headers.
- Add a common result/diagnostic vocabulary and browser probe row fixtures.
- Add manual Safari/iOS checklists beside automated Playwright/Chromium tests.
- Point selected tests at matching WPT directories for expected edge cases.

Decomplection:

- The harness should be independent from the React capability lab UI.
- Header policy fixtures should be data-driven; browser feature interpreters
  should not hide host policy setup.

### Phase 1: User Activation Effects

- Implement or simulate fullscreen, popup, clipboard, pointer lock, and file
  picker/drop rows.
- Record activation before/after each intent.
- Add negative tests for no activation, sandbox denial, top-level denial, and
  Permissions Policy denial.

Decomplection:

- Keep activation capture near the event adapter.
- Keep effect dispatch batched and low-frequency.
- Do not send high-rate input through effect intent rows.

### Phase 2: Storage, Network, Worker Isolation

- Add storage policy smoke, bounded write tests, and eviction/recovery
  diagnostics.
- Add fetch/CORS/stream/WebSocket/EventSource tests and deterministic network
  trace rows.
- Add worker/service-worker lifecycle rows, transferables, SAB isolation/fallback
  checks, and OffscreenCanvas support probes.

Decomplection:

- Separate storage lifetime policy from storage mechanics.
- Separate sync protocol correctness from browser transport choice.
- Keep SAB and OffscreenCanvas as backend details with clone/transfer fallbacks.

### Phase 3: Device, Media, Payment, Identity

- Add media capture, screen capture, WebAudio, WebCodecs, notifications/push,
  WebAuthn/FedCM, Payment Request, and hardware API probes as manual-gated
  labs.
- Prefer fake adapters in CI and explicit manual checklists for real ceremonies.
- Only promote an API from diagnostic probe to supported product capability
  after a product flow exists.

Decomplection:

- Device/media/payment/identity flows should each own their permission and
  result mapping.
- Do not create a generic prompt manager that hides browser-specific ceremony.

## Top Browser Policy Risks

1. Transient activation is short-lived and consumed by gated calls, so batched
   user actions can fail in surprising ways.
2. Permissions Policy and iframe sandboxing can block APIs that exist and work
   top-level.
3. Cross-origin isolation enables SAB but can break embeds, popups, workers,
   fonts, images, WASM, glTF assets, and third-party services.
4. CORS and CORP failures affect both network visibility and isolated
   subresource embeddability.
5. Storage quota, persistence, eviction, private mode, and WebKit ITP make
   origin storage recoverable rather than durable.
6. Safari/iOS support gaps and install-mode behavior affect storage, file,
   push, capture, pointer lock, fullscreen, WebGPU, WebTransport, and device
   APIs.
7. Service worker update and cache state can lag behind app expectations.
8. CSP and Trusted Types can block dynamic script, worker, WASM, style, connect,
   image, media, and frame behavior.
9. Browser privacy protections can round, redact, or remove timing, memory,
   device, and storage signals.
10. Payment, identity, notification, push, hardware, and media prompts are real
    user ceremonies; automated tests need fake adapters and manual gates.

## Impact On Tarstate, Capability Lab, And Royal

Tarstate:

- Keep browser APIs at the adapter boundary. Tarstate should index and project
  rows, not own `Window`, `Navigator`, DOM, GPU, media, device, payment, or
  credential handles.
- Favor observed rows, result rows, and diagnostics for policy surfaces.
- Use effect intents for low-frequency imperative operations.
- Use bounded event streams for pointer, network, worker, media, and performance
  entries.
- Avoid raw per-frame/per-event relations unless a coalescer or materialized
  source has already reduced them.

Capability lab:

- The next schema pressure is not "more handles"; it is richer gate and result
  rows: secure context, top-level/frame, permission, activation, policy,
  isolation, support, and platform.
- The lab should become a policy matrix first, then a feature showcase.
- Keep unsupported and denied paths first-class. They are the product reality
  for much of the modern web platform.

Royal:

- Canvas, WebGL, WebGPU, WebXR, WebCodecs, MediaStreams, AudioContexts, and
  OffscreenCanvas remain renderer/backend resources.
- Renderer capability rows should expose backend support, context/device loss,
  extensions/features, worker/offscreen mode, frame gaps, and first nonblank
  status.
- COOP/COEP and CORS/CORP are Royal asset pipeline concerns as much as app-host
  policy concerns.
- High-rate input, transform, frame, and media streams need coalescing or
  backend-local counters before Tarstate sees them.

## Acceptance Criteria For Future Support

Before a capability graduates from research to supported lab behavior:

- It has a row/result/diagnostic mapping that does not leak raw handles.
- It records relevant gates: secure context, activation, permission, top-level
  or frame policy, isolation, worker availability, and platform support.
- It has a denied/unsupported test, not only a happy path.
- It has a browser e2e or manual matrix when automation cannot cover the real
  prompt/ceremony.
- Its hot-path data is bounded or coalesced.
- Its ownership is clear: app-host policy, effect interpreter, event stream,
  opaque resource registry, or renderer backend.
