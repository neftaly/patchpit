# Patchpit Surface Protocol Research

This is the target shape for Patchpit's app/window-manager protocol after comparing
web manifests, desktop window managers, spatial shells, OMBI/Sneeze, and Plan 9.

## Research Summary

- Web manifests are the right precedent for app identity: `id`, `name`, `entry`,
  `scope`, `icons`, `handles`, and requested permissions.
- EWMH, Wayland, i3, sway, xmonad, macOS, and Windows all point to the same
  boundary: apps describe function, while the window manager owns placement,
  focus, stacking, layout, and final policy.
- Spatial systems add another split: shared workspace state is not the same as
  per-device presentation. A tablet, desktop, headset, and HUD may present the
  same surface differently.
- OMBI/Sneeze adds useful vocabulary: a host app/window manager presents live
  contexts through one or more viewports. Spatial placement is a projection, not
  the app identity.
- Plan 9 says names and services matter more than object classes. Durable docs
  live in namespaces; live systems are service trees; launch/open is a message,
  not a file.
- Tarstate schemas are lenses over JSON-shaped state. They should not force
  Patchpit into table-shaped storage when hierarchical Automerge docs are the
  clearer canonical shape.

## Finished Model

```ts
type AppManifest = {
  manifestVersion: 1;
  id: string;
  name: string;
  entry: string;
  scope?: string;
  icons?: Icon[];
  surfaces?: SurfaceSpec[];
  handles?: Handler[];
  permissions?: PermissionRequest[];
};

type Handler = {
  port: string;
  intent: 'preview' | 'open' | 'reveal' | 'activate';
  accepts: string[];
};

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

type Context = {
  id: string;
  app: string;
  subject?: string;
  stateRef?: string;
  title?: string;
};

type Surface = {
  id: string;
  role: SurfaceRole;
  contexts: string[];
  activeContext?: string;
  previewContext?: string;
};

type SurfaceSpec = {
  role: SurfaceRole;
  forms?: SurfaceForm[];
  placementHint?: PlacementHint;
  reuseHint?: ReuseHint;
  state?: { type: string; schema?: string };
};

type Viewport = {
  id: string;
  client: string;
  surface: string;
  form: SurfaceForm;
  focus?: string;
};

type SurfaceRole =
  | 'document-set'
  | 'workspace-view'
  | 'session-set'
  | 'transient'
  | 'shell';

type SurfaceForm =
  | 'window'
  | 'panel'
  | 'tabset'
  | 'volume'
  | 'hud'
  | 'immersive-space';

type PlacementHint =
  | 'center'
  | 'left'
  | 'right'
  | 'bottom'
  | 'floating'
  | 'spatial';

type ReuseHint =
  | 'new'
  | 'workspace'
  | 'subject'
  | 'source-surface';
```

## Resolved Questions

### Authority

The app manifest is descriptive. It declares identity, entry points, surface
types, and handler support. It does not own placement, focus, tab membership, or
permission grants.

The window manager owns surfaces, layout, focus, preview slots, and final launch
policy. Apps own their state docs and app-specific interpretation of intents.
Clients own local viewports and transient presentation state.

### Context

A context is the running/session object. It is not a tab, pane, process, or URL.
It says: this app is running for this subject, with this state doc.

Examples:

- viewer context for `automerge:...README.md`
- file picker context for `automerge:...file-manager-state`
- terminal context for a shell session state doc

`app`, `subject`, and `stateRef` should be references, not embedded documents.
Those references may initially be URL strings, but the protocol should treat
them as document or app identities that can later become typed refs.

### Surface

A surface is the shell-visible container that presents one or more contexts.
Tabs belong here when the shell manages tabs. A `document-set` surface can hold
many viewer/editor contexts; a `workspace-view` surface usually holds one file
picker context.

This keeps editor-like tabs in the shell/window-manager model without forcing
each app to reinvent tab state.

`contexts` are pinned/open context ids. `previewContext` is the temporary slot.
Promoting a preview moves that context id into `contexts`; switching away from a
preview can drop the temporary reference.

### Viewport

A viewport is one client's presentation of a surface. It owns local geometry,
pose, form, device-specific focus, and collapsed/expanded presentation.

Shared layouts can exist, but they should be explicit workspace/session state.
Default tablet/headset/desktop projections should not fight each other.

### Intent

Launch/open/preview is a plumber-style message. It should not be encoded as a
fake file. The router reads `type`, `attr`, and `data`, resolves a handler, then
creates a `RoutedIntent` with a concrete `port`.

`preview` should create or reuse `previewContext`. `open` should create or reuse
a durable context. `reveal` should navigate an existing surface. `activate`
should focus or raise without changing content.

Previews are intentionally non-durable unless promoted by `open`. Switching away
from a preview should not create a pinned tab or durable context unless the user
or app explicitly asks for that.

Hints such as `placementHint`, `reuseHint`, and manifest `forms` are advisory.
The window manager may ignore them for device constraints, user preference,
collaboration policy, or safety.

`Handler.accepts` matches `Intent.type`. Values should use the same MIME pattern
language as file type rules, including exact matches like `text/markdown` and
wildcards like `image/*`.

`SurfaceSpec.state` declares the state type/schema an app surface expects.
`Context.stateRef` points at the specific state document for one running
context.

### Namespace And Services

Durable resources:

- documents
- folders
- app manifests
- routing rules
- saved workspace/session descriptors

Live service directories:

- running apps
- surfaces/windows
- window manager
- router/plumber
- device bridges

`/srv` should be reserved for live mountable services. Persisted Automerge state
docs should move to `/state`, `/sessions`, or `/wm`.

App manifests should live under `/apps`. The router indexes manifest docs from
that namespace and uses their `handles` entries to route intents.

### Tarstate

Automerge docs should remain the canonical state. Use the shape that best
matches the domain and the Ink & Switch/Patchwork file format, even when that
shape is hierarchical.

Tarstate should provide the lens:

- schemas describe typed projections over the document
- relations are named views or patchable slices, not storage requirements
- `idField`, `refField`, and `anchoredPathField` document identity, links, and
  tree positions
- `ephemeral` relations are appropriate for presence, local clients, and other
  non-durable views
- write patches compile back into the canonical Automerge tree

For example, a window-manager doc can stay hierarchical:

```ts
type WindowManagerDoc = {
  layout: LayoutNode;
  surfaces: Record<string, Surface>;
  contexts: Record<string, Context>;
};
```

Tarstate can project that as `surfaces`, `contexts`, `layoutNodes`, or
`activeContexts` without making the saved document a database dump.

### Lifecycle

The bootloader creates the initial window-manager doc, bootstrap contexts, and
starting surfaces. After boot, intents are the normal way to create, reuse,
activate, or reveal contexts.

The router chooses an app handler from `/apps`, creates a routed intent, and
asks the window manager to place or reuse a surface. The window manager owns
surface creation/destruction and may garbage-collect unreferenced preview
contexts. Apps own app-specific state creation and updates.

## Implementation Target

The first useful implementation should be small:

1. Add app manifests for file picker and viewer.
2. Model the window-manager doc as a hierarchical tree of layout, surfaces, and
   contexts.
3. Use Tarstate schemas as projections/write lenses over that tree.
4. Replace URL-only tabs with contexts.
5. Replace panes with shell-managed surfaces.
6. Keep split layout as a WM projection over surface ids.
7. Move persisted state docs out of `/srv`.

Do not implement spatial placement, permissions, or multiple viewports until the
basic desktop projection is working.

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
