export type SeedFileType = {
  emoji: string;
  match: string;
};

export type SeedFile = {
  kind: 'file';
  name: string;
  content?: string;
  url?: string;
};

export type SeedFolder = {
  kind: 'folder';
  name: string;
  children: readonly SeedNode[];
};

export type SeedNode = SeedFile | SeedFolder;

export const seedFileTypes = [
  {
    "match": "application/vnd.automerge",
    "emoji": "🔀"
  },
  {
    "match": "application/json",
    "emoji": "🧾"
  },
  {
    "match": "application/*+json",
    "emoji": "🧾"
  },
  {
    "match": "application/x-ndjson",
    "emoji": "🧾"
  },
  {
    "match": "application/javascript",
    "emoji": "💻"
  },
  {
    "match": "application/typescript",
    "emoji": "💻"
  },
  {
    "match": "text/css",
    "emoji": "💻"
  },
  {
    "match": "text/html",
    "emoji": "💻"
  },
  {
    "match": "text/javascript",
    "emoji": "💻"
  },
  {
    "match": "text/typescript",
    "emoji": "💻"
  },
  {
    "match": "text/markdown",
    "emoji": "📝"
  },
  {
    "match": "text/plain",
    "emoji": "📝"
  },
  {
    "match": "model/*",
    "emoji": "🧊"
  },
  {
    "match": "application/pdf",
    "emoji": "📕"
  },
  {
    "match": "application/gzip",
    "emoji": "🗜️"
  },
  {
    "match": "application/x-tar",
    "emoji": "🗜️"
  },
  {
    "match": "application/zip",
    "emoji": "🗜️"
  },
  {
    "match": "audio/*",
    "emoji": "🎵"
  },
  {
    "match": "image/*",
    "emoji": "🖼️"
  },
  {
    "match": "video/*",
    "emoji": "🎞️"
  },
  {
    "match": "*/*",
    "emoji": "📄"
  }
] as const satisfies readonly SeedFileType[];

export const seedTree = {
  "kind": "folder",
  "name": "",
  "children": [
    {
      "kind": "folder",
      "name": "home",
      "children": [
        {
          "kind": "file",
          "name": "README.md",
          "content": "# Home\n\nThis is a tiny filesystem namespace fixture."
        },
        {
          "kind": "file",
          "name": "ghostscript-tiger.svg",
          "url": "https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg"
        },
        {
          "kind": "folder",
          "name": "research",
          "children": [
            {
              "kind": "file",
              "name": "surface-protocol.md",
              "content": "# Patchpit Surface Protocol Research\n\nThis is the target shape for Patchpit's app/window-manager protocol after comparing\nweb manifests, desktop window managers, spatial shells, OMBI/Sneeze, and Plan 9.\n\n## Research Summary\n\n- Web manifests are the right precedent for app identity: `id`, `name`, `entry`,\n  `scope`, `icons`, `handles`, and requested permissions.\n- EWMH, Wayland, i3, sway, xmonad, macOS, and Windows all point to the same\n  boundary: apps describe function, while the window manager owns placement,\n  focus, stacking, layout, and final policy.\n- Spatial systems add another split: shared workspace state is not the same as\n  per-device presentation. A tablet, desktop, headset, and HUD may present the\n  same surface differently.\n- OMBI/Sneeze adds useful vocabulary: a host app/window manager presents live\n  contexts through one or more viewports. Spatial placement is a projection, not\n  the app identity.\n- Plan 9 says names and services matter more than object classes. Durable docs\n  live in namespaces; live systems are service trees; launch/open is a message,\n  not a file.\n- Tarstate schemas are lenses over JSON-shaped state. They should not force\n  Patchpit into table-shaped storage when hierarchical Automerge docs are the\n  clearer canonical shape.\n\n## Finished Model\n\n```ts\ntype AppManifest = {\n  manifestVersion: 1;\n  id: string;\n  name: string;\n  entry: string;\n  scope?: string;\n  icons?: Icon[];\n  surfaces?: SurfaceSpec[];\n  handles?: Handler[];\n  permissions?: PermissionRequest[];\n};\n\ntype Handler = {\n  port: string;\n  intent: 'preview' | 'open' | 'reveal' | 'activate';\n  accepts: string[];\n};\n\ntype Intent = {\n  src?: string;\n  port?: string;\n  wdir?: string;\n  type: string;\n  attr?: Record<string, string>;\n  data: string;\n};\n\ntype RoutedIntent = Intent & {\n  port: string;\n};\n\ntype Context = {\n  id: string;\n  app: string;\n  title?: string;\n  url: string;\n};\n\ntype Surface = {\n  id: string;\n  role: SurfaceRole;\n  contexts: string[];\n  activeContext?: string;\n  previewContext?: string;\n};\n\ntype SurfaceSpec = {\n  role: SurfaceRole;\n  forms?: SurfaceForm[];\n  placementHint?: PlacementHint;\n  reuseHint?: ReuseHint;\n  state?: { type: string; schema?: string };\n};\n\ntype Viewport = {\n  id: string;\n  client: string;\n  surface: string;\n  form: SurfaceForm;\n  focus?: string;\n};\n\ntype SurfaceRole =\n  | 'document-set'\n  | 'workspace-view'\n  | 'session-set'\n  | 'transient'\n  | 'shell';\n\ntype SurfaceForm =\n  | 'window'\n  | 'panel'\n  | 'tabset'\n  | 'volume'\n  | 'hud'\n  | 'immersive-space';\n\ntype PlacementHint =\n  | 'center'\n  | 'left'\n  | 'right'\n  | 'bottom'\n  | 'floating'\n  | 'spatial';\n\ntype ReuseHint =\n  | 'new'\n  | 'workspace'\n  | 'subject'\n  | 'source-surface';\n```\n\n## Resolved Questions\n\n### Authority\n\nThe app manifest is descriptive. It declares identity, entry points, surface\ntypes, and handler support. It does not own placement, focus, tab membership, or\npermission grants.\n\nThe window manager owns surfaces, layout, focus, preview slots, and final launch\npolicy. Apps own their state docs and app-specific interpretation of intents.\nClients own local viewports and transient presentation state.\n\n### Context\n\nA context is the running/session object. It is not a tab, pane, process, or URL.\nIt says: this app is running around this primary URL.\n\nExamples:\n\n- viewer context with `url: automerge:...README.md`\n- file picker context with `url: automerge:...file-picker-state`\n- terminal context for a shell session state doc\n\n`app` and `url` should be references, not embedded documents. For document\napps, `url` is usually the document being viewed or edited. For stateful shell\napps, `url` can be the app instance state doc, and that doc can link to its\nworkspace/root/source documents.\n\nTabs display `title ?? url`. Apps or routers may set `title` from filesystem\nmetadata when they create or update a context; the window manager does not\nresolve resource names itself.\nThose references may initially be URL strings, but the protocol should treat\nthem as document or app identities that can later become typed refs.\n\n### Surface\n\nA surface is the shell-visible container that presents one or more contexts.\nTabs belong here when the shell manages tabs. A `document-set` surface can hold\nmany viewer/editor contexts; a `workspace-view` surface usually holds one file\npicker context.\n\nThis keeps editor-like tabs in the shell/window-manager model without forcing\neach app to reinvent tab state.\n\n`contexts` are pinned/open context ids. `previewContext` is the temporary slot.\nPromoting a preview moves that context id into `contexts`; switching away from a\npreview can drop the temporary reference.\n\n### Viewport\n\nA viewport is one client's presentation of a surface. It owns local geometry,\npose, form, device-specific focus, and collapsed/expanded presentation.\n\nShared layouts can exist, but they should be explicit workspace/session state.\nDefault tablet/headset/desktop projections should not fight each other.\n\n### Intent\n\nLaunch/open/preview is a plumber-style message. It should not be encoded as a\nfake file. The router reads `type`, `attr`, and `data`, resolves a handler, then\ncreates a `RoutedIntent` with a concrete `port`.\n\n`preview` should create or reuse `previewContext`. `open` should create or reuse\na durable context. `reveal` should navigate an existing surface. `activate`\nshould focus or raise without changing content.\n\nPreviews are intentionally non-durable unless promoted by `open`. Switching away\nfrom a preview should not create a pinned tab or durable context unless the user\nor app explicitly asks for that.\n\nHints such as `placementHint`, `reuseHint`, and manifest `forms` are advisory.\nThe window manager may ignore them for device constraints, user preference,\ncollaboration policy, or safety.\n\n`Handler.accepts` matches `Intent.type`. Values should use the same MIME pattern\nlanguage as file type rules, including exact matches like `text/markdown` and\nwildcards like `image/*`.\n\n`SurfaceSpec.state` declares the state type/schema an app surface expects. For\nstateful app instances, `Context.url` points at the specific state document for\none running context.\n\n### Namespace And Services\n\nDurable resources:\n\n- documents\n- folders\n- app manifests\n- routing rules\n- saved workspace/session descriptors\n\nLive service directories:\n\n- running apps\n- surfaces/windows\n- window manager\n- router/plumber\n- device bridges\n\n`/srv` should be reserved for live mountable services. Persisted Automerge state\ndocs should move to `/state`, `/sessions`, or `/wm`.\n\nApp manifests should live under `/apps`. The router indexes manifest docs from\nthat namespace and uses their `handles` entries to route intents.\n\n### Tarstate\n\nAutomerge docs should remain the canonical state. Use the shape that best\nmatches the domain and the Ink & Switch/Patchwork file format, even when that\nshape is hierarchical.\n\nTarstate should provide the lens:\n\n- schemas describe typed projections over the document\n- relations are named views or patchable slices, not storage requirements\n- `idField`, `refField`, and `anchoredPathField` document identity, links, and\n  tree positions\n- `ephemeral` relations are appropriate for presence, local clients, and other\n  non-durable views\n- write patches compile back into the canonical Automerge tree\n\nFor example, a window-manager doc can stay hierarchical:\n\n```ts\ntype WindowManagerDoc = {\n  layout: LayoutNode;\n  surfaces: Record<string, Surface>;\n  contexts: Record<string, Context>;\n};\n```\n\nTarstate can project that as `surfaces`, `contexts`, `layoutNodes`, or\n`activeContexts` without making the saved document a database dump.\n\n### Lifecycle\n\nThe bootloader creates the initial window-manager doc, bootstrap contexts, and\nstarting surfaces. After boot, intents are the normal way to create, reuse,\nactivate, or reveal contexts.\n\nThe router chooses an app handler from `/apps`, creates a routed intent, and\nasks the window manager to place or reuse a surface. The window manager owns\nsurface creation/destruction and may garbage-collect unreferenced preview\ncontexts. Apps own app-specific state creation and updates.\n\n## Implementation Target\n\nThe first useful implementation should be small:\n\n1. Add app manifests for file picker and viewer.\n2. Model the window-manager doc as a hierarchical tree of layout, surfaces, and\n   contexts.\n3. Use Tarstate schemas as projections/write lenses over that tree.\n4. Replace URL-only tabs with contexts.\n5. Replace panes with shell-managed surfaces.\n6. Keep split layout as a WM projection over surface ids.\n7. Move persisted state docs out of `/srv`.\n\nDo not implement spatial placement, permissions, or multiple viewports until the\nbasic desktop projection is working.\n\n## Sources\n\n- Web App Manifest: https://www.w3.org/TR/appmanifest/\n- Chrome file handling: https://developer.chrome.com/docs/capabilities/web-apis/file-handling\n- Chrome extension manifest: https://developer.chrome.com/docs/extensions/reference/manifest\n- Android intents: https://developer.android.com/guide/components/intents-filters\n- Apple Info.plist keys: https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html\n- VS Code extension manifest: https://code.visualstudio.com/api/references/extension-manifest\n- EWMH window types: https://specifications.freedesktop.org/wm-spec/latest/\n- Wayland xdg-shell: https://wayland.app/protocols/xdg-shell\n- i3 user guide: https://i3wm.org/docs/userguide.html\n- xmonad StackSet: https://hackage.haskell.org/package/xmonad/docs/XMonad-StackSet.html\n- Apple visionOS overview: https://developer.apple.com/visionos/\n- WebXR Device API: https://www.w3.org/TR/webxr/\n- OMBI: https://metaverse-standards.org/open-metaverse-browser-initative/\n- Sneeze docs: https://omb.wiki/sneeze\n- Sneeze architecture: https://omb.wiki/sneeze/architecture/overview\n- Plan 9 plumber: https://9p.io/magic/man2html/4/plumber\n- Acme paper: https://9p.io/sys/doc/acme/acme.html\n"
            }
          ]
        }
      ]
    }
  ]
} as const satisfies SeedFolder;
