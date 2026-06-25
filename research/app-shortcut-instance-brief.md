# App Shortcut And Instance Brief

This is a working brief for the first non-Tarstate Patchpit v2 stub slice:
adding an app to the workspace OS and launching it into an inspectable running
instance.

It uses three evidence sources:

- current Patchpit prototype code
- current Patchpit v2 stage-zero research
- prior Probability/sdk/Patchwork work around URL-carried app/plugin context and
  importable document modules

It is not a final architecture document.

## Current Product Claim

Patchpit v2 should prove itself when a new app can be added to the OS by
declaring one app URL/ref, then:

- appears in the launcher/taskbar
- opens in a window
- persists app instance metadata
- creates app-owned state
- exposes that state as an inspectable document under a runtime path such as
  `/patchpit/run/apps`

This is the smallest concrete OS-shaped claim. It does not require final
filesystem semantics, sandbox security, Tarstate posture, or plugin capability
design.

## Current Prototype Evidence

Useful invariants:

- `apps/window-manager/src/index.tsx` is already close to the right level. It
  receives `launchableApps`, `openAppInstances`, `onLaunchApp`, and
  `onClosePane` as props. It does not own persistence policy.
- `apps/patchpit-shell/src/shell/app-instance-store.ts` already creates an app
  state document for a launched pane and links it into the runtime apps folder.
- `packages/workspace/src/model.ts` already models panes as `{ id, program,
  state, subject }`.
- `appInstanceStateFileName(instanceId, stateUrl)` already makes runtime app
  state filesystem-visible.
- `apps/patchpit-shell/src/shell/fixture.ts` already represents built-in
  programs as program files with `id`, `title`, and `entry`.

Couplings to reject for v2:

- `WorkspaceProgramId` is a closed union of current built-ins.
- `apps/patchpit-shell/src/App.tsx` hardcodes `launchableApps`.
- `packages/workspace/src/programs.ts` mixes the app registry with current
  built-in programs.
- `packages/workspace/src/app-state.ts` owns program-specific default state.
  App state schemas/defaults should move to apps if app-owned state remains the
  direction.
- Program identity, app shortcut identity, pinned version identity, and running
  instance identity are currently too easy to conflate.

## Prior Work Evidence

### Probability/sdk

Probability plugins launch from URLs carrying `HashProps`:

```ts
type HashProps = {
  doc: `automerge:${string}`
  sync: [string, ...string[]]
  delegation?: string
}
```

That prior work argues for:

- app launch context as data
- app URLs that can be opened outside the host
- explicit document/sync/delegation context
- validation at the edge of URL parsing
- plugins as peers that receive only what the launch URL carries

Patchpit does not need to copy `HashProps`, but it should preserve the same
shape of thought: app launch is a URL/ref plus context, not a special shell
function call.

### Tiny Patchwork / Pushwork

Tiny Patchwork evidence says documents can point at importable module code using
metadata such as `["@patchwork"].suggestedImportUrl`, and modules can be normal
folder-doc packages.

That argues for:

- document payloads staying simple
- behavior living in app/tool modules
- module URLs being executable trust boundaries
- plain HTTPS URLs and Automerge folder/module URLs both staying valid sources
- pinned URLs meaning release-like artifacts, not taskbar shortcuts

Patchpit should not make `https:` taboo. It should distinguish external app
refs, cached/imported artifacts, and pinned immutable versions.

## Naming

Use these terms distinctly:

- **App shortcut**: a launcher/taskbar item. It points at an app ref and may
  include label/icon/order metadata.
- **App ref**: the source of app behavior. It may be `builtin:*`, `https:*`, an
  Automerge module/folder URL, or a future package ref.
- **Pinned app ref**: an app ref fixed to immutable content, such as an
  Automerge URL with heads or a content-addressed artifact.
- **Launch context**: data passed to the app when launching, such as target doc,
  sync endpoints, delegation, selected file, or desired initial route.
- **App instance**: a running window/pane with instance ID, app ref, launch
  context, state URL, title/icon, and lifecycle metadata.
- **App state document**: durable state owned by the app instance or app. The
  shell may create and mount it, but the app owns schema/defaults/migration.
- **Runtime mount**: filesystem-visible place where the shell exposes running
  app instance state, probably `/patchpit/run/apps`.

Do not use "pinned" to mean "shown in the taskbar". In Patchpit, taskbar
membership is a shortcut/launcher concern. Pinning should mean fixing content or
version.

## Candidate Data Shapes

These are sketch shapes for review, not final TypeScript.

```ts
type AppShortcut = {
  id: string
  label: string
  icon?: string
  appRef: AppRef
  launchContext?: LaunchContext
  order?: number
}
```

```ts
type AppRef =
  | { kind: 'builtin'; id: string }
  | { kind: 'https'; url: string }
  | { kind: 'automerge-module'; url: string; heads?: string[] }
  | { kind: 'package'; specifier: string; version?: string }
```

```ts
type AppInstance = {
  id: string
  shortcutId?: string
  appRef: AppRef
  title: string
  icon?: string
  stateUrl: string
  launchContext?: LaunchContext
  status: 'opening' | 'open' | 'error' | 'closed'
}
```

```ts
type LaunchContext = {
  subject?: { kind: 'doc'; url: string } | { kind: 'selection'; paneId: string }
  sync?: string[]
  delegation?: string
  route?: string
}
```

## Ownership Rules

Shell owns:

- shortcut registry location
- launcher/taskbar visibility
- app instance lifecycle
- window placement/focus/close
- runtime mount paths
- app host selection: built-in, iframe, worker, or future sandbox

Workspace owns:

- open pane/window metadata
- layout
- selected/current pane
- app instance refs that affect workspace restoration

App owns:

- state schema
- default state
- migration/normalization
- title/icon derivation when dynamic
- app-specific commands and validation

Filesystem/runtime owns:

- exposing state documents under stable inspectable paths
- folder/file docs
- URL keys and object/file identity

Security/delegation owns later:

- whether the app may read/write a document
- whether an app ref is trusted
- whether an app can run same-origin, iframe, worker, or remote

## Prototype-Good-Enough V2 Slice

The first v2 stub does not need remote sandboxed apps. It can use built-ins
while proving the contract that will later support URLs.

Minimum implementation shape:

- app shortcuts are data, not hardcoded JSX
- adding one shortcut record makes it appear in the launcher
- launching creates an app instance record
- launching creates or attaches an app state document
- the instance state document appears under `/patchpit/run/apps`
- the window manager renders open app instances from data
- closing removes the runtime mount or marks the instance closed
- app-specific state defaults live with the app, not in workspace core

This can still render only built-in apps. The key is that the built-in renderer
is an app host adapter, not the app registry itself.

## Acceptance Gate

The first acceptance test should be phrased as a user workflow:

Can Patchpit add a new built-in app by registering one app shortcut/ref record,
show it in the launcher, launch it into a window, create an app-owned state doc,
show that state doc under `/patchpit/run/apps`, close the window, and leave the
shell/window-manager free of app-specific state schema?

More mechanical proof gates:

- import test: `apps/window-manager` has no dependency on workspace,
  filesystem, Automerge, or built-in app packages
- import test: workspace model does not import built-in app implementations
- fixture test: a shortcut file/doc normalizes to a launchable app
- app launch test: launch creates instance metadata and state doc
- runtime path test: state doc appears under `/patchpit/run/apps`
- close test: runtime mount is removed or instance status changes explicitly
- negative test: invalid app ref becomes launcher/app error state, not a thrown
  shell crash

## Open Questions

- Should app shortcuts live in a filesystem folder such as `/patchpit/apps`, a
  workspace doc field, or both?
- Should `/patchpit/run/apps` contain only live instances, or also closed
  instance records for session history?
- Does each app instance always get a fresh state doc, or can shortcuts point at
  reusable app state?
- Is app state per instance, per app, per workspace, or app-defined?
- Should a shortcut carry default launch context, or should launch context be
  produced by the shell at click time?
- What is the minimal built-in app host adapter shape?
- What app ref shape should plain HTTPS apps use before sandboxing exists?
- How much should v2 preserve Tiny Patchwork's document `suggestedImportUrl`
  model versus Probability's explicit plugin URL hash model?
- What is the first external-app proof: open in a new tab, iframe, worker split,
  or same-origin module import?

## Current Bias

For the first v2 stub:

- keep the window manager dumb
- make shortcuts data
- make app refs URL/ref-shaped even if only built-ins work at first
- make app instances explicit
- make app state inspectable
- keep app state schemas with apps
- keep runtime paths visible
- delay sandbox/security, but preserve launch context and app host boundaries

The most important non-negotiable is that adding an app should not require
editing the window manager or workspace core.
