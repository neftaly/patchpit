# Patchpit V2 Stub Spec

This is the first cut of scope for the fresh v2 stub on `main`.

The goal is not to rebuild v1. The goal is to prove the smallest coherent
Patchpit shape:

Patchpit is a document-backed workspace OS where apps are launchable by data,
running app state is inspectable, and app behavior goes through a host boundary.

## In Scope

### 1. Monorepo Shape

Claim:

The root is orchestration only. Apps live in `apps/*`; reusable contracts and
state logic live in `packages/*` only after their boundaries are proven.

Current stub packages:

- `apps/patchpit-shell`: Vite shell smoke app.

Proof:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- package-boundary test proving reusable packages do not depend on app packages
  when reusable packages exist

### 2. App Host Boundary

Claim:

Apps should receive capabilities/context from a host boundary, not import shell
internals.

Minimum contract:

- `fs.list(path)`
- `fs.read(path)`
- `fs.write(path, value)`
- `fs.watch(path)`
- `runtime.launch(shortcutOrRef, context?)`
- `runtime.close(instanceId)`
- `runtime.focus(instanceId)`
- `docs.open(url)`
- `docs.update(url, change)`
- `diagnostics.report(diagnostic)`

Proof:

- first define the contract in tests or local fixture code
- GUI shell imports the contract, not implementation internals, once the
  boundary is proven enough to extract
- a test can create a fake host and run app flows against it

### 3. Namespace And Runtime Paths

Claim:

The v2 stub should make ownership and lifetime visible through conventional
paths before solving the final filesystem.

Minimum paths:

- `/patchpit/apps`: durable app shortcuts/app refs.
- `/patchpit/run/apps`: live app instances and app state refs.
- `/patchpit/run/presence`: ephemeral peer/app presence.
- `/patchpit/run/diagnostics`: validation and runtime diagnostics.

Proof:

- namespace fixture normalizes absolute paths
- tests can address these paths without shell internals
- future shell fixture exposes these paths as data

### 4. App Shortcuts And Instances

Claim:

Adding an app should be a data operation, not a JSX/window-manager edit.

Minimum data distinctions:

- app shortcut: launcher/taskbar entry
- app ref: source of app behavior
- pinned app ref: immutable/fixed version
- app instance: running window/session
- app state document: state owned by app
- runtime mount: inspectable place for current instance

Proof:

- one shortcut record can become a launchable app
- launch creates one app instance record
- instance appears under `/patchpit/run/apps`
- close removes or explicitly marks runtime state

### 5. Minimal GUI Surface

Claim:

The GUI only needs enough surface to prove the app/runtime model.

Minimum GUI:

- a shell
- a plain taskbar/launcher
- visible open app instances
- hideable file/sidebar surface
- one simple GUI app

Proof:

- launcher renders from app shortcut data
- window/taskbar renders from app instance data
- sidebar can inspect `/patchpit/*` paths

## Explicitly Out Of Scope

These are real concerns, but they should not enter the first stub unless they
block an in-scope proof.

- final filesystem semantics
- full sandbox security
- WebContainer or real Node process execution
- WASI command runtime
- encrypted sync / Beelay / Keyhive cryptographic policy
- large-file storage / Sedimentree integration
- full Relic-style Tarstate runtime
- Automerge/Immer package extraction
- terminal app acceptance slice
- Royal preview/rendering integration
- rich app marketplace/package management
- complete window manager polish
- production deployment

## Deferred But Protected

These are not implemented first, but the stub should avoid blocking them:

- iframe or worker app hosting
- app refs from HTTPS or Automerge module URLs
- pinned immutable app refs
- app-owned schemas/defaults/migrations
- authorization state as queryable data, including proof records supplied by an
  auth layer and denial diagnostics
- Automerge documents as durable relation sources composed with ephemeral
  presence sources
- presence as ephemeral queryable data
- Tarstate materialized views, watched query deltas, constraints, and aggregate
  invalidation
- structured object streams in the terminal
- diagnostics as queryable runtime data

## Acceptance Matrix

| Claim | Workflow | Data Shape | Owner | Proof |
| --- | --- | --- | --- | --- |
| App shortcuts are data | Add shortcut and see launcher item | `AppShortcut` | shell/workspace | unit test |
| Apps launch through host | Click shortcut | `AppInstance` | app host/runtime | unit test |
| Runtime is inspectable | Read `/patchpit/run/apps` | runtime mount | namespace/runtime | unit test |
| Apps own app state | launch creates/attaches state ref | app state doc ref | app package | app fixture test |
| Bad data is visible | invalid shortcut becomes diagnostic | diagnostic record | app host/runtime | negative test |
| Presence is queryable | join workspace row to peer focus | durable + ephemeral relations | Tarstate/source adapter | unit test |
| Permission denial is explainable | unreadable linked row reports reason | diagnostic/proof record | runtime/source adapter | unit test |
| Packages stay clean | reusable packages do not import apps | manifests/imports | monorepo | boundary test |

## First Implementation Order

1. Keep the root v2 monorepo passing `typecheck`, `test`, and `build`.
2. Restore a small `packages/tarstate` core with functional query constructors,
   source diagnostics, and optional presence joins.
3. Add tests for durable workspace rows joined to ephemeral presence rows, plus
   one composed-source fixture and one permission/visibility diagnostic fixture.
4. Define concrete `AppShortcut`, `AppRef`, and `AppInstance` types.
5. Add an in-memory namespace fixture with `/patchpit/apps`,
   `/patchpit/run/apps`, and `/patchpit/run/diagnostics`.
6. Implement launch/focus/close against a fake `PatchpitAppHost`.
7. Add tests for app shortcut launch and runtime instance visibility.
8. Add the minimal shell/launcher view after the data contract is testable.
