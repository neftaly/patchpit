# Patchpit Sandboxed App Host

Patchpit apps should run behind the same runtime boundary whether they are
first-party apps, installed apps, command runners, or later third-party packages.
This document defines the sandboxed app host shape and records the
decomplection checks for state ownership, capabilities, process placement, and
app rendering.

The app host is not a new state owner. It is a runtime client with
`clientKind: 'sandbox'` that runs app code in a sandbox and talks to Patchpit
through scoped app services. Automerge remains canonical durable state.
Tarstate remains the relation/projection and validation layer. Runtime policy
remains the authority service.

The GUI behavior is the product contract. Filesystem layout, manifest shape,
runner placement, and capability protocols should serve that behavior, not the
other way around.

## Goals

- Make installed apps feel like OS apps: launchable tools managed by installed
  first-party apps, not privileged React components wired into the shell.
- Run app code in a secure sandbox by default.
- Keep app reads and writes behind scoped runtime services instead of raw
  `Repo`, `DocHandle`, shell props, or host objects.
- Keep the first app-management GUI focused on lifecycle: install, quarantine,
  allow run, disable, sessions, storage, updates, and diagnostics.
- Keep compositor/window-manager enforcement, focus, and placement host-owned.
  Apps such as Launcher may render chrome in reserved surfaces, but they do not
  become the trusted compositor.
- Keep File Picker, Viewer, Hello World, and future apps on the same app-host
  boundary without a big-bang rewrite.

## Non-Goals

- Do not move Automerge handles, repo ownership, or canonical document writes
  into app code.
- Do not make Tarstate the durable store for app state.
- Do not expose raw `RuntimeClient`, `Repo`, `DocHandle`, `MessagePort`, DOM
  nodes, xterm instances, `DataTransfer`, or broad storage/network objects to
  apps.
- Do not design the fine-grained capability permission UI in the first slice.
  The first GUI shows sandbox and lifecycle state.
- Do not define a marketplace, package installer, or supply-chain trust model
  here.
- Do not promise that browser iframe isolation is equivalent to OS process
  isolation.

## Current Slice

Current apps are installed as package folders under `/apps`. Each package
contains a manifest doc plus package resources. The implemented manifest fields
are `manifestVersion`, `id`, `name`, `version`, `entry`, `entryKind`, `handles`,
`surfaces`, and `schemas`. The shell derives launcher items from those app
package manifests. Both `app.launch` and document routing resolve app package
manifests before creating sessions.

`WindowManagerAppHost.renderSurface` is now a manifest-driven host boundary:
the host resolves `context.app` through `/apps` and runs filesystem JavaScript
module and HTML document entries through `SandboxAppHost` when `entryKind` is
`module` or `html`. The seeded `hello-world` app is the canonical minimal real
Vite-built sandbox package: its built `dist` files are inserted under
`/apps/hello-world`, and the iframe runner uses `sandbox="allow-scripts"` with
no same-origin authority. The seeded File Picker and Viewer packages are
runnable filesystem HTML packages built from their app entry modules.

The active seeded app set is File Picker, Viewer, and Hello World. Terminal is
archived under `archive/terminal-shell-compat`; it is no longer an active
runtime, shell-compat, or app-host path.

The SharedWorker is still the boot gate, not the owner of Automerge handles or
runtime operations. The in-process bootstrap runtime still owns the first
runtime slice.

The sandbox service bridge currently exposes host-scoped views:
`window.patchpit.services.view({ name: 'launch' })` returns launch-session
metadata chosen by the host, and
`window.patchpit.services.view({ name: 'resource' })` returns a narrow
serializable view of the current session URL resolved from the host's filesystem
projection. In the File Picker app/session scope,
`window.patchpit.services.view({ name: 'file-picker' })` returns the mounted
tree, file type rules, and picker state, and `window.patchpit.services.act(...)`
admits only host-scoped `filePicker.selectUrl`, `filePicker.toggleFolder`,
`route.preview`, and `route.open` requests. Apps cannot supply `rootUrl`,
`contextId`, `surfaceId`, or other authority scope fields; action targets such
as `url` are interpreted inside the host-attached File Picker session scope.
`open` remains reserved for a later slice and returns unsupported-service
errors.

Remaining app-host work:

- define shared library and import-map handling for installed app packages;
- expand remaining scoped `view`, `act`, and `open` services behind the sandbox
  bridge;
- move runtime ownership from the in-process bootstrap client into the worker;
- add local OS runner placement for command runners and later app hosts.

## UX Principles

Patchpit should feel like an OS with app management, not a project folder full
of executable documents.

- App management belongs in a Settings app that is installed and launched like
  other first-party apps.
- Document work belongs in file/document surfaces.
- Deep runtime inspection belongs in trusted runtime diagnostics and
  `/system/runtime`, not in the installed app model.
- Users should not need to know `/apps`, `/system/apps`, or capability protocol
  details to answer normal questions such as "what can this app access?".
- Paths, manifests, schemas, and grants should remain inspectable for advanced
  users and developers.
- Sandboxed apps should be secure by default. The first GUI should show sandbox
  status and app lifecycle state, not expose a fine-grained capability editor.
- Fine-grained capability and permission UX is deferred until the capability
  model is implemented.
- Updating or removing an app should never imply deleting user documents.
- XR, desktop, and later surfaces should share the same app-management behavior
  even when presentation differs.

## Ownership Boundaries

| Concern | Owner | Rule |
| --- | --- | --- |
| Durable documents | Automerge docs | Canonical state lives in linked Patchpit documents. |
| Relation views and validation | Tarstate | Projections, schema checks, indexes, and write lenses are derived machinery. |
| Launch, routing, policy | Runtime | Runtime admits app launches, routes documents, attaches scope, and records lifecycle. |
| Window management and placement | Compositor/window manager | Surface creation, focus, splits, previews, drag targets, reserved slots, and placement enforcement stay host-owned. |
| App semantics | App package | Apps define manifests, handlers, state schemas, and how to interpret their own state docs. |
| App code execution | Sandboxed app host | The host loads app bundles and gives them only scoped app services. |
| JavaScript authority | SES compartment | Compartments prevent ambient JS authority and constrain endowments. |
| Process and system access | Runner placement | OS sandboxing limits filesystem, network, processes, env, and killability. |

State logic belongs in the owning layer. The app host may cache or mirror data
for presentation, but it must not become canonical storage or a parallel runtime
policy service. App-owned state docs are still Automerge documents; sandboxed
apps interpret them and request changes through scoped runtime actions or ports.

## Smallest Patchpit Model

The smaller Patchpit model has four product objects:

- `Document`: an Automerge-backed durable resource. User files, app manifests,
  app state, workspace state, and diagnostics are all documents with different
  owners and visibility.
- `App`: an installed manifest plus code entry. First-party apps and later
  third-party apps use the same install, launch, sandbox, and update path.
- `Session`: a running app instance around a primary document, state document,
  or route target. This is the concept currently called `Context` in parts of
  the codebase.
- `Surface`: a compositor-managed place where one or more sessions are shown.
  Tabs, previews, focus, split layout, and reserved edge slots belong here.

Everything else should be an implementation service, projection, or diagnostic
view. Patchpit should not grow separate product concepts for plugins, widgets,
launchers, tools, panes, viewers, commands, or system apps until one of those
concepts proves it cannot be represented by the four objects above.

The smaller runtime shape is:

- one installed-app registry: app manifests under `/apps`;
- one install path: validate package, record manifest, optionally allow run;
- one launch path: route or launch creates a runtime context for an installed
  app;
- one rendering path: the app host resolves the context's manifest entry and
  creates a scoped app session;
- one trusted substrate: runtime, compositor/window manager, app host, and local
  supervisor.

Everything visible and product-shaped should be an app. File Picker, Viewer,
and Hello World are active seeded apps, not shell widgets. Future first-party
apps may receive stronger runtime grants in V0, but those grants should be
attached to their app ids and contexts, not to separate rendering paths.

The trusted substrate should stay small and non-product:

- Runtime owns manifests, policy, routing, context/session lifecycle, and
  canonical writes.
- The compositor/window manager owns surface creation, placement, focus, input
  routing, reserved slots, and teardown.
- The app host owns code loading, runner placement, sandbox setup, scope
  attachment, and revocation.
- A bootstrap install affordance exists only so an empty machine can install the
  first userland apps or run an idempotent first-run setup script.

The substrate should not contain Settings UI, Launcher UI, file browsing,
document viewing, command UI, or package catalogs. A reserved launcher edge is a
placement rule; the Launcher rendering inside it is still an app.

This removes code paths instead of adding them:

- replace hard-coded launcher specs with an installed-app projection;
- replace app-id render switches with manifest entry resolution;
- replace shell-passed app state props with scoped projections, intents, and
  capability ports;
- replace special Settings handling with a first-party app-management grant;
- replace bundled/preinstalled app lists with a first-run script that calls the
  normal installer.
- replace legacy runtime app-instance registries as sources of truth with
  derived diagnostics from workspace sessions, surfaces, and app-host runner
  state.

The app-facing API should also stay smaller than the runtime implementation
vocabulary. Apps should see:

```ts
type PatchpitAppServices = {
  view(name: string, args?: Json): ViewSubscription;
  act(name: string, input?: Json): Promise<ActionResult>;
  open(name: string, args?: Json): Promise<AppPort>;
  surface: SurfaceSession;
};
```

Runtime code may still implement views with Tarstate projections, actions with
validated intents and Automerge commits, and ports with capabilities. App code
does not need those three words in its normal API. That keeps the app SDK small
while preserving the correct ownership boundaries internally.

## Target Shape

```txt
WindowManager surface
  -> SandboxAppHost(context scope)
    -> runner placement
      -> SES lockdown + Compartment
        -> app entry activate(env)
          -> scoped app services
```

The runtime, not the app bundle, supplies scope:

```ts
type PatchpitAppEnv = {
  protocol: 'patchpit.app@1';
  appId: string;
  session: Readonly<{
    id: string;
    app: string;
    url: string;
    container: AppContainer;
  }>;
  app: PatchpitAppServices;
  surface: SurfaceSession;
};
```

`PatchpitAppServices` is not a raw `RuntimeClient`. It omits caller-controlled
scope. The host attaches `clientId`, `workspaceId`, `surfaceId`, `contextId`,
and `appId` from the launched session. Payload scope fields from the app are
invalid. `open()` is optional in the first app-host slice and becomes important
only for long-lived streams, adapters, and resource handles.

The app entrypoint is intentionally small:

```ts
export default async function activate(env: PatchpitAppEnv): Promise<PatchpitAppInstance>;

type PatchpitAppInstance = {
  close?(reason: AppCloseReason): Promise<void>;
  suspend?(): Promise<void>;
  resume?(): Promise<void>;
};
```

All host calls are async. Synchronous reads across the runtime boundary are not
part of the app API.

## Host Lifecycle

Host lifecycle is separate from app-session lifecycle. A session is the semantic
running object currently represented by `Context`; it is not an iframe, process,
pane, worker, or file.

The app host lifecycle is:

1. Runtime admits `app.launch`, `route.open`, or `route.preview` and commits the
   context/surface effect.
2. The compositor asks `WindowManagerAppHost.renderSurface` to render that
   context.
3. `SandboxAppHost` resolves the app manifest and selected runner placement.
4. The host creates or reuses a runner, then creates a session-local app
   instance.
5. The runner calls `lockdown()` before guest code if SES is enabled.
6. The host sends bootstrap data plus a scoped runtime port/fd.
7. The app entrypoint runs with `PatchpitAppEnv`.
8. On close, crash, policy change, or workspace teardown, the runtime revokes
   capabilities, closes subscriptions, rejects pending calls, and tears down or
   returns the runner to its pool.

## Manifest Shape

Manifests describe what an app is, what it can open, and what surface/state
shape it needs. They do not grant authority.

```ts
type AppManifestRunner = {
  protocol: 'patchpit.app@1';
  integrity?: string;
  osSandbox?: 'required' | 'optional' | 'not-supported';
  ses?: 'required' | 'optional';
};
```

The first app-host slice should keep manifests close to today's shape:
`manifestVersion`, `id`, `name`, `version`, `entry`, `entryKind`, `handles`,
`surfaces`, and `schemas`, with optional runner metadata. `entryKind: 'module'`
and `entryKind: 'html'` are current real sandbox paths. Fine-grained permission
declarations can be added later when Patchpit has the
capability model and UX to support them.

## Runner Placement

Runner placement is separate from app authority. The same `patchpit.app@1`
protocol should work in different placements:

| Placement | Use | Security meaning |
| --- | --- | --- |
| `browser-frame` | Browser build app surfaces. | Sandboxed iframe/CSP boundary only; no OS isolation. |
| `browser-worker` | Non-DOM app logic. | Killable worker boundary; no OS isolation. |
| `local-bwrap` | Local command runner or app logic under a supervisor. | Linux process/namespace isolation. |
| `local-webview-bwrap` | Future DOM app host under a native supervisor. | OS process isolation plus a brokered display/WebView boundary. |

A browser-only Patchpit client cannot create an OS sandbox by itself. OS-level
placement requires a trusted local supervisor process. The app protocol must not
change when placement changes.

### App Host Runner

`patchpit-app-host` is a long-lived runner for app bundles. It may be pooled by
workspace, build id, app id, and trust tier. Sharing is a performance decision,
not a security boundary: contexts in one runner can affect each other if that
runner is compromised or wedged.

Default app-host policy:

- no repo, `.git`, host home, Automerge storage, or runtime internals mounted;
- no inherited environment except explicit runtime connection metadata;
- no network by default;
- tmpfs scratch only;
- app bundle and runtime files read-only;
- inherited IPC fd or port for the scoped runtime proxy;
- lifecycle owned by the supervisor.

### Command Runner

`patchpit-command-runner` is short-lived and stricter. It is for malicious
JavaScript demos, import analysis, and similar untrusted jobs. It should use
fresh temp dirs, tighter CPU/memory/output limits, and a wall-clock timeout. It
should never share a runner with app UI contexts. Command output is untrusted
data; the trusted app surface decides how to sanitize, cap, display, and
eventually commit output.

### Bubblewrap Shape

A local Linux proof can use `bubblewrap` for `local-bwrap` placement:

- unshare user, PID, IPC, UTS, cgroup, and network namespaces;
- create a new session and die with parent;
- clear env and set only minimal `HOME`, `USER`, `PATH`, `LANG`, `TMPDIR`, and
  runtime fd metadata;
- bind app/runtime files read-only;
- mount `/tmp` and `/run` as tmpfs;
- avoid host `/tmp`, host sockets, broad home mounts, and display sockets;
- drop capabilities;
- kill the process group on timeout.

`bubblewrap` is not a VM and not a URL allow-list. Stronger deployments should
add a minimal rootfs, cgroup v2 limits, seccomp, AppArmor/SELinux/Landlock,
dedicated host users, and possibly gVisor or microVM isolation for hostile
multi-tenant code.

## SES Layer

The runner calls `lockdown()` before loading guest app code. Each app context
gets a compartment with only explicit endowments and module hooks.

Default endowments should be small:

- hardened app environment;
- attenuated console/log capability;
- text codecs if needed;
- explicit clock/random/network/media capabilities only when granted.

Do not endow `process`, `require`, `fs`, `child_process`, raw `fetch`,
`localStorage`, `indexedDB`, `SharedWorker`, `window.parent`, DOM nodes, app
state objects, or mutable host containers. Disable or omit guest `eval`,
`Function`, and dynamic import unless a specific audited app mode requires
them.

SES controls JavaScript authority. It does not provide CPU, memory, or process
containment. The runner placement must provide killability and resource limits.

## Surface Rendering

The compositor owns placement, focus, input routing, and reserved surface slots.
Apps own their rendered surface content, including first-party chrome-like apps
such as Launcher. The compositor may draw minimum trusted affordances for boot,
crash, focus, and teardown, but product UI should live in apps.

```ts
type SurfaceSession = {
  events(listener: (event: SurfaceEvent) => void): ProjectionSubscription;
  setTitle(title: string): Promise<void>;
  startDrag?(offer: { type: 'patchpit.url'; url: string; title: string }): Promise<void>;
};
```

Surface modes:

- `dom`: the app renders into an isolated iframe/WebView document.
- `canvas`: the app renders to a sandbox-owned canvas or transferred
  `OffscreenCanvas`.
- `adapter`: trusted host code renders a high-performance surface from a
  sandboxed app view model, stream, or command protocol.

`adapter` is for core surfaces whose hot path should stay local, such as xterm
rendering or large media display. It does not grant the app DOM authority. The
adapter is trusted code and must treat app messages as untrusted input.

Avoid remote-DOM protocols as the default. Send projections, intents, streams,
and capability handles instead.

### XR Presentation

XR should use the same app/session model. Launching an app into an XR
environment still creates contexts on surfaces, and the app still receives the
same scoped projections, intents, capabilities, and surface events.

XR-specific placement, scale, anchoring, gaze/controller input, focus, and
local viewport state belong to the compositor/viewport presentation layer. They
must not become app-owned durable state unless an explicit runtime action
commits a semantic app action. Apps may declare or request surface modes that
are useful in XR later, but the first app-host boundary should not define a
separate XR app API.

## Deferred Capability Layer

Fine-grained capabilities are still the right long-term authority model, but
they should not drive the first app-management GUI. V0 should treat sandboxing
as the security boundary and expose only the app services required to migrate
the core apps.

Later capability rules:

- App code receives effective grants, not requested grants.
- Every capability request is checked against runtime scope and policy.
- Ports/fds are brokered by the host; apps do not receive raw runtime internals.
- Pending requests reject on revocation, context close, policy denial, timeout,
  protocol error, or backpressure overflow.
- Structured-clone compatible data is the default payload shape.
- Large files and media should cross as handles, ranges, streams, or blob URLs,
  not full projection rows.

## State And Diagnostics

Runtime diagnostics remain runtime state. Inspectable runtime documents under
`/system/runtime` may report app-host placement, runner lifecycle, crash counts,
capability revocations, and performance metrics, but they do not make the app
host a canonical state owner.

App state docs remain under `/system/apps` or another runtime-admitted location.
They are durable documents, not the active-session registry. Active app/session
state is derived from workspace contexts/sessions plus app-host runner
diagnostics. Schema refs and relation descriptors travel through the schema
protocol. A sandboxed app that needs to read or mutate its own state does so
through app views and actions, not direct document handles.

Useful app-host diagnostics:

- runner placement and trust tier;
- app id, session/context id, surface id, and workspace id;
- startup, lockdown, compartment, and first-paint timings;
- projection payload row counts and byte sizes;
- capability open/revoke/error counts;
- output truncation and backpressure events;
- crash, timeout, and policy-denial reasons.

## GUI Product Model

The app system should be shaped from user-facing behavior first. Filesystem
locations are backing stores and inspection targets; they are not the primary
way users manage app trust, permissions, updates, or running sessions.

Patchpit should have a Settings app installed through the same app path as other
first-party apps. It presents one unified place for installed apps, handlers,
updates, quarantine, sandbox status, active sessions, storage, and diagnostics.
The runtime owns app-management authority; Settings receives scoped projections
and intents for that authority. `/apps`, `/system/apps`, and `/system/runtime`
are backing stores and diagnostics targets, not direct app privileges.

The conceptual model remains:

- user documents live in `/home`;
- installed apps live in `/apps`;
- running app session state lives under `/system/apps`.

But those paths are implementation-visible locations, not the main navigation
model. Users open documents with apps, configure apps in Settings, and inspect
runtime state from diagnostics.

### Settings App

Settings is a normal app from the rendering and sandbox-host point of view. Its
extra power is runtime policy, not a separate UI path: V0 can hard-code the
first-party app-management projections and intents it receives, and a later
capability model can make that grant explicit.

The Settings app should include an Apps area with a split layout:

- a sidebar/list of installed, quarantined, running, disabled, and update-ready
  apps;
- a detail surface for the selected app;
- a runtime/session area for active contexts and opened capabilities;
- a diagnostics link into runtime diagnostics when deeper
  inspection is needed.

For each app, Settings should show:

- name, icon, version, source, installed path, and entry;
- file/intent handlers such as "opens Markdown" or "previews images";
- declared surfaces and state types;
- sandbox status, runner placement, and whether the app is allowed to run;
- schemas and app state docs the app creates;
- active contexts using the app;
- diagnostics links into `/system/runtime`.

Useful app detail tabs:

- `Overview`: identity, source, status, handlers, surfaces, state types.
- `Sandbox`: placement, isolation status, quarantine state, crash/timeout
  history, and whether the app is allowed to run.
- `Sessions`: running contexts, surfaces, app version, runner placement, active
  session count, focus/reload/stop actions.
- `Package`: manifest, entry, schemas, assets, generated files, and source link.
- `Storage`: app instance state under `/system/apps`, with keep/archive/delete
  controls where valid.
- `Diagnostics`: runtime events, crashes, policy denials, timing, payload sizes,
  and schema mismatches.

This should feel like a Settings app experience, not a file browser or package
manager bolted onto the file picker.

### Install, Run, And Quarantine

Importing an app should stage it before it becomes routable:

```txt
imported bytes -> quarantine -> inspect package -> install -> allow run
```

"Installed" means the app is present under `/apps`. "Allowed to run" means the
user or policy allows Patchpit to launch it inside the sandbox. Quarantined apps
cannot become default handlers or auto-launch from routed documents.

Settings should make install and run state separate:

- Install records the app under `/apps`.
- Allow Run lets the app launch inside the sandbox.
- Disable prevents future launches without deleting the app package.
- Active means the app has running contexts now.

The default action for an unknown import should be to keep it quarantined.
Installation becomes available only after manifest validation succeeds.
Fine-grained permission and capability choices are not part of the first GUI.
When that model exists, it should appear in this Settings area instead of being
scattered across file picker and app launch flows.

### Document And Launcher Behavior

Document surfaces should not expose app management complexity. Opening a
document should route through handlers and app contexts:

- `Open` uses the default handler if policy allows it.
- `Open With...` shows compatible installed apps and quarantined candidates
  separately.
- `Preview` creates a temporary context.
- `Reveal Existing` focuses an existing context.

If a document requires a quarantined or disabled app, the document UI should
send the user to Settings for the app decision instead of embedding app
management controls in the file picker.

The Launcher app should show apps as launchable tools, not app package files.
Launcher may be placed in a reserved edge surface by the compositor, but it is
still an app: it reads the installed-app projection and submits launch/focus
intents. App rows can show badges for quarantined, disabled, update available,
or currently running, but deep authority controls stay in Settings.

### Updates, Removal, And State

Updates follow the same staging path as imports. Before update, Patchpit should
show source/integrity changes, handler changes, permission changes, and schema
compatibility notes. Running contexts should keep their current app version
until restart unless the user explicitly reloads them.

Removal disables or removes the manifest under `/apps`, unregisters handlers,
revokes active capabilities, prevents new launches, and leaves `/home`
documents untouched. If app instance state remains under `/system/apps`, the
user should choose whether to keep, archive, or delete it.

Removing an app should never imply deleting user documents in `/home`. It may
remove handlers, disable future launches, revoke active capabilities, and
optionally handle app-owned session state.

### Filesystem Visibility

The default file picker should center user work, not system registries.

- `/home` is the normal place users open and organize documents.
- `/apps` is visible as installed app registry data when system locations are
  shown.
- `/system/apps` is visible as running app state when diagnostics or system
  locations are shown.
- Double-clicking an app manifest should open the app detail in Settings, not
  route the manifest as an ordinary document.
- `/system/apps` state docs should open in app/session inspectors by default,
  not in the normal document viewer.

The GUI rule is: the runtime owns app-management authority; Settings is the
installed app UI for it; file surfaces own document work; trusted shell/dev
diagnostics own deep runtime inspection.

### Fresh Machine Experience

A fresh Patchpit machine should feel empty until apps are installed. The base
substrate provides only the trusted controls needed to boot, show failures, and
install the first app or run first-run setup. User-facing tools come from
installed app manifests.

The first-run setup path should be ordinary userland automation over the same
installer API a user or developer would call manually. It can install Settings,
Launcher, Files, Viewer, or a minimal demo app from explicit package locations,
but it must not introduce a bundled-app catalog, preinstalled app state, or a
second registry.

First-run flow:

1. Patchpit boots to an empty workspace with only the bootstrap install
   affordance.
2. The user, a dev command, or a first-run setup script installs a small app set,
   such as File Picker, Viewer, and a minimal demo app.
3. The installed Launcher app occupies its reserved edge surface.
4. Installed runnable apps appear in Launcher.
5. Opening a document routes through installed handlers. If no handler is
   installed, the runtime routes the user to Settings or the bootstrap install
   affordance.

Launcher should be derived from installed apps that are allowed to run, not from
hard-coded React components. In the current V0 shell, direct launcher items are
real sandbox entries with declared launch surfaces; document handlers such as
Viewer stay available through routing and `Open With...` instead of appearing as
blank launch targets.

This keeps the larger app system simple: install apps, they appear as tools,
they open documents or sessions, and Settings manages their lifecycle. A
first-run script is acceptable only if it is idempotent setup glue around that
same flow; it should not become a package manager, dependency solver, privileged
app type, or hidden source of launcher entries.

## Developer Experience

App authoring should be package-first. `/apps` is the installed registry;
source packages can live in `/home/dev/apps`, a checkout, or an imported bundle.

Example package shape:

```txt
/home/dev/apps/acme.notes/
  patchpit.app.json
  src/activate.ts
  src/ui.tsx
  schemas/*.schema.ts
  capabilities/*.mock.ts
  fixtures/minimal/
  generated/
    rows.d.ts
    schema-catalog.json
    manifest.d.ts
  dist/
    index.html
    app.js
```

The source package installs into the registry as a package folder:

```txt
/apps/acme.notes/
  manifest.am
  entries/
    app.js
```

The installed manifest should stay close to existing app manifest concepts:
`manifestVersion`, `id`, `name`, `version`, `entry`, `entryKind`, `handles`,
`surfaces`, and `schemas`. Additional app-host fields should be declarative:
`runner` and `permissions`. They are requests and metadata, not grants.

A local authoring loop should:

1. validate `patchpit.app.json`;
2. regenerate Tarstate schema artifacts from schema sources;
3. build or serve `dist/`;
4. link or update the installed package under `/apps`;
5. launch through normal `app.launch`, `route.open`, or `route.preview`;
6. hot-reload the app session without changing compositor-owned state.

The app SDK should be a typed wrapper over app services, not a new runtime and
not a direct exposure of runtime internals:

```ts
env.app.view(name, args).subscribe(listener);
env.app.act(name, input);
env.app.open(name, args);
env.surface.setTitle(title);
env.surface.events(listener);
```

Generated artifacts should come from schema sources: row types, relation refs,
typed intent builders, manifest types, capability protocol types, JSON Schema
when useful, and `agent-card.md`. Do not hand-edit generated relation rows or
schema descriptors.

The test harness should provide fake runtime, fake surface, and policy profiles
such as allow, deny, narrowed, revoked, quota exceeded, schema mismatch, intent
conflict, quarantine, capability timeout, and backpressure. Capability mocks
must use the same request/response and revocation protocol as real capability
providers.

Runtime diagnostics and `/system/runtime` should make app development
observable: installed manifest, schema refs, effective grants, projection
subscriptions, intent logs, capability events, runner lifecycle, SES timings,
first paint, crash reasons, and schema hash mismatches.

Version fields must stay separate:

- `manifestVersion` is the Patchpit manifest format;
- `version` is the app package version;
- `patchpit.app@1` and `patchpit.runtime@1` are protocol versions;
- `schemaId@N` is the Tarstate compatibility boundary.

Runtime diagnostics should stay trusted shell/dev tooling during the migration.
It should not be moved into the untrusted sandbox path.

## App Pressure Tests

### Viewer

Viewer is migrated to a sandboxed app and remains a useful read-only
pressure test.

Needs:

- context URL;
- a scoped document/media view for the target URL;
- optional read-only content or media port for large payloads;
- surface title updates.

Must not receive:

- raw filesystem root objects;
- `FilesystemIndexDoc` rows;
- all document handles;
- route/window intents;
- filesystem write;
- network by default.

Viewer should be metadata-first. `filesystem.tree` should not carry large text
or media bodies across the app boundary when a content handle or range read is
enough.

### File Picker

File Picker is migrated to a sandboxed app and proves view and action
pressure.

Needs:

- root-scoped `filesystem.tree` view;
- file type/icon view;
- file-picker state view;
- `filePicker.selectUrl` and `filePicker.toggleFolder` actions;
- `route.preview` and `route.open` actions;
- host-mediated drag offers.

Must not receive:

- direct window-manager mutation;
- placement/focus authority;
- raw `DataTransfer`;
- raw folder `entries`;
- broad `/system` access;
- app state docs for unrelated contexts.

## Performance Invariants

The sandbox boundary must not enter the frame path.

Almost-free paths:

- compositor layout, tab focus, split resize drafts, drag hit testing;
- small actions such as preview, open, select, toggle, focus, and close;
- small port calls with warm runners;
- SES compartments after one `lockdown()` per runner;
- viewer and file-picker steady state with metadata patches.

Expensive paths:

- cold process/WebView startup;
- SES lockdown and module graph load;
- full projection snapshots;
- structured cloning large file/media bodies.

Initial measurement targets:

- warm viewer/file-picker launch to first interactive frame under 100 ms;
- small port round trip p95 under 10 ms;
- small view update to visible update under one frame;
- no cross-boundary clone of file/media payloads over 256 KiB by default;
- cold runner launch measured separately and hidden by prewarm where possible.

Track payload bytes, row counts, clone time, runner RSS, process spawn time,
SES lockdown time, compartment creation time, first snapshot time, and first
paint.

## Preparatory Decomplection

These changes make the sandboxed app host easier to implement, but they are
useful even without OS sandboxing or SES.

1. Introduce a scoped app service facade. Current apps should depend on a small
   app-facing surface shaped like views, actions, and ports instead of
   shell-built props backed by raw documents. The host/runtime attaches scope.
2. Move app state reads behind views. Viewer and File Picker read document or
   app state through schema-bound runtime views rather than
   direct `DocHandle` reads or shell-derived object graphs.
3. Make `WindowManagerAppHost` manifest-driven. The compositor content slot
   should resolve contexts through app manifests instead of hard-coding app ids
   in the render switch.
4. Split content handles from tree metadata. File picker needs filesystem tree
   metadata; viewer needs content. Large text and media should not ride inside
   `filesystem.tree` rows.
5. Define app state actions. File-picker selection/open-folder changes should be
   narrow runtime actions, not direct callbacks or document writes.
6. Normalize port adapters with explicit grants, scoped endpoints, bounded
   request/response protocols, close/revoke behavior, and deterministic errors.
7. Enforce runtime scope before sandbox placement. App code should never send
   trusted `workspaceId`, `surfaceId`, `contextId`, or `appId`; the host/runtime
   derives those from the launched context.

Runner placement, SES lockdown, and `bubblewrap` are later containment layers.
They should be added after the app/runtime seam is small enough that changing
placement does not change app semantics.

## First Landing

The first app-host boundary is in place for the active seeded apps.

1. Manifest-driven rendering and sandboxed HTML entries are on the same app-host
   path.
2. File Picker uses scoped `file-picker` views plus file-picker and route
   actions.
3. Viewer uses the scoped `resource` view for file and folder output.
4. Hello World remains the minimal launchable sandbox package.
5. Add SES and OS runner placement after the app API works through this current
   sandbox placement.

## Migration Plan

1. Keep the manifest-driven `SandboxAppHost` behind
   `WindowManagerAppHost.renderSurface`.
2. Keep scoped app services attaching runtime scope server-side and rejecting
   app-supplied scope.
3. Keep app/document views behind runtime services instead of passing raw
   `DocHandle` state to apps.
4. Keep launcher specs and app rendering derived from manifest projection plus
   manifest entry resolution.
5. Add local OS placement for command runners, then for app hosts where a local
   supervisor exists.
6. Move runtime ownership from the in-process bootstrap scaffold into the
   SharedWorker runtime. The app API should not change when this happens.

## Review Checks

Use these checks before adding or changing app-host machinery:

- Which layer owns the state being changed?
- Is this a canonical write, derived relation view, runtime semantic decision,
  capability grant, presentation concern, or runner placement concern?
- Does any app code receive `Repo`, `DocHandle`, `RuntimeClient`, DOM nodes,
  xterm instances, host environment, or broad filesystem/network authority?
- Does a projection carry large content that should be a handle, range, stream,
  or capability result?
- Can the runner be killed without corrupting durable state?
- Are capability denials deterministic and scoped to one context?
- Does the hot path depend on worker/process round trips?
- Does a shared runner cross trust tiers, workspaces, users, or incompatible
  capability profiles?
