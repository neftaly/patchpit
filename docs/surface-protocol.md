# Patchpit Surface Protocol

Patchpit is a small runtime and compositor for Automerge-backed applications.
Durable data lives as named documents in a filesystem-like namespace. Running
apps are represented by sessions, currently named contexts in the codebase. The
window manager arranges those sessions into surfaces, tabs, and split layouts.

This document describes the target protocol shape. External systems informed the
notes at the end, but the model here is Patchpit's own runtime contract.

## System Model

Patchpit currently seeds three durable roots:

- `/apps` contains installed app package folders
- `/home` contains user and workspace documents
- `/system` contains runtime/compositor-owned persistent state

The bootloader creates only the initial filesystem, the minimal runtime state
needed to boot, and the compositor/window-manager state needed to display
surfaces. The active seed installs File Picker, Viewer, and Hello World as
filesystem app packages under `/apps`; Terminal is archived under
`archive/terminal-shell-compat` and is not part of the active architecture.
Future first-party apps should use the same installer path rather than seed a
second app registry.

Apps are opened through one runtime admission path: route, launch, preview, and
activation requests resolve an installed app package manifest, create or reuse a
session, and commit the resulting compositor effects to the window-manager
document.

The window manager owns:

- layout tree and split ratios
- surfaces and their roles
- focus
- tab membership
- temporary preview context membership

Apps own:

- their manifest docs
- their durable app state docs
- interpretation of routed intents
- titles and metadata they choose to publish

Clients own local presentation state that should not be shared by default, such
as viewport geometry, collapsed panels, pointer focus, or device-specific form.

## Documents

Automerge docs are the canonical durable state. Patchpit uses `.am` for new
Automerge-backed filenames. `.automerge` remains readable for compatibility.
Both map to `application/vnd.automerge`.

State documents should keep the shape that best matches the domain. They do not
need to be flattened into tables. Runtime projections may expose relation-shaped
views over those docs when a stable read or write boundary helps.

Within `/system`:

- `/system/apps` contains durable app state docs for installed app sessions
- `/system/config` contains runtime and first-party configuration docs
- `/system/runtime` contains inspectable runtime and worker state docs
- `/system/themes` contains theme docs
- `/system/window-manager.am` contains shared window-manager state

Runtime docs are normal Automerge docs in the visible filesystem. The current
slice seeds `/system/runtime/runtime-boot-gate.am` so users and developers can
inspect the SharedWorker boot-gate handshake, current boot status, platform
feature requirements, and the explicit note that the in-process bootstrap
runtime still owns Automerge handles until that ownership moves into the worker.

Runtime projection catalogs and live projection snapshots are runtime views, not
persisted filesystem docs.

The linked Automerge docs are the real filesystem format. `FilesystemIndexDoc`
is an internal runtime-maintained projection/cache used to read the linked tree
efficiently. Runtime clients consume `filesystem.tree` with
`schemaId: patchpit.filesystem.tree@1` as a public `nodes` relation. The index
doc should not become the interchange format.

The active runtime serves named projections through the runtime client. It does
not automatically materialize projection metadata, schemas, or snapshots as
filesystem files. Writes go through intents and the owning canonical state layer,
not through editable projection exports.

## App Manifests

An app manifest describes what an app is and what it can handle. It does not own
placement, focus, tab policy, or permission grants.

```ts
type AppManifest = {
  manifestVersion: 1;
  id: string;
  name: string;
  entry: string;
  entryKind: 'module' | 'html';
  version: string;
  scope?: string;
  icons?: Icon[];
  schemas?: Record<string, PatchpitRelationSchemaDescriptor>;
  surfaces?: SurfaceSpec[];
  handles?: Handler[];
  permissions?: PermissionRequest[];
};

type SurfaceSpec = {
  role: SurfaceRole;
  state?: { type: string; schema?: PatchpitSchemaRef };
};

type Handler = {
  port: string;
  intent: 'preview' | 'open' | 'reveal' | 'activate';
  accepts: string[];
};
```

Current V0 manifests keep `entry` as a package-relative path because the
implemented resolver still resolves a file node by path. `entryKind` records how
that path is interpreted:

- `module` is the implemented filesystem bundle path. The host loads the
  package file as a JavaScript module whose default export is `activate(env)`.
- `html` is an implemented filesystem document path. The host injects the
  sandbox bridge into the package HTML document and rewrites package-relative
  module and asset references it can resolve.

`manifestVersion` is the Patchpit manifest format version. `version` is the app
package version. Shared libraries, import maps, content-hashed assets, and
network/service access from sandboxed app packages are target package features
and are not implemented by the current installed app resolver.

`handles.accepts` matches MIME-like intent types. It uses the same pattern
language as file icon rules: exact matches such as `text/markdown`, wildcards
such as `image/*`, and a final fallback such as `*/*`.

`SurfaceSpec.state` declares the app-owned persistent state document type that a
stateful launch may create. It does not give the app placement, focus, or tab
authority. The target model is generic runtime-owned state creation from the
manifest's declared state type and schema, or an app-scoped init action. V0 may
keep compatibility handlers while that generic path lands.

## Intents

An intent is the message used to preview, open, reveal, or activate a resource.
It is the runtime equivalent of a command-line invocation.

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

- `preview` creates or replaces a temporary context on a compatible surface
- `open` creates or reuses a durable pinned context
- `reveal` navigates an existing surface to show a resource
- `activate` focuses or raises without changing content

Preview contexts are intentionally non-durable until promoted. Double-clicking
or dragging a preview tab can promote it to a pinned context. The window
manager only owns the temporary-context mechanic; the file picker or another
producer decides when a selection should submit `preview` instead of `open`.

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
- a sandbox app context for an installed package entry

The runtime/router assigns the context's container, which defines the app's
mount namespace. Tabs display a compositor context label: currently filesystem
path or runtime title, falling back to `title ?? url`.

## Surfaces

A surface is a compositor-visible container for one or more contexts. It is the
owner of compositor-managed tabs.

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
  | 'reserved';
```

`reserved` is target vocabulary for compositor placement such as the Launcher
edge surface. Current code only needs `document-set` and `workspace-view`; add
`reserved` when the Launcher edge becomes manifest-driven. It is not a special
app type.

`contexts` are pinned context ids. `previewContext` is an optional temporary
context id for the surface. A document-set surface can hold many viewer/editor
contexts. A workspace-view surface usually holds one file picker context and
rejects document tab drops.

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
look at the same shared workspace state without forcing them to share every
local presentation choice.

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

Tarstate is the schema and relation vocabulary for projection and intent
boundaries. It can also provide lenses over Automerge docs when a typed
projection or write path removes real complexity, while Automerge remains the
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

For the window manager, the saved Automerge doc can stay hierarchical while the
runtime exposes relation-shaped `surfaces`, `contexts`, `layoutNodes`, or
`activeContexts` views as needed.

## Implementation Target

The first useful implementation should stay small:

1. App packages live under `/apps`.
2. File Picker, Viewer, and Hello World are active seeded filesystem apps; runtime
   diagnostics are shell/dev tooling, not an installed app.
3. The window-manager doc owns surfaces, tabs, focus, reserved slots, and split
   layout.
4. Route and launch requests share one admission path that resolves manifests
   and creates or reuses sessions.
5. Runtime state under `/system/runtime` is diagnostic. Active app/session state
   is derived from workspace sessions and app-host runner diagnostics, not from a
   second app-instance registry.
6. Runtime projections expose schema-bound relation views over durable docs and
   live runtime state.

Do not implement permissions, spatial placement, or multiple viewports until the
basic desktop projection is stable.

## Notes

The protocol is informed by app manifests, desktop window-manager protocols,
tiling window managers, spatial shells, Plan 9 namespaces, and Tarstate schemas.
Those references are useful for vocabulary and edge cases, but Patchpit should
keep the runtime boundary simple: apps describe behavior, the compositor owns
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
