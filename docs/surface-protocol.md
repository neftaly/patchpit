# Patchpit Surface Protocol

Patchpit is a small shell for Automerge-backed applications. Durable data lives
as named documents in a filesystem-like namespace. Running apps are represented
by contexts. The window manager arranges those contexts into surfaces, tabs, and
split layouts.

This document describes the target protocol shape. External systems informed the
notes at the end, but the model here is Patchpit's own runtime contract.

## System Model

Patchpit currently seeds three durable roots and reserves one live-service root:

- `/apps` contains installed app manifest docs
- `/home` contains user and workspace documents
- `/system` contains shell-owned persistent state
- `/srv` is reserved for future live mountable services

The bootloader creates the initial filesystem, app manifests, shell state docs,
the file picker state doc, and the window-manager state doc. Managed app state
docs such as terminal sessions are created by launch intents and removed when
their owning context closes. Apps are opened through intents after boot: file
picker open/preview and file drag/drop requests submit route intents, and the
runtime commits the resulting viewer context effects to the window-manager doc.

The window manager owns:

- layout tree and split ratios
- surfaces and their roles
- focus
- tab membership
- preview slots

Apps own:

- their manifest docs
- their app instance state docs
- interpretation of routed intents
- titles and metadata they choose to publish

Clients own local presentation state that should not be shared by default, such
as viewport geometry, collapsed panels, pointer focus, or device-specific form.

## Documents

Automerge docs are the canonical durable state. Patchpit uses `.am` for new
Automerge-backed filenames. `.automerge` remains readable for compatibility.
Both map to `application/vnd.automerge`.

State documents should keep the shape that best matches the domain. They do not
need to be flattened into tables. Tarstate provides typed lenses over those docs
for reads, views, and writes.

Within `/system`:

- `/system/apps` contains running app instance state docs
- `/system/config` contains shell configuration docs
- `/system/runtime` contains inspectable runtime and worker state docs
- `/system/themes` contains theme docs
- `/system/window-manager.am` contains shared window-manager state

Runtime docs are normal Automerge docs in the visible filesystem. The current
slice seeds `/system/runtime/runtime-boot-gate.am` so users and developers can
inspect the SharedWorker boot-gate handshake, current boot status, platform
feature requirements, and the explicit note that the in-process bootstrap
runtime still owns Automerge handles until that ownership moves into the worker.

The linked Automerge docs are the real filesystem format. `FilesystemIndexDoc`
is an internal projection/cache used by Tarstate and the runtime to read the
linked tree efficiently. Runtime clients consume `filesystem.tree` with
`schemaId: patchpit.filesystem.tree@1` as a public `nodes` relation. The index
doc should not become the interchange format.

## App Manifests

An app manifest describes what an app is and what it can handle. It does not own
placement, focus, tab policy, or permission grants.

```ts
type AppManifest = {
  manifestVersion: 1;
  id: string;
  name: string;
  entry: string;
  scope?: string;
  icons?: Icon[];
  schemas?: Record<string, PatchpitRelationSchemaDescriptor>;
  surfaces?: SurfaceSpec[];
  handles?: Handler[];
  permissions?: PermissionRequest[];
};

type SurfaceSpec = {
  role: SurfaceRole;
  forms?: SurfaceForm[];
  placementHint?: PlacementHint;
  reuseHint?: ReuseHint;
  state?: { type: string; schema?: PatchpitSchemaRef };
};

type Handler = {
  port: string;
  intent: 'preview' | 'open' | 'reveal' | 'activate';
  accepts: string[];
};
```

`handles.accepts` matches MIME-like intent types. It uses the same pattern
language as file icon rules: exact matches such as `text/markdown`, wildcards
such as `image/*`, and a final fallback such as `*/*`.

`SurfaceSpec.state` declares the app-owned persistent state document type that a
managed `app.launch` may create or reuse. It does not give the app placement,
focus, or tab authority. A context-less launch is admitted only when the runtime
has a handler for the app, surface role, state type, and non-empty launch slot;
the current slice implements that managed path for terminal state. Apps such as
the file picker can still launch by providing an explicit context around an
existing state doc.

## Intents

An intent is the message used to preview, open, reveal, or activate a resource.
It is the shell equivalent of a command-line invocation.

```ts
type Intent = {
  src?: string;
  port?: string;
  wdir?: string;
  type: string;
  attr?: Record<string, string>;
  data: string;
};

type RoutedIntent = Intent & {
  port: string;
};
```

The router reads the intent, chooses a matching app handler from `/apps`, and
produces a routed intent with a concrete `port`.

Intent behavior:

- `preview` creates or reuses a temporary preview context
- `open` creates or reuses a durable pinned context
- `reveal` navigates an existing surface to show a resource
- `activate` focuses or raises without changing content

Preview contexts are intentionally non-durable until promoted. Double-clicking
or dragging a preview tab can promote it to a pinned context.

## Contexts

A context is the running/session object for one app around one primary URL. It
is not itself a tab, pane, iframe, process, or file.

```ts
type Context = {
  id: string;
  app: string;
  container: AppContainer;
  title?: string;
  url: string;
};
```

Examples:

- a viewer context for `automerge:...README.md`
- a file picker context for a file-picker state doc
- a terminal context for a terminal state doc

The shell/router assigns the context's container, which defines the app's mount
namespace. Tabs display a shell context label: currently filesystem path or
runtime title, falling back to `title ?? url`.

## Surfaces

A surface is a shell-visible container for one or more contexts. It is the owner
of shell-managed tabs.

```ts
type Surface = {
  id: string;
  role: SurfaceRole;
  contexts: string[];
  activeContext?: string;
  previewContext?: string;
};

type SurfaceRole =
  | 'document-set'
  | 'workspace-view'
  | 'session-set'
  | 'transient'
  | 'shell';
```

`contexts` are pinned context ids. `previewContext` is the one temporary slot. A
document-set surface can hold many viewer/editor contexts. A workspace-view
surface usually holds one file picker context and rejects document tab drops.

Tab behavior:

- selecting a pinned tab focuses that context
- selecting a preview tab focuses it without pinning it
- double-clicking a preview pins it
- dragging a preview pins it on successful drop
- dragging within a document-set reorders tabs
- dragging to another document-set moves the tab there
- dragging to a workspace-view is rejected
- closing the active tab focuses the nearest remaining tab or preview

## Layout

The window-manager doc stores a hierarchical layout tree. Split ratios belong to
the split node, not to the app or tab.

```ts
type WindowManagerDoc = {
  layout: LayoutNode;
  surfaces: Record<string, Surface>;
  contexts: Record<string, Context>;
};
```

A ratio is the first child size. For example, a row split with `ratio: 0.2`
means the first surface receives 20% and the second receives the remainder. If
another pane is added later, the existing ratio still describes only that split
node.

## Viewports

A viewport is one client's presentation of a surface. It lets multiple devices
look at the same shared shell state without forcing them to share every local
presentation choice.

```ts
type Viewport = {
  id: string;
  client: string;
  surface: string;
  form: SurfaceForm;
  focus?: string;
};

type SurfaceForm =
  | 'window'
  | 'panel'
  | 'tabset'
  | 'volume'
  | 'hud'
  | 'immersive-space';
```

Shared layouts can exist, but they should be explicit workspace/session state.
Desktop, tablet, headset, and HUD projections should not silently overwrite each
other's local presentation.

## Tarstate

Tarstate is the lens layer over Automerge docs. It should be used for structured
reads and writes when a typed projection helps, while Automerge remains the
source of truth.

Tarstate schemas can expose:

- named projections over hierarchical documents
- patchable slices for writes
- references and anchored paths
- ephemeral relations for local or presence-like state

Portable schema descriptors are defined in
[`schema-protocol.md`](schema-protocol.md). Durable Patchpit docs embed their
primary schema ref and optional inline descriptors in `@patchpit`, while app
manifests advertise schemas for state docs they create. The embedded schema is
stable document metadata; normal Automerge changes should update state fields,
not rewrite schema descriptors.

For the window manager, the saved Automerge doc can stay hierarchical while
Tarstate projects `surfaces`, `contexts`, `layoutNodes`, or `activeContexts` as
needed.

## Implementation Target

The first useful implementation should stay small:

1. App manifests live under `/apps`.
2. File picker, viewer, and terminal each run as contexts.
3. File picker state, runtime state, themes, and window-manager state live as
   boot-seeded Automerge docs under `/system`; managed app states such as
   terminal sessions are created under `/system/apps` on launch.
4. The window-manager doc owns surfaces, tabs, focus, and split layout.
5. A router creates viewer contexts from route intents; file picker UI submits
   open/preview intents instead of constructing viewer contexts directly.
6. Tarstate provides projections and write lenses over the durable docs.
7. `/srv` remains reserved for future live services, not persisted app state.

Do not implement permissions, spatial placement, or multiple viewports until the
basic desktop projection is stable.

## Notes

The protocol is informed by app manifests, desktop window-manager protocols,
tiling window managers, spatial shells, Plan 9 namespaces, and Tarstate schemas.
Those references are useful for vocabulary and edge cases, but Patchpit should
keep the runtime boundary simple: apps describe capabilities, the shell owns
placement, and durable state lives in linked Automerge docs.

## Sources

- Web App Manifest: https://www.w3.org/TR/appmanifest/
- Chrome file handling: https://developer.chrome.com/docs/capabilities/web-apis/file-handling
- Chrome extension manifest: https://developer.chrome.com/docs/extensions/reference/manifest
- Android intents: https://developer.android.com/guide/components/intents-filters
- Apple Info.plist keys: https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html
- VS Code extension manifest: https://code.visualstudio.com/api/references/extension-manifest
- EWMH window types: https://specifications.freedesktop.org/wm-spec/latest/
- Wayland xdg-shell: https://wayland.app/protocols/xdg-shell
- i3 user guide: https://i3wm.org/docs/userguide.html
- xmonad StackSet: https://hackage.haskell.org/package/xmonad/docs/XMonad-StackSet.html
- Apple visionOS overview: https://developer.apple.com/visionos/
- WebXR Device API: https://www.w3.org/TR/webxr/
- OMBI: https://metaverse-standards.org/open-metaverse-browser-initative/
- Sneeze docs: https://omb.wiki/sneeze
- Sneeze architecture: https://omb.wiki/sneeze/architecture/overview
- Plan 9 plumber: https://9p.io/magic/man2html/4/plumber
- Acme paper: https://9p.io/sys/doc/acme/acme.html
