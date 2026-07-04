import { Repo, type DocHandle } from '@automerge/automerge-repo';

export enum EntryKind {
  File = 'file',
  Folder = 'folder',
}

export enum FileRole {
  AppManifest = 'app-manifest',
  AppState = 'app-state',
  Bootloader = 'bootloader',
  Capabilities = 'capabilities',
  HostState = 'host-state',
  Log = 'log',
  Source = 'source',
  Telemetry = 'telemetry',
  WindowManager = 'window-manager',
}

export enum SplitDirection {
  Column = 'column',
  Row = 'row',
}

export enum WorkbenchNodeKind {
  Pane = 'pane',
  Split = 'split',
}

export enum WorkbenchTabKind {
  File = 'file',
}

export type FolderEntry = {
  name: string;
  type: EntryKind;
  url: string;
};

export type FolderDoc = PatchworkDoc<EntryKind.Folder> & {
  name: string;
  entries: FolderEntry[];
};

export type FileDoc = PatchworkDoc<EntryKind.File> & {
  name: string;
  extension: string;
  mimeType: string;
  metadata: { role: FileRole };
  content?: string;
};

export type FilesystemResource = FolderDoc | FileDoc;

export type FilesystemDoc = {
  filesystem: {
    rootUrl: string;
    documents: FilesystemDocumentRow[];
  };
};

export type FilesystemDocumentRow = {
  url: string;
  entryKind: EntryKind;
  mimeType?: string;
  content?: string;
};

type PatchworkDoc<T extends EntryKind> = {
  '@patchwork': {
    type: T;
    version: 1;
  };
  entryKind: T;
};

export type FilesystemResourceRecord = {
  url: string;
  doc: FilesystemResource;
};

export type FileManagerStateDoc = PatchworkDoc<EntryKind.File> & {
  name: string;
  extension: string;
  mimeType: string;
  metadata: { app: string; instanceId: string; role: FileRole };
  activeUrl: string;
  openFolders: string[];
  selectedUrls: string[];
};

export type WorkbenchTab = {
  id: string;
  kind: WorkbenchTabKind;
  pinned: boolean;
  title: string;
  targetUrl: string;
};

export type WorkbenchPane = {
  id: string;
  activeTabId: string | null;
  pinnedTabs: WorkbenchTab[];
  previewTab: WorkbenchTab | null;
};

export type WorkbenchLayoutNode =
  | {
      direction: SplitDirection;
      children: WorkbenchLayoutNode[];
      kind: WorkbenchNodeKind.Split;
    }
  | {
      kind: WorkbenchNodeKind.Pane;
      paneId: string;
    };

export type WorkbenchStateDoc = PatchworkDoc<EntryKind.File> & {
  name: string;
  extension: string;
  mimeType: string;
  metadata: { role: FileRole };
  activePaneId: string;
  layout: WorkbenchLayoutNode;
  panes: WorkbenchPane[];
};

export type SeedFilesystem = {
  repo: Repo;
  rootUrl: string;
  indexDoc: FilesystemDoc;
  documents: FilesystemResourceRecord[];
  fileManagerHandle: DocHandle<FileManagerStateDoc>;
  workbenchHandle: DocHandle<WorkbenchStateDoc>;
};

const tigerUrl = 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg';

export function createSeedFilesystem(): SeedFilesystem {
  const repo = new Repo({ network: [] });
  const root = createFolder(repo, '', []);
  const fileManagerId = 'file-manager-1';
  const viewerId = 'viewer-1';
  const windowManagerId = 'window-manager-1';
  const fileManagerHandle = repo.create<FileManagerStateDoc>({
    '@patchwork': { type: EntryKind.File, version: 1 },
    activeUrl: root.url,
    entryKind: EntryKind.File,
    extension: 'automerge',
    metadata: { app: 'file-manager', instanceId: fileManagerId, role: FileRole.AppState },
    mimeType: 'application/vnd.automerge',
    name: `${fileManagerId}.automerge`,
    openFolders: [root.url],
    selectedUrls: [root.url],
  });
  const workbenchHandle = repo.create<WorkbenchStateDoc>({
    '@patchwork': { type: EntryKind.File, version: 1 },
    activePaneId: 'main',
    entryKind: EntryKind.File,
    extension: 'automerge',
    layout: { kind: WorkbenchNodeKind.Pane, paneId: 'main' },
    metadata: { role: FileRole.WindowManager },
    mimeType: 'application/vnd.automerge',
    name: `${windowManagerId}.automerge`,
    panes: [
      {
        activeTabId: null,
        id: 'main',
        pinnedTabs: [],
        previewTab: null,
      },
    ],
  });
  const viewerState = createFile(repo, `${viewerId}.automerge`, FileRole.AppState, {
    kind: 'app-instance',
    app: 'viewer',
    id: viewerId,
    state: { controlledBy: workbenchHandle.url },
  });
  const deviceRunApps = createFolder(repo, 'apps', [
    entry(`${fileManagerId}.automerge`, EntryKind.File, fileManagerHandle.url),
    entry(`${viewerId}.automerge`, EntryKind.File, viewerState.url),
  ]);
  const deviceRunWindows = createFolder(repo, 'windows', [
    entry(`${windowManagerId}.automerge`, EntryKind.File, workbenchHandle.url),
  ]);
  const deviceRun = createFolder(repo, 'run', [
    entry('apps', EntryKind.Folder, deviceRunApps.url),
    entry('windows', EntryKind.Folder, deviceRunWindows.url),
  ]);
  const device = createFolder(repo, 'device', [
    entry('run', EntryKind.Folder, deviceRun.url),
  ]);
  const bootloader = createFile(repo, 'bootloader.automerge', FileRole.Bootloader, {
    kind: 'bootloader',
    starts: [fileManagerHandle.url, viewerState.url, workbenchHandle.url],
  });
  const boot = createFolder(repo, 'boot', [
    entry('bootloader.automerge', EntryKind.File, bootloader.url),
  ]);
  const homeReadme = createFile(repo, 'readme.txt', FileRole.Source, 'This is a tiny filesystem namespace fixture.');
  const homeTodo = createFile(
    repo,
    'todo.md',
    FileRole.Source,
    ['# Todo', '', '- expose app state as files', '- query it with Tarstate', '- render a directory view'].join('\n'),
  );
  const home = createFolder(repo, 'home', [
    entry('readme.txt', EntryKind.File, homeReadme.url),
    entry('todo.md', EntryKind.File, homeTodo.url),
    entry('ghostscript-tiger.svg', EntryKind.File, tigerUrl),
  ]);
  const bootloaderApp = createFile(repo, 'bootloader.json', FileRole.AppManifest, {
    kind: 'app',
    id: 'bootloader',
    title: 'Bootloader',
    entry: bootloader.url,
  });
  const fileManagerApp = createFile(repo, 'file-manager.json', FileRole.AppManifest, {
    kind: 'app',
    id: 'file-manager',
    title: 'File Manager',
    entry: fileManagerHandle.url,
  });
  const terminalApp = createFile(repo, 'terminal.json', FileRole.AppManifest, {
    kind: 'app',
    id: 'terminal',
    title: 'Terminal',
    entry: null,
  });
  const viewerApp = createFile(repo, 'viewer.json', FileRole.AppManifest, {
    kind: 'app',
    id: 'viewer',
    title: 'Viewer',
    entry: viewerState.url,
  });
  const windowManagerApp = createFile(repo, 'window-manager.json', FileRole.AppManifest, {
    kind: 'app',
    id: 'window-manager',
    title: 'Window Manager',
    entry: workbenchHandle.url,
  });
  const apps = createFolder(repo, 'apps', [
    entry('bootloader.json', EntryKind.File, bootloaderApp.url),
    entry('file-manager.json', EntryKind.File, fileManagerApp.url),
    entry('terminal.json', EntryKind.File, terminalApp.url),
    entry('viewer.json', EntryKind.File, viewerApp.url),
    entry('window-manager.json', EntryKind.File, windowManagerApp.url),
  ]);
  const diagnosticsReadme = createFile(
    repo,
    'readme.txt',
    FileRole.Source,
    'Diagnostics will live here when the host has something useful to report.',
  );
  const diagnostics = createFolder(repo, 'diagnostics', [
    entry('readme.txt', EntryKind.File, diagnosticsReadme.url),
  ]);
  const events = createFile(
    repo,
    'events.log',
    FileRole.Log,
    ['boot shell', 'mount home', `launch ${fileManagerId}.automerge`, `launch ${viewerId}.automerge`].join('\n'),
  );
  const usageBudget = createFile(repo, 'session-budget.json', FileRole.Telemetry, {
    kind: 'inference-usage-budget',
    status: 'telemetry-hook',
    exactCostNzd: null,
  });
  const usage = createFolder(repo, 'usage', [
    entry('session-budget.json', EntryKind.File, usageBudget.url),
  ]);
  const browser = createFile(repo, 'browser.json', FileRole.HostState, {
    kind: 'browser-runtime',
    online: null,
    userAgent: null,
  });
  const capabilities = createFile(repo, 'capabilities.json', FileRole.Capabilities, {
    kind: 'capabilities',
    filesystem: ['automerge-doc-links', 'https-url'],
    shell: ['boot', 'device', 'home', 'system'],
  });
  const runtime = createFolder(repo, 'runtime', [
    entry('diagnostics', EntryKind.Folder, diagnostics.url),
    entry('events.log', EntryKind.File, events.url),
    entry('usage', EntryKind.Folder, usage.url),
  ]);
  const system = createFolder(repo, 'system', [
    entry('apps', EntryKind.Folder, apps.url),
    entry('browser.json', EntryKind.File, browser.url),
    entry('capabilities.json', EntryKind.File, capabilities.url),
    entry('runtime', EntryKind.Folder, runtime.url),
  ]);

  root.change((doc) => {
    doc.entries = [
      entry('boot', EntryKind.Folder, boot.url),
      entry('device', EntryKind.Folder, device.url),
      entry('home', EntryKind.Folder, home.url),
      entry('system', EntryKind.Folder, system.url),
    ];
  });

  const handles = [
    root,
    device,
    deviceRun,
    deviceRunApps,
    deviceRunWindows,
    fileManagerHandle,
    workbenchHandle,
    viewerState,
    boot,
    bootloader,
    home,
    homeReadme,
    homeTodo,
    system,
    apps,
    bootloaderApp,
    fileManagerApp,
    terminalApp,
    viewerApp,
    windowManagerApp,
    runtime,
    diagnostics,
    diagnosticsReadme,
    events,
    usage,
    usageBudget,
    browser,
    capabilities,
  ];
  const documents = handles.map((handle) => ({ url: handle.url, doc: handle.doc() }));
  const indexHandle = repo.create<FilesystemDoc>({
    filesystem: {
      rootUrl: root.url,
      documents: documents.map(documentRow),
    },
  });
  return {
    repo,
    rootUrl: root.url,
    indexDoc: indexHandle.doc(),
    documents,
    fileManagerHandle,
    workbenchHandle,
  };
}

function entry(name: string, type: EntryKind, entryUrl: string): FolderEntry {
  return { name, type, url: entryUrl };
}

function createFolder(
  repo: Repo,
  name: string,
  entries: FolderEntry[],
): DocHandle<FolderDoc> {
  return repo.create<FolderDoc>({
    '@patchwork': { type: EntryKind.Folder, version: 1 },
    entryKind: EntryKind.Folder,
    entries,
    name,
  });
}

function createFile(
  repo: Repo,
  name: string,
  role: FileRole,
  content: string | Record<string, unknown>,
): DocHandle<FileDoc> {
  return repo.create<FileDoc>({
    '@patchwork': { type: EntryKind.File, version: 1 },
    content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    entryKind: EntryKind.File,
    extension: extensionFromName(name),
    metadata: { role },
    mimeType: mimeTypeFromName(name),
    name,
  });
}

function documentRow({ url, doc }: FilesystemResourceRecord): FilesystemDocumentRow {
  if (doc.entryKind === EntryKind.Folder) return { entryKind: doc.entryKind, url };
  return {
    content: doc.content ?? JSON.stringify(doc, null, 2),
    entryKind: doc.entryKind,
    mimeType: doc.mimeType,
    url,
  };
}

function extensionFromName(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1);
}

function mimeTypeFromName(name: string): string {
  if (name.endsWith('.automerge')) return 'application/vnd.automerge';
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.log')) return 'text/plain';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}
