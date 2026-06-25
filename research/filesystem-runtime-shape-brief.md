# Filesystem And Runtime Shape Brief

This is a working brief for deciding what data Patchpit v2 should keep around,
where that data should live, and which boundaries the prototype should prove.

It is not a final filesystem design. The goal is to make the v2 stub small
enough to build while preserving the OS-shaped idea: durable documents,
inspectable runtime state, app-owned state, and apps that can be launched by
URL/ref.

## Current Conclusion

Patchpit should keep three filesystem-like namespaces in view:

- Durable workspace/project documents.
- System/app registry documents.
- Runtime and ephemeral mounts.

Not everything should be persisted. Everything important to understanding the
workspace should be inspectable.

The important v2 move is not "make a filesystem". It is to make ownership and
lifetime visible:

- durable user/project state persists and syncs
- shell/workspace state restores the surface
- app-owned state belongs with the app contract
- runtime state is visible under a conventional path
- ephemeral presence is queryable while present and harmless when absent
- local-only caches/tool settings are not project format

## V1 Evidence

V1 has already proved enough that app state ownership does not need a separate
abstract track. It should fall out of this filesystem/runtime pass.

Useful evidence:

- App instances already have separate state documents.
- Runtime app state is already exposed under an apps runtime folder.
- Panes already distinguish program, app state URL, and subject.
- The window manager already renders from `launchableApps` and
  `openAppInstances` props instead of owning persistence.
- The file explorer already demonstrates that filesystem UI state and durable
  folder/file documents are different things.

The v2 judgment is:

- if state must survive instance restore, workspace restore, or sharing, make
  it a document and give it an owner
- if state is app-specific, the app owns schema/defaults/normalization
- if state is just shell/window/sidebar chrome, workspace or shell owns it
- if state is connection-local or presence-like, runtime owns a live view and
  absence is normal

Use v1 to classify ownership, not to copy package shapes.

## Placement Rules

### Durable User And Project Documents

Examples:

- folders
- files
- app-authored user documents
- shared game/project/workspace data
- documents opened by apps

These should live in the user/project tree and sync as durable documents. The
Pushwork/Patchwork evidence still looks right: one root document, explicit
folder/file docs, simple metadata, one document per file-like unit when useful,
and external references by URL rather than forced import.

Durable documents should not carry shell implementation details unless those
details are part of the user-facing document contract.

### App Shortcuts And App Registry

Examples:

- launcher/taskbar shortcut
- built-in app ref
- HTTPS app ref
- Automerge module/folder app ref
- default launch context
- label/icon/order metadata

This is durable shell/workspace configuration, not running state. Candidate
paths:

- `/patchpit/apps`
- `/patchpit/bin`
- workspace-local `apps` folder

Do not use "pinned" for taskbar membership. In Patchpit, a shortcut is a visible
launcher entry. A pinned app ref is content/version-fixed.

### Pinned Artifacts

Examples:

- Automerge URL with heads
- content-addressed HTTPS artifact
- release-like app/module package

Pinned artifacts are not running app instances. They are fixed references that
can be used by shortcuts, documents, or launch contexts.

V2 should preserve the bare URL versus pinned URL distinction:

- bare Automerge URL means live/current
- Automerge URL with heads means fixed/release-like
- HTTPS URL is a valid external reference, not a rule violation

### Runtime App Instances

Examples:

- open app instance records
- app state document URL
- status such as opening/open/error/closed
- title/icon as rendered by the shell
- mount path for inspection

Candidate path:

- `/patchpit/run/apps/<instance-id>`

This is the v2 acceptance-critical namespace. Launching an app should create an
app instance record and a visible runtime mount. Closing should remove the mount
or mark the instance closed explicitly.

Runtime instance records may point at durable app state documents. The runtime
record and the state document are different things.

### Workspace And Session Layout

Examples:

- pane IDs
- selected/current pane
- window positions
- layout tree
- restore state

Workspace/session state should be durable when it affects restoration. It can be
inspectable under a conventional path, but it should not be mixed with app
schema or filesystem document schema.

Candidate paths:

- `/patchpit/workspaces`
- `/patchpit/run/workspace`

The key distinction is lifetime: restoreable workspace layout is durable;
current process/window bookkeeping can be runtime.

### App-Owned State Documents

Examples:

- file explorer tree UI state
- file viewer mode/state
- terminal scrollback/session state if persisted
- JSON editor state
- game/plugin state

Apps own app-specific schemas, defaults, normalizers, and migrations. The shell
may create, mount, inspect, and pass state URLs around, but it should not know
the app-specific shape.

Other apps may read app-owned state through document/query APIs. Writes should
be mediated by app or host validation before entering Automerge.

### Presence And Focus

Examples:

- peer roster
- cursor/focus/attention records
- selected object
- hovered object
- camera/viewer state
- drag/intention state

Presence is ephemeral. It should be queryable as a relation/source and
inspectable as a live runtime view, but missing presence is not invalid state.

Candidate path:

- `/patchpit/run/presence`

The Probability/sdk evidence argues for presence values that can refer to a
durable object through an anchored reference. The useful invariant is still:

- durable object identity plus path-within-object is stronger than a bare path
- focus/attention is not just UI selection; it can be meaningful user activity
- live focus may become a durable mark, but the two lifetimes are different

### Local-Only Tool State

Examples:

- sync backend config
- local caches
- package/module cache
- temporary imports
- snarf/stash-like local work
- browser storage optimization data

This should not become the shared project format. It can live in IndexedDB,
OPFS, Cache Storage, `.patchpit`, or another local container depending on the
host. If exposed in Patchpit, it should be clearly local-only.

### External References

Examples:

- HTTPS template/app/asset URLs
- Automerge document URLs
- module URLs
- future package refs

Store references as references. Fetching, caching, pinning, importing, and
trusting are separate operations.

This is important for large files and remote data: v2 can sidestep unresolved
large-file storage by letting documents point at plain HTTPS URLs where that is
honest.

### Diagnostics And Bad Data

Examples:

- invalid folder doc
- invalid app shortcut
- missing app ref
- bad app state schema
- stale presence reference
- failed module load

Bad data should become visible diagnostics, not shell crashes. Candidate path:

- `/patchpit/run/diagnostics`

The source/adapter/app boundary should say what was skipped, what failed
validation, and what fallback was used. This should feed Tarstate's future
diagnostic shape, but the filesystem/runtime layer should not wait for Tarstate
to solve it.

## Candidate Namespace Sketch

These paths are names for review, not final API:

```text
/
  user/project files and folders

/patchpit/apps
  durable app shortcuts and app refs

/patchpit/bin
  optional command/app namespace for launchable tools

/patchpit/workspaces
  durable workspace/session documents

/patchpit/run/apps
  live app instances and mounted app state refs

/patchpit/run/presence
  live peer/app presence views

/patchpit/run/diagnostics
  validation, loading, and runtime diagnostics
```

Avoid adding more paths until a workflow needs them.

## Research Implications

### Plan 9 And 9P

Plan 9 is useful here because it makes services appear through conventional
namespaces and file-like interfaces. The lesson is not to implement literal 9P
in v2. The lesson is to give tools conventional places to inspect and control
resources.

Useful constraints for Patchpit:

- represent services/state through stable paths when that makes tools simpler
- keep per-app/per-instance views possible instead of assuming one global root
- use textual/structured control surfaces for inspectability
- accept that some operations should stay messages or host calls, not file
  mutations

That last point matters. Plan 9 itself does not force every operation into file
I/O. Patchpit should expose runtime state as files/docs, while allowing launch,
focus, close, and route actions to be commands/messages that leave inspectable
state behind.

### Acme And Plumber

Acme and plumber argue that UI surfaces, editors, shells, and routing do not
need separate custom integration APIs for every pair of tools. A shared
namespace plus routed messages can carry a lot of composition.

Patchpit should preserve two channels:

- documents/paths for durable and inspectable state
- messages/commands for transient routing and actions

This prevents `/patchpit/run` from becoming an overfit event bus.

### Pushwork, Tiny Patchwork, And Jon Work

The local corpus points in the same direction:

- normal folders are still a good user-facing primitive
- folder/file docs should stay simple
- module URLs are executable trust boundaries
- bare URLs and pinned URLs must mean different things
- file sidebars are shippable now and can grow into richer ordered/inline
  hypermedia later

The v2 sidebar can remain editor-like and hideable. It does not need to carry
the whole OS metaphor, but it should be able to inspect the namespaces that make
the OS-like model true.

### Browser Runtime Research

For the prototype, prefer a small host API over a full sandbox/runtime.

Future approaches:

- iframe sandbox: best for untrusted UI boundaries; communicates by
  `postMessage`; needs CSP/Permissions Policy discipline
- Web Worker: good for logic without DOM access; communicates by structured
  messages; useful for future query/evaluation work and long-running terminal
  commands
- WebContainer: useful when Patchpit needs real Node-like processes, a virtual
  filesystem, process spawning, and dev-server previews; requires cross-origin
  isolation, has browser/runtime constraints, and is too heavy for the first app
  boundary proof
- WASI/WebAssembly: useful future shape for capability-oriented command
  execution; browser support and component model maturity should not block v2
- same-origin built-in app adapter: good enough for v2 if it consumes the same
  app host contract that iframe/worker apps would later use

The v2 app boundary should therefore look like a capability-bearing host object
or message protocol, not direct imports from shell internals.

Sketch:

```ts
type PatchpitAppHost = {
  fs: {
    list(path: string): Promise<PatchpitDirEntry[]>
    read(path: string): Promise<PatchpitFileRead>
    write(path: string, value: unknown): Promise<void>
    watch(path: string): AsyncIterable<PatchpitFsEvent>
  }
  runtime: {
    launch(shortcutOrRef: string, context?: unknown): Promise<string>
    close(instanceId: string): Promise<void>
    focus(instanceId: string): Promise<void>
  }
  docs: {
    open(url: string): Promise<unknown>
    update(url: string, change: unknown): Promise<void>
  }
  diagnostics: {
    report(input: PatchpitDiagnostic): void
  }
}
```

This is not the final API. It is the kind of boundary that can later be carried
over same-origin function calls, iframe messages, workers, or a command runtime.

The important operations are small:

- `list`, `read`, `write`, `stat`, `watch` for namespace state
- `call` or typed runtime methods for commands/actions
- structured results first, human text rendering second
- explicit capability errors when a host denies access

## JavaScript Terminal App

The terminal should be a v2 acceptance app because it exposes whether GUI apps
and command apps are peers.

Do not start with a POSIX shell. Start with a JavaScript command interpreter
over the Patchpit namespace.

The terminal app should prove:

- it launches from an app shortcut like any GUI app
- it has app-owned state like any GUI app
- it receives capabilities/context from the host, not shell internals
- it can inspect the same paths as the file sidebar
- it can trigger the same app launch/open flows as GUI controls
- it can report diagnostics without crashing the shell

Candidate first commands:

```text
pwd
ls [path]
cat <path>
open <path-or-url>
apps
launch <shortcut-or-app-ref>
inspect <path-or-instance-id>
watch <path>
state [instance-id]
presence
diag
help
```

Useful command semantics:

- `ls /patchpit/apps` proves app shortcuts are data.
- `launch <shortcut>` proves app launch is a host capability, not window-manager
  JSX.
- `ls /patchpit/run/apps` proves running instances are inspectable.
- `state <instance>` proves app state URLs are visible.
- `open <path>` proves terminal and GUI file opening share routing.
- `watch <path>` proves live document/runtime changes can stream without
  coupling to a GUI component.
- `presence` proves ephemeral data can be absent without error.
- `diag` proves bad data is surfaced.

Implementation bias:

- use `@xterm/xterm` for terminal rendering
- treat xterm.js as viewport and input device, not as the command runtime
- keep command parsing small, async, and JS-native
- define commands as data/functions in the terminal app package
- let the app host provide namespace/runtime/doc capabilities
- make terminal scrollback/session state app-owned and optionally durable
- put long-running or noisy commands behind a worker or cooperative async
  boundary before they can block the shell
- add output backpressure early; fast producers must not make the terminal or
  shell unresponsive
- treat terminal output as untrusted when turning it into DOM, links, titles, or
  copied structured data
- do not add WebContainer, WASI, node-pty, SSH, or real process execution to the
  v2 acceptance slice

This gives Patchpit a terminal program alongside GUI programs without confusing
"terminal" with "local machine shell". It also leaves room for richer command
syntax later, such as object pipelines over JSON-like records instead of
byte-only Unix pipes.

## Acceptance Gates

The filesystem/runtime slice is good enough when v2 can prove:

- adding one app shortcut/ref makes the app visible in the launcher
- launching that shortcut creates an app instance record
- the app instance appears under `/patchpit/run/apps`
- the app owns its state schema/default/normalizer
- closing the app updates/removes the runtime mount explicitly
- the file sidebar can hide/show and still inspect Patchpit namespaces
- invalid shortcut/doc/state data becomes a diagnostic
- a JS terminal app can `ls /patchpit/apps`, `launch` an app, and `ls
  /patchpit/run/apps`
- terminal and GUI app opening the same document observe the same updates
- terminal commands can only access the capabilities granted to the terminal app
- a long-running or noisy terminal command does not freeze GUI app switching,
  document rendering, or shell input
- terminal errors name the failing layer: parse, namespace resolution,
  capability, app action, runtime, or validation
- import tests prove window manager, workspace model, filesystem model, app
  host, and terminal app do not reach through each other's internals

The terminal gate is especially valuable because it tests the boundary from the
other side. If the terminal needs privileged imports to do useful work, the app
host boundary is not yet real.

## Open Questions

- Should app shortcuts live under `/patchpit/apps`, `/patchpit/bin`, or both
  with different meanings?
- Should `/patchpit/run/apps` contain only live instances, or also closed/error
  records for session history?
- Is workspace layout a durable document under `/patchpit/workspaces`, a runtime
  mount, or both?
- Should terminal scrollback persist by default, or should that be an app
  preference?
- What is the smallest app host API that can support both same-origin built-ins
  and future iframe/worker apps?
- Which diagnostics are durable enough to save, and which are runtime-only?
