# Patchpit V2 Stage Zero Review

This is a living research note for applying the stub review rubric to Patchpit
v2. It is not the v2 architecture doc yet, and it should not become an
implementation history.

Patchpit is the larger system: a monorepo and OS/workspace shell. Tarstate is a
component inside it: the algebra/query/write layer, currently expressed through
core functions, Automerge adapters, link helpers, and React hooks.

## Current Working Definition

Patchpit is intended to be a document-backed workspace OS:

- The shell owns app launch, app instances, runtime state, selection, context
  menus, theme, and built-in app composition.
- Workspace state owns panes, selections, app instance metadata, and runtime
  mount conventions.
- Filesystem state owns folder/file documents, file IDs, folder URL keys, and
  filesystem writes.
- Tarstate owns the algebra for querying and writing across immutable document
  snapshots.
- Tarstate adapters connect that algebra to Automerge snapshots, links, writes,
  and React subscriptions.
- Built-in apps include file explorer, file viewer, bash terminal, JSON document
  editor, state explorer, and Royal previews.
- Royal is currently vendored as a rendering/preview dependency, not part of
  Patchpit's core state model.

The v2 review should treat those as separate ownership questions, not one large
"app architecture" question.

## Fresh V2 Posture

V2 will be built fresh. The existing codebase is evidence, not a template.

Historical information belongs in the v2 review only when it proves one of
these things:

- a product invariant that v2 must preserve
- a coupling that v2 should deliberately reject
- a proof obligation that v2 needs before it can stand on its own
- a user workflow that defines what Patchpit is
- a boundary or naming distinction that prevents the fresh design from
  collapsing into current implementation habits

Everything else is archaeology. It can help explain why a question exists, but
it should not be copied into the v2 stub.

The current `TODO.md` handoff goals translate into candidate invariants rather
than implementation instructions:

- Shell, filesystem, workspace, and app runtime ownership should remain
  separable.
- Pure workspace state should not depend on a React provider.
- App instance state should be discoverable through explicit runtime paths such
  as `/patchpit/run`.
- Bundle cost should be attacked first through simpler ownership and exports,
  not only build configuration.

## Stage Zero Question

The first review question is:

What is the smallest v2 stub that can preserve Patchpit's core idea while
making ownership, persistence, and proof obligations explicit?

That is narrower than "design Patchpit v2". It means classifying candidate
claims before committing to implementation.

## Current V2 Review Narrative

The review is now converging on a prototype-good-enough v2 stub, not a complete
replacement OS.

The strongest current product claim is:

Patchpit v2 should make it easy to add an app to the workspace OS by giving the
shell a URL-addressed app shortcut, launching that app into a window, and making
its app state inspectable as a document.

That claim implies several review rules:

- The file sidebar should survive v2. It is useful, but it should be framed like
  a text-editor sidebar: shippable, hideable, and not the whole OS metaphor.
- The window manager can remain deliberately plain. A minimal Windows 95-style
  bar is enough if it proves app shortcuts, open app instances, and selected
  windows.
- "Pinning an app" needs naming discipline. In Patchpit, an app shortcut is a
  launcher/taskbar entry pointing at an app or program URL. A pinned version is
  a URL with a specific immutable version/head. A running window is an app
  instance. These should not collapse into one overloaded word.
- Apps should own their own state documents. The shell/workspace should know
  app URL, instance ID, title/icon metadata, state URL, and mount path; app
  schemas/defaults/normalizers belong with the app.
- Other apps may read into an app's state document through explicit document
  APIs. Writes should remain mediated by app/host validation. Security,
  authorization, and encrypted sync are not v2 stub blockers.
- The filesystem does not need a final answer before v2 starts. The prototype
  only needs enough file/doc/runtime shape to make app state and app shortcuts
  inspectable.
- Tarstate is a library inside the monorepo, not a Patchpit primitive. If its
  API is not understandable yet, the v2 review should require examples and
  benchmarks before elevating it to a central contract.
- Automerge and Immer placement can stay inside the monorepo for now. The bar is
  pristine package boundaries, not premature extraction.
- The v2 stub should stop when the next change does not prove a claim. Do not
  add experimental features just because they are interesting.

## Stage Zero Decisions

These are not final architecture decisions. They are enough to cut the v2 stub
without losing the current direction.

### App Shortcuts And Running Apps

Patchpit should distinguish:

- App shortcut: a launcher/taskbar item that points at an app URL or built-in app
  ref.
- App URL: the source of app behavior. For v2 this may be a built-in program ref,
  an Automerge module URL, or a plain HTTPS URL depending on the sandbox story.
- App instance: a running window/pane with an instance ID and app state URL.
- Pinned artifact/version: a URL that fixes content/version, such as an
  Automerge URL with heads. This is not the same as a taskbar shortcut.

The v2 acceptance gate is:

Can a new app be added by declaring/registering one app URL/ref, then appear in
the taskbar/launcher, launch into a window, persist instance state, and expose
that state under `/patchpit/run/apps`?

### Sidebar And Window Manager

The file sidebar remains in scope, but it is a hideable work surface rather than
the primary Patchpit model. V2 should ship it like a code editor sidebar:
available by default or menu, but not required to understand app launch.

The window manager can be a plain app bar for now. It should prove:

- available app shortcuts
- open app instances
- current/selected window
- close/focus/launch flows
- no hidden persistence policy inside the UI component

### App State Ownership

The v2 bias is app-owned state:

- An app defines its own state schema, defaults, normalizer, and migration story.
- Workspace records pane/window metadata and the app instance's state URL.
- Runtime state records where the instance is mounted.
- Other apps can inspect/read state through URL/document APIs.
- Cross-app writes should be explicit and validated by the host or target app
  contract before entering Automerge.

The current `packages/workspace/src/app-state.ts` shape is useful evidence, but
program-specific state living in the workspace package is probably a v1 coupling
to reject for fresh v2.

### Filesystem Deferral

Filesystem v2 can be delayed if the stub preserves these minimum facts:

- Folder/file docs are explicit data, not shell component state.
- Folder entries are keyed by stable document identity, not display names.
- Runtime app state is visible under a stable path such as `/patchpit/run/apps`.
- Plain HTTPS URLs remain supported as external app/template/asset references
  where that avoids forcing large or remote data into Automerge docs too early.
- Automerge URLs with heads mean pinned/release-like content; bare Automerge URLs
  mean live/current content.

Sedimentree, large-file storage, encrypted sync, and final filesystem semantics
can remain future work. The v2 stub only needs to avoid pretending those
questions are solved.

### Sandbox Review Gate

Sandboxing is probably too early to ship as a full feature, but it is not too
early to preserve the boundary.

The review should compare two web-native host patterns:

- Browser iframe sandbox: app UI runs in a nested browsing context with sandbox,
  Permissions Policy, CSP, and `postMessage` as the bridge.
- Worker/runtime split: app or plugin logic runs without DOM access and talks to
  a host/UI surface by structured messages.

Figma's plugin model is the closest practical reference found so far: plugin
code runs in a minimal sandbox that can access the model, plugin UI runs in an
iframe with browser APIs, and the two sides communicate by messages. That maps
well to Patchpit's possible split between app/document authority and browser UI
capability.

V2 should not claim security from this yet. It should only keep enough shape
that untrusted apps can later run behind message-passing APIs instead of direct
repo/document access.

### Tarstate Review Gate

Tarstate currently appears to work, but the API is not yet reviewable enough to
be treated as an OS primitive.

The v2 stance:

- Tarstate core remains a library and query/write algebra candidate.
- React hooks are one consumption layer.
- Automerge support is an adapter.
- Immer is implementation/library support for ergonomic immutable updates where
  useful, not a storage boundary.
- Tarstate can stay in the monorepo. Extraction is easy later if package
  boundaries, examples, and import rules stay clean.

Before v2 elevates Tarstate, it needs:

- a small understandable API guide
- one real app example
- a benchmark against realistic Patchpit state
- import tests proving the core is not coupled to Automerge or React
- an answer for where Automerge snapshot/source/write code lives relative to
  React hooks
- a decision on whether Tarstate is a high-level relational query API, a
  low-level tuple/index substrate, or a bridge between both

### Benchmark Gate

The v2 stub should include benchmarking as a first-class proof type.

Minimum useful benchmark targets:

- Tarstate evaluator/query behavior on realistic document graphs.
- App launch and state inspection with several open windows.
- Terminal rendering/viewport behavior, since this already has bench scripts.
- Filesystem tree/sidebar behavior with enough docs to expose loading mistakes.
- Cross-app state read paths, including stale/live document behavior.
- Storage-adapter comparisons if Tarstate grows a tuple/index layer: in-memory,
  IndexedDB/OPFS, Automerge snapshots, and any future worker-backed store.
- Subscription invalidation cost: how many queries/components update for one
  document write?

Do not require perfect benchmarks before v2 starts. Require named workflows and
scripts so performance claims are not based on impressions.

## Claim Categories To Sort

### Product Purpose

Candidate purpose statement:

Patchpit should be a local-first document workspace where applications are
document-backed, inspectable, linkable, and composable through a shared shell.

Questions:

- Is Patchpit primarily an OS-like shell, a document graph, an app runtime, or a
  developer workbench?
- Which workflows must be first-class in v2: browsing files, editing documents,
  terminal work, state inspection, game/renderer previews, app composition?
- Is "local-first" a hard invariant or an implementation preference?
- Is "adding an app to the OS" primarily adding a shortcut to an app URL,
  registering a local built-in, importing a document-backed module, or all of
  those behind one contract?

### Capabilities To Re-Earn

Candidate capabilities are not kept because the current implementation has
them. They are re-earned only if they express the product purpose or a required
workflow.

- Launch built-in apps from the shell.
- Add a new app shortcut from an app URL/ref without editing window-manager
  internals.
- Persist shell/workspace/app state in Automerge-backed documents.
- Show filesystem documents in file explorer and file viewer.
- Hide/show the file sidebar without changing the persistence model.
- Edit JSON-like document content.
- Query document state through Tarstate React hooks.
- Write document changes through Tarstate write boundaries.
- Run a terminal app with bounded rendering/viewport cost.
- Preview Royal scenes/assets through file viewer without merging Royal into
  Patchpit core.
- Build and deploy the shell with CI source-map checks.

Each capability needs a future acceptance gate: test, smoke script, manual
browser check, benchmark, or explicit deletion from scope.

### Couplings To Reject

Likely v2 rejection targets, if confirmed by source review:

- Shell provider code owning pure workspace state policy.
- App instance naming, runtime mount paths, and filesystem layout being decided
  in multiple packages.
- Workspace owning app-specific state schemas/defaults/normalizers.
- File explorer/viewer depending on workspace concepts instead of filesystem
  and app-state contracts.
- Tarstate React hooks carrying Automerge-specific assumptions.
- Tarstate Automerge package depending on React when the non-React adapter
  surface should be usable independently.
- Preview/rendering dependencies becoming part of the shell's core state model.
- Terminal app internals exposed as public app API because other packages
  needed a local helper.
- Bundle and source-map policy being solved only in build config rather than by
  simpler package boundaries.

These should be checked against code before becoming final v2 anti-invariants.

### Invariants

Candidate invariants to test and refine:

- The root package remains orchestration only.
- Apps live under `apps/*`; reusable state/model/runtime code lives under
  `packages/*`.
- Shell state, workspace state, filesystem state, app runtime state, and app
  document state have separate owners.
- Runtime app instance state is discoverable through explicit filesystem paths,
  especially under `/patchpit/run`.
- App shortcuts point at app URLs/refs; app instances point at app state URLs.
- App-owned state is readable by other apps through document APIs, but writes are
  mediated by app/host validation before entering Automerge.
- Tarstate core is pure and storage-agnostic.
- Automerge integration is an adapter layer, not the algebra.
- React hooks are a presentation/subscription layer, not the source of truth.
- Built-in apps consume explicit app contracts; they do not reach through shell
  internals.
- Heavy preview/rendering integrations are optional app/viewer capabilities.
- Bundle-size work starts by simplifying ownership and exports before tuning
  build config.

### Proof Obligations

Candidate proof gates:

- Package boundary tests for shell, workspace, filesystem, Tarstate core,
  Tarstate adapters, and built-in app packages.
- Import tests proving Tarstate core does not import Automerge or React.
- Import tests proving Automerge adapters are usable without React where
  intended.
- Tests proving app instance state file naming and mount paths.
- Tests proving app shortcut declaration/registration is enough to launch a new
  app.
- Tests proving workspace pane normalization policy is explicit and not
  fallback-driven.
- Tests proving filesystem owns folder URL keys and entry object IDs.
- Smoke tests for shell launch, app launch, file explorer, file viewer, JSON
  editor, terminal, state explorer, and Royal preview.
- Benchmarks or scripts for terminal output/viewport behavior.
- Benchmarks or scripts for Tarstate against realistic Patchpit app/file graphs.
- CI checks for source maps and package build boundaries.

## Initial Boundary Observations

These observations come from the current source tree. They are useful only if
they become invariants, anti-invariants, or proof gates for a fresh v2.

- `apps/patchpit-shell/src/shell/state.tsx` is a coordination hotspot: shell
  UI state, filesystem documents, workspace panes, app state documents,
  selection, context menus, and app instance state meet there. V2 should decide
  which of those are real shell responsibilities.
- `apps/patchpit-shell/src/shell/app-instance-store.ts` makes app instances
  filesystem-visible by creating workspace app state documents and runtime app
  files. V2 should either keep that as an invariant or replace it with an
  explicit runtime registry model.
- `packages/workspace/src/*` owns useful workspace concepts, but it also
  reaches into Automerge repo handles for app state documents. V2 should decide
  whether workspace is a pure model package or a persistence-aware package.
- `packages/tarstate/src/*` is the cleanest candidate for a storage-agnostic
  algebra boundary. V2 should protect that with import tests.
- `packages/tarstate-react/src/*` expresses Tarstate through hooks. V2 should
  keep that as a subscription/presentation layer, not the definition of the
  algebra.
- `packages/tarstate-automerge/src/*` is the adapter boundary to inspect most
  carefully because Automerge and React concerns may need to split further.
- `packages/filesystem/src/*` already owns folder/file document shape, folder
  URL keys, object IDs, and filesystem writes. V2 should either make that a
  hard filesystem invariant or move the whole policy somewhere more explicit.
- Built-in app registration in `apps/patchpit-shell/src/shell/builtin-*`
  lazily composes apps, but shell context remains broad. V2 should define the
  smallest app contract before implementing apps.
- `apps/window-manager/src/index.tsx` is already close to the right level: it
  receives launchable apps and open instances as props. V2 should keep it as UI
  plumbing, not persistence.
- `apps/patchpit-shell/src/App.tsx` currently hardcodes `launchableApps`. V2
  should turn that into an explicit shortcut registry/app URL contract.
- `packages/workspace/src/app-state.ts` currently contains program-specific app
  state shapes. V2 should move those concerns to apps if app-owned state remains
  the direction.
- `apps/bash-terminal` and `packages/tarstate` already have benchmark scripts.
  V2 should use that pattern rather than leaving performance as manual feel.
- CI currently proves typecheck, lint, build, and source-map checks. V2 also
  needs a proof matrix for package imports, runtime mount paths, shell smoke,
  app launch, document writes, and workflow/security checks.

## External Research Anchors

These are anchors for the v2 review, not authorities to copy blindly.

- Ink & Switch end-user programming argues for tools that can be inspected and
  modified in place, and for composable toolchains that let end users move from
  use to customization without a hard mode switch:
  https://www.inkandswitch.com/end-user-programming/
- Ink & Switch Potluck frames documents as gradually becoming interactive
  software, which fits Patchpit's app-state-as-document direction:
  https://www.inkandswitch.com/potluck/
- Ink & Switch Cambria is the reminder that schema/version compatibility is a
  product problem in decentralized software, not something to leave to shotgun
  parsing:
  https://www.inkandswitch.com/cambria/
- Probability's Patchwork notes point to the current I&S direction:
  Tiny Patchwork/Pushwork use normal local folders, root Automerge docs, file
  docs, live bare URLs, pinned URLs for artifacts, and `suggestedImportUrl` as a
  code/module trust boundary.
- Probability's Automerge project notes support keeping HTTPS templates while
  adding Automerge project/release docs. That is evidence against making
  `https:` taboo in Patchpit v2.
- Probability's CRDT/schema notes say Keyhive/Beelay answer who can write, not
  whether a write satisfies an app schema. Host/app validation remains the
  practical gate.
- Browser platform anchors: iframes provide nested browsing contexts with
  sandbox restrictions, CSP can restrict script/resource execution, `postMessage`
  is the cross-origin bridge, and Web Workers provide message-based execution
  without DOM access.
- Figma plugin docs are a practical sandbox analogy: privileged model access and
  browser UI capability are split across a sandboxed main environment and an
  iframe UI connected by messages.
- Academic/local-first anchor: LoRe argues that local-first apps need explicit
  safety properties because decentralized/concurrent interaction makes
  correctness hard to reason about informally.
- Chet Corcos' `tuple-database` is a strong Tarstate research anchor. Its useful
  claims are: local-first embedded data, reactive queries, application-owned
  schemas, direct tuple indexes, sync/async storage adapters, transaction
  composition, and benchmarks across in-memory/SQLite/LevelDB-style storage:
  https://github.com/ccorcos/tuple-database
- Chet's Datalog and triple database prototypes point in the same direction:
  shared query logic can run on client and server, EAV/triple stores are a small
  substrate for graph/relational queries, and query subscriptions can be derived
  from the same query machinery used for evaluation:
  https://github.com/ccorcos/datalog-prototype
  https://github.com/ccorcos/triple-database
- `wotbrew/relic` is the closest Tarstate analogue found so far: functional
  relational programming for Clojure(Script), explicitly tied to "Out of the
  Tar Pit". Its useful claims are normalized relations, query values as data,
  indexed SQL-style queries, incremental materialized views, watched query
  deltas for reactive UI, relational constraints, optional direct indexes, and
  TPCH/property-test style proof pressure:
  https://github.com/wotbrew/relic
- `substrait-io/substrait` is a lower-weight Tarstate anchor: it shows the value
  of making query plans/data transformations explicit and portable, but Patchpit
  should not adopt a full standards-shaped plan format unless Tarstate outgrows
  its current small algebra:
  https://github.com/substrait-io/substrait
- `johnmn3/tau.alpha` was a false lead for relational algebra, but a useful
  performance/sandbox warning: workers, `postMessage`, SharedArrayBuffer,
  serialization, append-only logs, and structural diffs are real browser
  performance choices if Tarstate evaluation moves off the main thread:
  https://github.com/johnmn3/tau.alpha
- Jon Work's FIFO article is relevant because it treats hypermedia as a
  structure-preserving textual data language rendered by an interchangeable
  shell. That is close to Patchpit's direction of documents as data plus apps as
  viewers/runtimes, rather than one-off web pages:
  https://jon.work/fifo/
- Jon Work's "File Systems: The Original Hypermedia" is even closer to the
  Patchpit sidebar/filesystem question. Its core claim is that directories and
  files already satisfy much of the hypermedia model; the missing high-level
  interface qualities are inline rendering and ordering. That maps directly to
  Patchpit's possible future file sidebar: keep it as a file explorer now, but
  leave room for it to become an ordered, inline, document-like surface later:
  https://jon.work/og

## Research Passes To Run

Use these as independent review passes before writing a final v2 stub.

Focused briefs started so far:

- `research/tarstate-api-brief.md`
- `research/app-shortcut-instance-brief.md`
- `research/filesystem-runtime-shape-brief.md`

### Shell And Runtime State

Question:

Where is the line between shell UI, app registry, app instance store, runtime
mounts, and persisted workspace state?

Files to review first:

- `apps/patchpit-shell/src/shell/*`
- `packages/workspace/src/*`
- `apps/window-manager/src/index.tsx`

Expected output:

- Minimum shell workflows.
- Rejected shell/workspace couplings.
- Proposed package-boundary proof gates.
- App shortcut/app URL/app instance naming.

### App Shortcut And Sandbox Surface

Question:

What is the smallest contract for adding an app by URL/ref without committing to
the final plugin security model?

Files to review first:

- `apps/patchpit-shell/src/App.tsx`
- `apps/patchpit-shell/src/shell/builtin-app-registry.tsx`
- `apps/patchpit-shell/src/shell/app-instance-store.ts`
- `apps/window-manager/src/index.tsx`
- `packages/workspace/src/programs.ts`

Expected output:

- App shortcut document/ref shape.
- App instance lifecycle proof gate.
- Browser sandbox assumptions that remain future work.
- Message boundary that would later support iframes/workers.

### Filesystem And App Documents

Question:

What does filesystem own, and what belongs to apps or workspace?

Files to review first:

- `packages/filesystem/src/*`
- `apps/file-explorer/src/*`
- `apps/file-viewer/src/*`
- `packages/json-doc-editor/src/index.tsx`

Expected output:

- Filesystem invariants.
- App document ownership rules.
- Path, URL key, and object ID proof gates.

### Tarstate Algebra

Question:

What is Tarstate's minimal algebra, and which layers are adapters?

Files to review first:

- `packages/tarstate/src/*`
- `packages/tarstate-links/src/*`
- `packages/tarstate-automerge/src/*`
- `packages/tarstate-react/src/*`
- `apps/todo-demo/src/*`

Expected output:

- Core algebra invariants.
- Adapter ownership boundaries.
- React hook scope.
- Query/write parity gates.
- API-understanding gap and minimum guide/example.
- Real-world benchmark plan.
- Position relative to tuple/index systems like Chet Corcos'
  `tuple-database`: keep Tarstate as declarative query algebra, add a low-level
  tuple index substrate, or keep indexing/storage as adapters.

### Tarstate Performance And Indexing

Question:

What performance shape does Tarstate need before it is safe to use for real
Patchpit/Probability workflows?

Sources to review first:

- `packages/tarstate/src/*`
- `packages/tarstate/scripts/evaluator-bench.ts`
- `packages/tarstate/scripts/evaluator-fuzz.ts`
- `packages/tarstate-automerge/src/*`
- Chet Corcos `tuple-database`
- Chet Corcos `datalog-prototype` / `triple-database`
- `wotbrew/relic`, especially materialization, change tracking, constraints,
  indexes, TPCH tests, and property tests
- `substrait-io/substrait`

Expected output:

- Whether Tarstate needs explicit query plans beyond the current compiled plan.
- Whether Tarstate should grow materialized queries and incremental maintenance,
  or remain a one-shot evaluator with reactivity handled by adapters.
- Whether relational constraints belong in Tarstate, app schema validation, or a
  future host validation layer.
- Whether app code should maintain direct indexes for hot queries.
- Whether reactive invalidation should be range/subscription based, relation
  based, document based, or adapter-specific.
- Whether Tarstate should expose direct index access for specialized work, as a
  tuning escape hatch rather than the normal app API.
- Storage adapter benchmark matrix.
- Main-thread versus worker evaluation rule.
- Serialization budget for Automerge snapshots, worker messages, and IndexedDB.
- Aggregate/materialized-view benchmark cases, especially where full recompute
  would be visibly wasteful.
- Correctness test discipline: property tests plus at least one TPCH-like query
  workload if Tarstate starts claiming relational algebra semantics.
- Real Probability benchmark cases, not synthetic-only evaluator loops.

### Sandbox And Browser Runtime Research

Question:

What can the browser give Patchpit now for app sandboxing, and what should stay
out of the prototype?

Sources to review first:

- MDN iframe `sandbox`, `credentialless`, CSP, Permissions Policy.
- MDN `Window.postMessage()`.
- MDN Web Workers.
- Figma plugin runtime/UI docs.
- Probability plugin/schema-integrity notes.

Expected output:

- Minimal app host boundary that can later become iframe/worker-backed.
- Claims Patchpit should not make yet.
- CSP/Permissions/message validation checklist for later.
- Decision on whether v2 prototype apps run same-origin, iframe, worker, or
  built-in only.

### UI Shell Fit

Question:

What UI surface is enough to prove the OS without over-designing it?

Files to review first:

- `apps/window-manager/src/index.tsx`
- `apps/patchpit-shell/src/App.tsx`
- `apps/file-explorer/src/*`
- `packages/workspace/src/model.ts`

Expected output:

- Minimal app bar/window manager contract.
- Hideable file sidebar requirement.
- Menu/visibility state owner.
- Manual browser smoke checklist.

### Built-In Apps

Question:

Are built-in apps independent apps with explicit contracts, or shell-internal
components?

Files to review first:

- `apps/bash-terminal/src/*`
- `apps/file-explorer/src/*`
- `apps/file-viewer/src/*`
- `apps/state-explorer/src/*`
- `apps/patchpit-shell/src/shell/builtin-*`

Expected output:

- App API boundaries.
- Public versus internal exports.
- App launch/state proof gates.

### Royal Preview Boundary

Question:

Is Royal a preview app dependency, a renderer capability, or a core Patchpit
dependency?

Files to review first:

- `apps/file-viewer/src/royal-preview.tsx`
- `apps/file-viewer/src/royal-offscreen-root.ts`
- `apps/patchpit-shell/src/royal-jsx.d.ts`
- `vendor/royal`

Expected output:

- Optional rendering boundary.
- Build and submodule proof gates.
- Rejected coupling between renderer state and Patchpit OS state.

### CI And Release Surface

Question:

What does CI actually prove, and what remains local/manual?

Files to review first:

- `.github/workflows/*`
- `scripts/smoke.mjs`
- `scripts/check-sourcemaps.mjs`
- root `package.json`

Expected output:

- Hosted CI proof classes.
- Manual/browser proof classes.
- Missing security/workflow checks.

## First V2 Stub Shape

Do not create this until the research passes above have more evidence, but the
likely stub shape is:

- `docs/patchpit-v2-architecture.md`
- `docs/patchpit-v2-proof-matrix.md`
- `research/patchpit-v2-stage-zero.md`
- `scripts/check-patchpit-v2-stage-one.mjs`
- package-boundary acceptance tests
- shell/workspace/filesystem/Tarstate proof skeletons

The architecture doc should not absorb this research note. The research note is
where unresolved distinctions stay visible while the v2 stub is still forming.

## Open Questions

- Is the name "Patchpit" the OS/workspace, the whole monorepo, or both?
- What is the minimal user-facing v2 workflow that proves the system?
- Should app runtime state always be represented as filesystem-visible docs?
- Which app state is private app state versus shell/workspace state?
- Should Tarstate write boundaries become the only way apps mutate Automerge
  state?
- Does Tarstate own links, or are links a separate document graph layer?
- Is Tarstate understandable enough to be a central v2 contract, or should it
  remain an internal library until examples/benchmarks make the API obvious?
- Should `packages/tarstate-automerge` split into non-React Automerge adapter
  code plus React consumption hooks?
- Is Immer merely an implementation convenience for app/update ergonomics, or
  does it need a named package boundary?
- Should Tarstate learn from tuple databases by exposing direct indexes/range
  scans, or should it remain a declarative query layer over relation sources?
- Should query reactivity be driven by precise read ranges, relation names,
  Automerge object paths, or whole-document invalidation?
- What is the first real Probability workload that Tarstate must benchmark:
  plugin state lookup, scene/material lookup, asset manifests, filesystem tree,
  or cross-app control state?
- Should Tarstate grow Relic-like materialized queries, change tracking, direct
  indexes, and relational constraints, or keep those as later adapter/app
  responsibilities?
- What counts as adding an app: taskbar shortcut, installed app registry entry,
  document-backed module import, or all of these?
- Should plain HTTPS app/asset URLs be treated as first-class external refs,
  import sources, cacheable artifacts, or only compatibility inputs?
- Which sandbox shape is acceptable for v2 prototype apps: built-in only,
  same-origin iframe, cross-origin iframe, worker, or Figma-style split?
- Should the file sidebar stay a conventional explorer forever, or should v2
  preserve enough ordering/inline-rendering hooks for a later Jon-style
  filesystem-as-hypermedia surface?
- Should Royal remain vendored, become a submodule-only dependency, or be
  abstracted behind a preview protocol?
- Which capabilities must exist before the v2 stub counts as Patchpit?
- What benchmark or smoke test is required before replacing the current shell?

## Immediate Next Step

Run the six research passes above and convert findings into one of:

- architecture invariant
- proof matrix row
- acceptance test skeleton
- review script assertion
- research assumption
- open question

Do not write the final v2 docs until the first pass has sorted enough claims to
avoid turning current implementation accidents into v2 doctrine.
