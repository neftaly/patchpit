export type AppKind = 'terminal' | 'files' | 'viewer' | 'url';
export type ColorMode = 'auto' | 'light' | 'dark';
export type ViewerMode = 'view' | 'source';
export type FsKind = 'folder' | 'file' | 'missing';

export type BrowserInfo = {
  readonly href: string;
  readonly online: boolean;
  readonly fullscreenEnabled: boolean;
  readonly userAgent: string;
};

export type AppShortcut = {
  readonly id: string;
  readonly title: string;
  readonly app: AppKind;
  readonly args?: Record<string, unknown>;
  readonly layoutRegion?: WindowLayoutRegion;
  readonly path?: string;
  readonly mode?: ViewerMode;
  readonly url?: string;
};

export type FsEntry = {
  readonly kind: 'folder' | 'file';
  readonly name: string;
  readonly path: string;
  readonly summary: string;
};

export type FileRead =
  | {
      readonly kind: 'folder';
      readonly path: string;
      readonly entries: readonly FsEntry[];
    }
  | {
      readonly kind: 'file';
      readonly path: string;
      readonly assetUrl?: string;
      readonly mediaType: string;
      readonly text: string;
    }
  | {
      readonly kind: 'missing';
      readonly path: string;
      readonly message: string;
    };

export type TerminalState = {
  readonly kind: 'terminal';
  readonly cwd: string;
  readonly lines: readonly string[];
};

export type FilesState = {
  readonly kind: 'files';
  readonly path: string;
};

export type ViewerState = {
  readonly kind: 'viewer';
  readonly path: string;
  readonly mode: ViewerMode;
};

export type UrlState = {
  readonly kind: 'url';
  readonly src: string;
};

export type AppState = TerminalState | FilesState | ViewerState | UrlState;
export type WindowLayoutRegion = 'left' | 'main' | 'bottom';

export type WindowLayout = {
  readonly region: WindowLayoutRegion;
};

export type AppWindow = {
  readonly id: string;
  readonly layout: WindowLayout;
  readonly shortcutId: string;
  readonly title: string;
  readonly state: AppState;
};

export type KernelState = {
  readonly colorMode: ColorMode;
  readonly shortcuts: readonly AppShortcut[];
  readonly windows: readonly AppWindow[];
  readonly focusedWindowId: string | null;
  readonly selectedPath: string;
  readonly nextInstanceNumber: number;
};

type StaticFile = {
  readonly path: string;
  readonly assetUrl?: string;
  readonly mediaType: string;
  readonly text: string;
};

const damagedHelmetSrc = '/3d-viewer/DamagedHelmet/DamagedHelmet.gltf';

const defaultShortcuts: readonly AppShortcut[] = [
  { id: 'files', title: 'Files', app: 'files', layoutRegion: 'left', path: '/' },
  { id: 'terminal', title: 'Terminal', app: 'terminal', layoutRegion: 'bottom' },
  {
    id: 'ui-lab',
    title: 'ui lab prototype',
    app: 'url',
    layoutRegion: 'main',
    url: '/chargrid/index.html',
    args: { src: '/patchpit/ui/demo' }
  },
  { id: 'viewer', title: 'Viewer', app: 'viewer', layoutRegion: 'main', path: '/i&s/capture.md', mode: 'view' },
  {
    id: '3d-viewer',
    title: '3D Viewer',
    app: 'url',
    layoutRegion: 'main',
    url: '/3d-viewer/index.html',
    args: { src: damagedHelmetSrc }
  },
  {
    id: 'infinigen',
    title: 'Infinigen',
    app: 'url',
    layoutRegion: 'main',
    args: { preset: 'linz-nz', quality: 'high', seed: 'tamaki' },
    url: '/infinigen/index.html'
  },
  { id: 'roleplay', title: 'iOS Roleplay', app: 'viewer', layoutRegion: 'main', path: '/i&s/roleplay-ios.md', mode: 'view' },
  { id: 'source', title: 'View Source', app: 'viewer', layoutRegion: 'main', path: '/patchpit/apps/terminal', mode: 'source' }
];

const staticFiles: readonly StaticFile[] = [
  {
    path: '/i&s/capture.md',
    mediaType: 'text/markdown',
    text: [
      '# I&S capture',
      '',
      '- Keep app shortcuts as data.',
      '- Let the shell host files, apps, and runtime state.',
      '- Make GUI apps and terminal commands use the same paths.',
      '- Weekend app-generation rehearsal: open /i&s/roleplay-ios.md.'
    ].join('\n')
  },
  {
    path: '/i&s/roleplay-ios.md',
    mediaType: 'text/markdown',
    text: [
      '# iOS roleplay run',
      '',
      'Goal: turn a photo, screenshot, or WhatsApp image into a first usable app while the client talks naturally.',
      '',
      '1. Open Patchpit on iOS Safari.',
      '2. Import or photograph the reference image locally.',
      '3. Record or type what the client wants, who it is for, and what must be on the first screen.',
      '4. Split the agent notes into observed from image, heard from user, inferred, and needs confirmation.',
      '5. Generate the first usable screen, not a marketing page, then share the local preview URL.',
      '6. Test desktop plus iOS: layout, tap targets, keyboard overlap, long labels, missing images, and unclear states.',
      '',
      'Privacy guardrails:',
      '',
      '- Replace names, phone numbers, addresses, medical details, payment details, and private message text with placeholders.',
      '- Do not upload the source image or transcript outside the chosen local/session boundary.',
      '- Ask testers for behavior/layout feedback, not forwards of private source material.',
      '',
      'Metrics:',
      '',
      '- Time to draft spec.',
      '- Time to preview URL.',
      '- Clarifying questions asked.',
      '- First-run build errors.',
      '- Mobile pass/fail.',
      '- Issues found per device.',
      '- Time from feedback to fixed build.'
    ].join('\n')
  },
  {
    path: '/i&s/source.json',
    mediaType: 'application/json',
    text: JSON.stringify(
      {
        kind: 'capture-source',
        owner: 'patchpit-shell',
        paths: ['/patchpit/apps', '/patchpit/run/apps']
      },
      null,
      2
    )
  },
  {
    path: '/home/DamagedHelmet.gltf',
    assetUrl: damagedHelmetSrc,
    mediaType: 'model/gltf+json',
    text: JSON.stringify({ src: damagedHelmetSrc }, null, 2)
  },
  {
    path: '/home/readme.txt',
    mediaType: 'text/plain',
    text: 'This is a tiny Patchpit namespace fixture. Open files from Files or Terminal.'
  },
  {
    path: '/home/todo.md',
    mediaType: 'text/markdown',
    text: ['# Todo', '', '- terminal app', '- file manager app', '- viewer/source app', '- mosaic windows'].join('\n')
  },
  {
    path: '/patchpit/run/diagnostics/readme.txt',
    mediaType: 'text/plain',
    text: 'Diagnostics will live here when the host has something useful to report.'
  },
  {
    path: '/patchpit/run/usage/session-budget.json',
    mediaType: 'application/json',
    text: JSON.stringify(
      {
        kind: 'inference-usage-budget',
        status: 'telemetry-hook',
        currency: 'NZD',
        exactCostNzd: null,
        note: 'The shell shows a live budget placeholder. Attach runtime token/model telemetry to window.__PATCHPIT_USAGE__ for exact values.',
        fields: ['costNzd', 'inputTokens', 'outputTokens', 'updatedAt']
      },
      null,
      2
    )
  },
  {
    path: '/device/opfs/readme.txt',
    mediaType: 'text/plain',
    text: [
      'OPFS bridge fixture.',
      '',
      'This folder is only a shell namespace bridge for review.',
      'It does not claim final Origin Private File System semantics yet.'
    ].join('\n')
  },
  {
    path: '/device/opfs/fixtures/session.json',
    mediaType: 'application/json',
    text: JSON.stringify(
      {
        kind: 'opfs-bridge-fixture',
        mounted: false,
        notes: ['fixture surface for shell/file-manager tests', 'real OPFS sync policy is intentionally unresolved']
      },
      null,
      2
    )
  }
];

const staticFolders = [
  '/',
  '/device',
  '/device/opfs',
  '/device/opfs/fixtures',
  '/home',
  '/i&s',
  '/patchpit',
  '/patchpit/apps',
  '/patchpit/run',
  '/patchpit/run/apps',
  '/patchpit/run/diagnostics',
  '/patchpit/run/usage'
] as const;

export function createInitialKernelState(): KernelState {
  let state: KernelState = {
    colorMode: 'auto',
    focusedWindowId: null,
    nextInstanceNumber: 1,
    selectedPath: '/i&s/capture.md',
    shortcuts: defaultShortcuts,
    windows: []
  };

  state = launchShortcut(state, 'files');
  state = launchShortcut(state, 'infinigen');
  state = launchShortcut(state, 'terminal');

  return state;
}

export function launchShortcut(state: KernelState, shortcutId: string): KernelState {
  const shortcut = state.shortcuts.find((item) => item.id === shortcutId);

  if (shortcut === undefined) {
    return state;
  }

  const instanceNumber = state.nextInstanceNumber;
  const window = createWindow(shortcut, instanceNumber, state.selectedPath);

  return {
    ...state,
    focusedWindowId: window.id,
    nextInstanceNumber: instanceNumber + 1,
    windows: [...state.windows, window]
  };
}

export function closeWindow(state: KernelState, windowId: string): KernelState {
  const windows = state.windows.filter((window) => window.id !== windowId);
  const focusedWindowId =
    state.focusedWindowId === windowId ? (windows.at(-1)?.id ?? null) : state.focusedWindowId;

  return { ...state, focusedWindowId, windows };
}

export function focusWindow(state: KernelState, windowId: string): KernelState {
  return state.windows.some((window) => window.id === windowId) ? { ...state, focusedWindowId: windowId } : state;
}

export function selectPath(state: KernelState, path: string): KernelState {
  return { ...state, selectedPath: normalizePath(path) };
}

export function setColorMode(state: KernelState, colorMode: ColorMode): KernelState {
  return { ...state, colorMode };
}

export function setFilesPath(state: KernelState, windowId: string, path: string): KernelState {
  const normalizedPath = normalizePath(path);

  return updateWindow(state, windowId, (window) =>
    window.state.kind === 'files' ? { ...window, state: { kind: 'files', path: normalizedPath } } : window
  );
}

export function setViewerMode(state: KernelState, windowId: string, mode: ViewerMode): KernelState {
  return updateWindow(state, windowId, (window) =>
    window.state.kind === 'viewer' ? { ...window, state: { ...window.state, mode } } : window
  );
}

export function openPath(state: KernelState, path: string): KernelState {
  const normalizedPath = normalizePath(path);
  const read = readPath(state, normalizedPath);
  const shortcut: AppShortcut =
    read.kind === 'folder'
      ? { id: 'files', title: 'Files', app: 'files', path: normalizedPath }
      : isGltfFile(read)
        ? {
            id: '3d-viewer',
            title: '3D Viewer',
            app: 'url',
            layoutRegion: 'main',
            url: '/3d-viewer/index.html',
            args: { src: read.assetUrl ?? normalizedPath }
          }
      : { id: 'viewer', title: 'Viewer', app: 'viewer', path: normalizedPath, mode: 'view' };
  const window = createWindow(shortcut, state.nextInstanceNumber, state.selectedPath);

  return {
    ...state,
    focusedWindowId: window.id,
    nextInstanceNumber: state.nextInstanceNumber + 1,
    selectedPath: normalizedPath,
    windows: [...state.windows, window]
  };
}

export function runTerminalCommand(
  state: KernelState,
  windowId: string,
  commandText: string,
  browser: BrowserInfo
): KernelState {
  const command = commandText.trim();

  if (command.length === 0) {
    return state;
  }

  const terminal = state.windows.find((window) => window.id === windowId);

  if (terminal?.state.kind !== 'terminal') {
    return state;
  }

  const [name = '', ...args] = command.split(/\s+/);
  let nextState = state;
  let nextTerminalState = terminal.state;
  let output: readonly string[] = [];

  switch (name) {
    case 'apps':
      output = state.shortcuts.map((shortcut) => `${shortcut.id}\t${shortcut.title}`);
      break;
    case 'browser':
      output = [
        `href ${browser.href}`,
        `online ${String(browser.online)}`,
        `fullscreen ${String(browser.fullscreenEnabled)}`,
        `ua ${browser.userAgent}`
      ];
      break;
    case 'cat':
      output = catCommand(nextState, nextTerminalState.cwd, args[0]);
      break;
    case 'cd': {
      const path = resolvePath(nextTerminalState.cwd, args[0] ?? '/');
      const read = readPath(nextState, path);
      if (read.kind === 'folder') {
        nextTerminalState = { ...nextTerminalState, cwd: read.path };
        output = [read.path];
      } else {
        output = [read.kind === 'missing' ? read.message : `${read.path} is a file`];
      }
      break;
    }
    case 'clear':
      return replaceTerminalLines(nextState, windowId, []);
    case 'help':
      output = [
        'apps',
        'browser',
        'cat <path>',
        'cd <path>',
        'clear',
        'help',
        'inspect <path|window>',
        'launch <shortcut>',
        'ls [path]',
        'open <path>',
        'pwd',
        'state [window]',
        'open /i&s/roleplay-ios.md rehearses the iOS screenshot-to-app flow',
        '/patchpit/run/usage/session-budget.json describes the budget meter telemetry hook',
        '/device/opfs is a fixture bridge, not final OPFS semantics',
        'url shortcuts such as 3d-viewer and infinigen use root pnpm dev; pnpm dev:shell serves shell only'
      ];
      break;
    case 'inspect':
      output = inspectCommand(nextState, nextTerminalState.cwd, args[0]);
      break;
    case 'launch': {
      const shortcutId = args[0];
      if (shortcutId === undefined) {
        output = ['usage: launch <shortcut>'];
      } else if (!nextState.shortcuts.some((shortcut) => shortcut.id === shortcutId)) {
        output = [`unknown shortcut ${shortcutId}`];
      } else {
        nextState = launchShortcut(nextState, shortcutId);
        output = [`launched ${shortcutId}`];
      }
      break;
    }
    case 'ls':
      output = lsCommand(nextState, nextTerminalState.cwd, args[0]);
      break;
    case 'open': {
      const path = args[0];
      if (path === undefined) {
        output = ['usage: open <path>'];
      } else {
        const resolvedPath = resolvePath(nextTerminalState.cwd, path);
        nextState = openPath(nextState, resolvedPath);
        output = [`opened ${resolvedPath}`];
      }
      break;
    }
    case 'pwd':
      output = [nextTerminalState.cwd];
      break;
    case 'state':
      output = stateCommand(nextState, args[0] ?? windowId);
      break;
    default:
      output = [`unknown command ${name}`];
      break;
  }

  return replaceTerminalState(nextState, windowId, {
    ...nextTerminalState,
    lines: [...nextTerminalState.lines, `$ ${command}`, ...output]
  });
}

export function readPath(state: KernelState, path: string): FileRead {
  const normalizedPath = normalizePath(path);
  const staticFile = staticFiles.find((file) => file.path === normalizedPath);

  if (staticFile !== undefined) {
    return {
      kind: 'file',
      ...(staticFile.assetUrl === undefined ? {} : { assetUrl: staticFile.assetUrl }),
      mediaType: staticFile.mediaType,
      path: staticFile.path,
      text: staticFile.text
    };
  }

  if (normalizedPath.startsWith('/patchpit/apps/')) {
    const id = basename(normalizedPath);
    const shortcut = state.shortcuts.find((item) => item.id === id);
    return shortcut === undefined ? missing(normalizedPath) : jsonFile(normalizedPath, shortcut);
  }

  if (normalizedPath.startsWith('/patchpit/run/apps/')) {
    const id = basename(normalizedPath);
    const window = state.windows.find((item) => item.id === id);
    return window === undefined ? missing(normalizedPath) : jsonFile(normalizedPath, window);
  }

  if (folderPaths(state).has(normalizedPath)) {
    return { kind: 'folder', path: normalizedPath, entries: listPath(state, normalizedPath) };
  }

  return missing(normalizedPath);
}

export function listPath(state: KernelState, path: string): readonly FsEntry[] {
  const normalizedPath = normalizePath(path);
  const paths = [...allPaths(state)].filter(
    (itemPath) => itemPath !== normalizedPath && parentPath(itemPath) === normalizedPath
  );

  return paths
    .map((itemPath) => {
      const read = readPath(state, itemPath);
      const kind: FsEntry['kind'] = read.kind === 'folder' ? 'folder' : 'file';
      return {
        kind,
        name: basename(itemPath),
        path: itemPath,
        summary: summaryFor(read)
      };
    })
    .sort((left, right) => (left.kind === right.kind ? left.name.localeCompare(right.name) : left.kind === 'folder' ? -1 : 1));
}

export function windowTitle(window: AppWindow): string {
  switch (window.state.kind) {
    case 'files':
      return `${window.title} ${window.state.path}`;
    case 'terminal':
      return `${window.title} ${window.state.cwd}`;
    case 'viewer':
      return `${window.title} ${window.state.path}`;
    case 'url':
      return `${window.title} ${window.state.src}`;
  }
}

export function normalizePath(input: string): string {
  const trimmed = input.trim();
  const absolute = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const parts = absolute.split('/').filter((part) => part.length > 0 && part !== '.');
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      normalizedParts.pop();
    } else {
      normalizedParts.push(part);
    }
  }

  return normalizedParts.length === 0 ? '/' : `/${normalizedParts.join('/')}`;
}

export function parentPath(path: string): string {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === '/') {
    return '/';
  }

  const parentParts = normalizedPath.split('/').slice(0, -1);
  return parentParts.length <= 1 ? '/' : parentParts.join('/');
}

function createWindow(shortcut: AppShortcut, instanceNumber: number, selectedPath: string): AppWindow {
  const id = `${shortcut.id}-${instanceNumber}`;
  const layout = { region: shortcut.layoutRegion ?? defaultLayoutRegion(shortcut.app) };
  const title = shortcut.title;

  switch (shortcut.app) {
    case 'files':
      return {
        id,
        layout,
        shortcutId: shortcut.id,
        title,
        state: { kind: 'files', path: normalizePath(shortcut.path ?? '/') }
      };
    case 'terminal':
      return {
        id,
        layout,
        shortcutId: shortcut.id,
        title,
        state: {
          kind: 'terminal',
          cwd: '/',
          lines: ['Patchpit terminal', 'try: help, ls /patchpit/apps, open /i&s/capture.md']
        }
      };
    case 'viewer':
      return {
        id,
        layout,
        shortcutId: shortcut.id,
        title,
        state: {
          kind: 'viewer',
          mode: shortcut.mode ?? 'view',
          path: normalizePath(shortcut.path ?? selectedPath)
        }
      };
    case 'url':
      return {
        id,
        layout,
        shortcutId: shortcut.id,
        title,
        state: {
          kind: 'url',
          src: appUrl(shortcut.url ?? '/', shortcut.args ?? {})
        }
      };
  }
}

function defaultLayoutRegion(app: AppKind): WindowLayoutRegion {
  return app === 'files' ? 'left' : app === 'terminal' ? 'bottom' : 'main';
}

export function appUrl(url: string, args: Record<string, unknown>): string {
  return `${url}#${JSON.stringify(args)}`;
}

function isGltfFile(read: FileRead): read is Extract<FileRead, { readonly kind: 'file' }> {
  return read.kind === 'file' && (read.mediaType === 'model/gltf+json' || read.path.endsWith('.gltf'));
}

function updateWindow(state: KernelState, windowId: string, updater: (window: AppWindow) => AppWindow): KernelState {
  return {
    ...state,
    windows: state.windows.map((window) => (window.id === windowId ? updater(window) : window))
  };
}

function replaceTerminalState(state: KernelState, windowId: string, terminalState: TerminalState): KernelState {
  return updateWindow(state, windowId, (window) =>
    window.state.kind === 'terminal' ? { ...window, state: terminalState } : window
  );
}

function replaceTerminalLines(state: KernelState, windowId: string, lines: readonly string[]): KernelState {
  return updateWindow(state, windowId, (window) =>
    window.state.kind === 'terminal' ? { ...window, state: { ...window.state, lines } } : window
  );
}

function resolvePath(cwd: string, input: string): string {
  return normalizePath(input.startsWith('/') ? input : `${cwd}/${input}`);
}

function catCommand(state: KernelState, cwd: string, input: string | undefined): readonly string[] {
  if (input === undefined) {
    return ['usage: cat <path>'];
  }

  const read = readPath(state, resolvePath(cwd, input));

  if (read.kind === 'file') {
    return read.text.split('\n');
  }

  return [read.kind === 'folder' ? `${read.path} is a folder` : read.message];
}

function inspectCommand(state: KernelState, cwd: string, input: string | undefined): readonly string[] {
  if (input === undefined) {
    return ['usage: inspect <path|window>'];
  }

  const window = state.windows.find((item) => item.id === input);

  if (window !== undefined) {
    return JSON.stringify(window, null, 2).split('\n');
  }

  const read = readPath(state, resolvePath(cwd, input));
  return JSON.stringify(read, null, 2).split('\n');
}

function lsCommand(state: KernelState, cwd: string, input: string | undefined): readonly string[] {
  const read = readPath(state, input === undefined ? cwd : resolvePath(cwd, input));

  if (read.kind === 'folder') {
    return read.entries.map((entry) => `${entry.kind}\t${entry.name}\t${entry.summary}`);
  }

  if (read.kind === 'file') {
    return [`file\t${basename(read.path)}\t${read.mediaType}`];
  }

  return [read.message];
}

function stateCommand(state: KernelState, windowId: string): readonly string[] {
  const window = state.windows.find((item) => item.id === windowId);
  return window === undefined ? [`unknown window ${windowId}`] : JSON.stringify(window.state, null, 2).split('\n');
}

function folderPaths(state: KernelState): Set<string> {
  return new Set([...staticFolders, ...state.shortcuts.map((shortcut) => parentPath(`/patchpit/apps/${shortcut.id}`)), ...state.windows.map((window) => parentPath(`/patchpit/run/apps/${window.id}`))]);
}

function allPaths(state: KernelState): Set<string> {
  const paths = new Set<string>([
    ...staticFolders,
    ...staticFiles.map((file) => file.path),
    ...state.shortcuts.map((shortcut) => `/patchpit/apps/${shortcut.id}`),
    ...state.windows.map((window) => `/patchpit/run/apps/${window.id}`)
  ]);

  for (const itemPath of [...paths]) {
    let parent = parentPath(itemPath);

    while (!paths.has(parent)) {
      paths.add(parent);
      parent = parentPath(parent);
    }
  }

  return paths;
}

function basename(path: string): string {
  const parts = normalizePath(path).split('/');
  return parts.at(-1) ?? '/';
}

function jsonFile(path: string, value: unknown): FileRead {
  return {
    kind: 'file',
    mediaType: 'application/json',
    path,
    text: JSON.stringify(value, null, 2)
  };
}

function missing(path: string): FileRead {
  return {
    kind: 'missing',
    message: `missing ${path}`,
    path
  };
}

function summaryFor(read: FileRead): string {
  switch (read.kind) {
    case 'folder':
      return `${read.entries.length} entries`;
    case 'file':
      return read.mediaType;
    case 'missing':
      return read.message;
  }
}
