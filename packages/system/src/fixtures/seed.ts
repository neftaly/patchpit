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
              "content": "# Patchpit Surface Protocol\n\nPatchpit is a small shell for Automerge-backed applications. Durable data lives\nas named documents in a filesystem-like namespace. Running apps are represented\nby contexts. The window manager arranges those contexts into surfaces, tabs, and\nsplit layouts.\n\nThis document describes the target protocol shape. External systems informed the\nnotes at the end, but the model here is Patchpit's own runtime contract.\n\n## System Model\n\nPatchpit currently seeds three durable roots and reserves one live-service root:\n\n- `/apps` contains installed app manifest docs\n- `/home` contains user and workspace documents\n- `/system` contains shell-owned persistent state\n- `/srv` is reserved for future live mountable services\n\nThe bootloader creates the initial filesystem, app manifests, app instance state\ndocs, and window-manager state doc. The target flow is that apps are opened\nthrough intents after boot. The current prototype still lets the file picker\nconstruct viewer contexts directly.\n\nThe window manager owns:\n\n- layout tree and split ratios\n- surfaces and their roles\n- focus\n- tab membership\n- preview slots\n\nApps own:\n\n- their manifest docs\n- their app instance state docs\n- interpretation of routed intents\n- titles and metadata they choose to publish\n\nClients own local presentation state that should not be shared by default, such\nas viewport geometry, collapsed panels, pointer focus, or device-specific form.\n\n## Documents\n\nAutomerge docs are the canonical durable state. Patchpit uses `.am` for new\nAutomerge-backed filenames. `.automerge` remains readable for compatibility.\nBoth map to `application/vnd.automerge`.\n\nState documents should keep the shape that best matches the domain. They do not\nneed to be flattened into tables. Tarstate provides typed lenses over those docs\nfor reads, views, and writes.\n\nWithin `/system`:\n\n- `/system/apps` contains running app instance state docs\n- `/system/config` contains shell configuration docs\n- `/system/themes` contains theme docs\n- `/system/window-manager.am` contains shared window-manager state\n\nThe linked Automerge docs are the real filesystem format. `FilesystemIndexDoc`\nis an internal projection/cache used by Tarstate and the prototype UI to read\nthe linked tree efficiently. It should not become the interchange format.\n\n## App Manifests\n\nAn app manifest describes what an app is and what it can handle. It does not own\nplacement, focus, tab policy, or permission grants.\n\n```ts\ntype AppManifest = {\n  manifestVersion: 1;\n  id: string;\n  name: string;\n  entry: string;\n  scope?: string;\n  icons?: Icon[];\n  surfaces?: SurfaceSpec[];\n  handles?: Handler[];\n  permissions?: PermissionRequest[];\n};\n\ntype SurfaceSpec = {\n  role: SurfaceRole;\n  forms?: SurfaceForm[];\n  placementHint?: PlacementHint;\n  reuseHint?: ReuseHint;\n  state?: { type: string; schema?: string };\n};\n\ntype Handler = {\n  port: string;\n  intent: 'preview' | 'open' | 'reveal' | 'activate';\n  accepts: string[];\n};\n```\n\n`handles.accepts` matches MIME-like intent types. It uses the same pattern\nlanguage as file icon rules: exact matches such as `text/markdown`, wildcards\nsuch as `image/*`, and a final fallback such as `*/*`.\n\n## Intents\n\nAn intent is the message used to preview, open, reveal, or activate a resource.\nIt is the shell equivalent of a command-line invocation.\n\n```ts\ntype Intent = {\n  src?: string;\n  port?: string;\n  wdir?: string;\n  type: string;\n  attr?: Record<string, string>;\n  data: string;\n};\n\ntype RoutedIntent = Intent & {\n  port: string;\n};\n```\n\nThe router reads the intent, chooses a matching app handler from `/apps`, and\nproduces a routed intent with a concrete `port`.\n\nIntent behavior:\n\n- `preview` creates or reuses a temporary preview context\n- `open` creates or reuses a durable pinned context\n- `reveal` navigates an existing surface to show a resource\n- `activate` focuses or raises without changing content\n\nPreview contexts are intentionally non-durable until promoted. Double-clicking\nor dragging a preview tab can promote it to a pinned context.\n\n## Contexts\n\nA context is the running/session object for one app around one primary URL. It\nis not itself a tab, pane, iframe, process, or file.\n\n```ts\ntype Context = {\n  id: string;\n  app: string;\n  container: AppContainer;\n  title?: string;\n  url: string;\n};\n```\n\nExamples:\n\n- a viewer context for `automerge:...README.md`\n- a file picker context for a file-picker state doc\n- a terminal context for a terminal state doc\n\nThe shell/router assigns the context's container, which defines the app's mount\nnamespace. Tabs display a shell context label: currently filesystem path or\nruntime title, falling back to `title ?? url`.\n\n## Surfaces\n\nA surface is a shell-visible container for one or more contexts. It is the owner\nof shell-managed tabs.\n\n```ts\ntype Surface = {\n  id: string;\n  role: SurfaceRole;\n  contexts: string[];\n  activeContext?: string;\n  previewContext?: string;\n};\n\ntype SurfaceRole =\n  | 'document-set'\n  | 'workspace-view'\n  | 'session-set'\n  | 'transient'\n  | 'shell';\n```\n\n`contexts` are pinned context ids. `previewContext` is the one temporary slot. A\ndocument-set surface can hold many viewer/editor contexts. A workspace-view\nsurface usually holds one file picker context and rejects document tab drops.\n\nTab behavior:\n\n- selecting a pinned tab focuses that context\n- selecting a preview tab focuses it without pinning it\n- double-clicking a preview pins it\n- dragging a preview pins it on successful drop\n- dragging within a document-set reorders tabs\n- dragging to another document-set moves the tab there\n- dragging to a workspace-view is rejected\n- closing the active tab focuses the nearest remaining tab or preview\n\n## Layout\n\nThe window-manager doc stores a hierarchical layout tree. Split ratios belong to\nthe split node, not to the app or tab.\n\n```ts\ntype WindowManagerDoc = {\n  layout: LayoutNode;\n  surfaces: Record<string, Surface>;\n  contexts: Record<string, Context>;\n};\n```\n\nA ratio is the first child size. For example, a row split with `ratio: 0.2`\nmeans the first surface receives 20% and the second receives the remainder. If\nanother pane is added later, the existing ratio still describes only that split\nnode.\n\n## Viewports\n\nA viewport is one client's presentation of a surface. It lets multiple devices\nlook at the same shared shell state without forcing them to share every local\npresentation choice.\n\n```ts\ntype Viewport = {\n  id: string;\n  client: string;\n  surface: string;\n  form: SurfaceForm;\n  focus?: string;\n};\n\ntype SurfaceForm =\n  | 'window'\n  | 'panel'\n  | 'tabset'\n  | 'volume'\n  | 'hud'\n  | 'immersive-space';\n```\n\nShared layouts can exist, but they should be explicit workspace/session state.\nDesktop, tablet, headset, and HUD projections should not silently overwrite each\nother's local presentation.\n\n## Tarstate\n\nTarstate is the lens layer over Automerge docs. It should be used for structured\nreads and writes when a typed projection helps, while Automerge remains the\nsource of truth.\n\nTarstate schemas can expose:\n\n- named projections over hierarchical documents\n- patchable slices for writes\n- references and anchored paths\n- ephemeral relations for local or presence-like state\n\nFor the window manager, the saved Automerge doc can stay hierarchical while\nTarstate projects `surfaces`, `contexts`, `layoutNodes`, or `activeContexts` as\nneeded.\n\n## Implementation Target\n\nThe first useful implementation should stay small:\n\n1. App manifests live under `/apps`.\n2. File picker, viewer, and terminal each run as contexts.\n3. File picker state, terminal state, themes, and window-manager state live as\n   Automerge docs under `/system`.\n4. The window-manager doc owns surfaces, tabs, focus, and split layout.\n5. A router should create contexts from intents; direct file-picker-to-viewer\n   context creation is a prototype shortcut.\n6. Tarstate provides projections and write lenses over the durable docs.\n7. `/srv` remains reserved for future live services, not persisted app state.\n\nDo not implement permissions, spatial placement, or multiple viewports until the\nbasic desktop projection is stable.\n\n## Notes\n\nThe protocol is informed by app manifests, desktop window-manager protocols,\ntiling window managers, spatial shells, Plan 9 namespaces, and Tarstate schemas.\nThose references are useful for vocabulary and edge cases, but Patchpit should\nkeep the runtime boundary simple: apps describe capabilities, the shell owns\nplacement, and durable state lives in linked Automerge docs.\n\n## Sources\n\n- Web App Manifest: https://www.w3.org/TR/appmanifest/\n- Chrome file handling: https://developer.chrome.com/docs/capabilities/web-apis/file-handling\n- Chrome extension manifest: https://developer.chrome.com/docs/extensions/reference/manifest\n- Android intents: https://developer.android.com/guide/components/intents-filters\n- Apple Info.plist keys: https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html\n- VS Code extension manifest: https://code.visualstudio.com/api/references/extension-manifest\n- EWMH window types: https://specifications.freedesktop.org/wm-spec/latest/\n- Wayland xdg-shell: https://wayland.app/protocols/xdg-shell\n- i3 user guide: https://i3wm.org/docs/userguide.html\n- xmonad StackSet: https://hackage.haskell.org/package/xmonad/docs/XMonad-StackSet.html\n- Apple visionOS overview: https://developer.apple.com/visionos/\n- WebXR Device API: https://www.w3.org/TR/webxr/\n- OMBI: https://metaverse-standards.org/open-metaverse-browser-initative/\n- Sneeze docs: https://omb.wiki/sneeze\n- Sneeze architecture: https://omb.wiki/sneeze/architecture/overview\n- Plan 9 plumber: https://9p.io/magic/man2html/4/plumber\n- Acme paper: https://9p.io/sys/doc/acme/acme.html\n"
            }
          ]
        }
      ]
    }
  ]
} as const satisfies SeedFolder;
