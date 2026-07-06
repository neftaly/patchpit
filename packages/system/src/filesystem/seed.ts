import { Repo, type DocHandle } from '@automerge/automerge-repo';
import { seedFileTypes, seedTree, type SeedNode } from '../fixtures/seed';
import {
  plannedSharedRuntimePlatformFeatures,
  requiredRuntimeBootFeatures,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
} from '../runtime/platform';
import { runtimeProtocol, type RuntimeHelloAck } from '../runtime/protocol';
import { relationSchemaRegistry, type PatchpitRelationSchemaDescriptor } from '../schema';
import { rootContainer } from './container';
import {
  filePickerStateSchema,
  patchpitDocMetadata,
  patchpitDocSchemaRef,
} from './schemas';
import {
  appendFolderEntries,
  createFilesystemIndexDoc,
  createPatchpitFileDoc,
  createPatchpitFolderDoc,
  folderEntry,
  removeFilesystemIndexResources,
  replaceFolderEntries,
  syncFilesystemIndexResource,
} from './resources';
import {
  automergeMimeType,
  automergeExtension,
  automergeFileName,
  PatchpitType,
  SplitDirection,
  SurfaceRole,
  WindowManagerNodeKind,
  type AppManifestDoc,
  type AppManifestHandler,
  type AppearanceDoc,
  type FileDoc,
  type FilePickerStateDoc,
  type FilesystemIndexDoc,
  type FileTypesDoc,
  type FolderDoc,
  type FolderEntry,
  type RuntimeFeatureRequirement,
  type RuntimeComponentState,
  type RuntimeStateDoc,
  type RuntimeStateFeatures,
  type SeedFilesystem,
  type SurfaceSpec,
  type ThemeDoc,
  type ThemeMetrics,
  type ThemePalette,
  type ThemeTypography,
  ThemeMode,
  type WindowManagerStateDoc,
} from './types';

export function createSeedFilesystem(): SeedFilesystem {
  const repo = new Repo({ network: [] });
  const root = createFolder(repo, '', []);
  const fileTypesName = automergeFileName('file-types');
  const filePickerStateId = 'file-picker-1';
  const lightThemeHandle = repo.create<ThemeDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.Theme),
    extension: automergeExtension,
    metrics: sharedMetrics,
    mimeType: automergeMimeType,
    name: automergeFileName('one-light'),
    palette: lightPalette,
    title: 'One Light',
    typography: sharedTypography,
  });
  const darkThemeHandle = repo.create<ThemeDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.Theme),
    extension: automergeExtension,
    metrics: sharedMetrics,
    mimeType: automergeMimeType,
    name: automergeFileName('one-dark'),
    palette: darkPalette,
    title: 'One Dark',
    typography: sharedTypography,
  });
  const appearanceHandle = repo.create<AppearanceDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.Appearance),
    darkThemeUrl: darkThemeHandle.url,
    extension: automergeExtension,
    lightThemeUrl: lightThemeHandle.url,
    mimeType: automergeMimeType,
    mode: ThemeMode.System,
    name: automergeFileName('appearance'),
  });
  const appPackages = [
    installSeedAppPackage(repo, {
      entry: 'index.html',
      entryKind: 'html',
      files: filePickerAppFiles,
      handles: [],
      icon: '📁',
      id: 'file-picker',
      name: 'File Picker',
      surfaces: [stateSurface(SurfaceRole.WorkspaceView, PatchpitType.FilePickerState)],
      schemas: [filePickerStateSchema],
    }),
    installSeedAppPackage(repo, {
      entry: 'index.html',
      entryKind: 'html',
      files: viewerAppFiles,
      handles: [
        { accepts: ['*/*'], intent: 'preview', port: 'view' },
        { accepts: ['*/*'], intent: 'open', port: 'view' },
        { accepts: ['*/*'], intent: 'reveal', port: 'view' },
        { accepts: ['*/*'], intent: 'activate', port: 'view' },
      ],
      icon: '📄',
      id: 'viewer',
      name: 'Viewer',
      surfaces: [
        {
          role: SurfaceRole.DocumentSet,
        },
      ],
    }),
    installSeedAppPackage(repo, {
      entry: 'index.html',
      entryKind: 'html',
      files: helloWorldAppFiles,
      handles: [],
      icon: '👋',
      id: 'hello-world',
      name: 'Hello World',
      surfaces: [
        {
          role: SurfaceRole.DocumentSet,
        },
      ],
    }),
  ];
  const fileTypesHandle = repo.create<FileTypesDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.FileTypes),
    extension: automergeExtension,
    fileTypes: seedFileTypes.map(({ emoji, match }) => ({ emoji, match })),
    mimeType: automergeMimeType,
    name: fileTypesName,
  });
  const filePickerStateHandle = repo.create<FilePickerStateDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.FilePickerState),
    extension: automergeExtension,
    fileTypesUrl: fileTypesHandle.url,
    mimeType: automergeMimeType,
    name: automergeFileName(filePickerStateId),
    openFolders: {},
    rootUrl: root.url,
    selectedUrls: [],
  });
  const windowManagerHandle = repo.create<WindowManagerStateDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.WindowManagerState),
    contexts: {
      'file-picker': {
        app: 'file-picker',
        container: rootContainer(root.url),
        id: 'file-picker',
        title: 'File Picker',
        url: filePickerStateHandle.url,
      },
    },
    extension: automergeExtension,
    focus: 'files',
    layout: {
      direction: SplitDirection.Row,
      first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
      kind: WindowManagerNodeKind.Split,
      ratio: 0.32,
      second: { kind: WindowManagerNodeKind.Surface, surfaceId: 'main' },
    },
    mimeType: automergeMimeType,
    name: automergeFileName('window-manager'),
    surfaces: {
      files: {
        activeContext: 'file-picker',
        contexts: ['file-picker'],
        id: 'files',
        role: SurfaceRole.WorkspaceView,
      },
      main: {
        contexts: [],
        id: 'main',
        role: SurfaceRole.DocumentSet,
      },
    },
  });
  const runtimeStateHandle = createRuntimeStateHandle(repo, 'runtime-boot-gate');
  const apps = createFolder(repo, 'apps', appPackages.map((appPackage) => appPackage.entry));
  const systemApps = createFolder(repo, 'apps', [
    folderEntry(automergeFileName(filePickerStateId), PatchpitType.FilePickerState, filePickerStateHandle.url),
  ]);
  const systemThemes = createFolder(repo, 'themes', [
    folderEntry(automergeFileName('one-dark'), PatchpitType.Theme, darkThemeHandle.url),
    folderEntry(automergeFileName('one-light'), PatchpitType.Theme, lightThemeHandle.url),
  ]);
  const systemConfig = createFolder(repo, 'config', [
    folderEntry(automergeFileName('appearance'), PatchpitType.Appearance, appearanceHandle.url),
    folderEntry(fileTypesName, PatchpitType.FileTypes, fileTypesHandle.url),
  ]);
  const systemRuntime = createFolder(repo, 'runtime', [
    folderEntry(automergeFileName('runtime-boot-gate'), PatchpitType.RuntimeState, runtimeStateHandle.url),
  ]);
  const system = createFolder(repo, 'system', [
    folderEntry('apps', PatchpitType.Folder, systemApps.url),
    folderEntry('config', PatchpitType.Folder, systemConfig.url),
    folderEntry('runtime', PatchpitType.Folder, systemRuntime.url),
    folderEntry('themes', PatchpitType.Folder, systemThemes.url),
    folderEntry(automergeFileName('window-manager'), PatchpitType.WindowManagerState, windowManagerHandle.url),
  ]);
  const homeFixture = createFixtureEntries(repo, homeSeedChildren(seedTree.children));
  const home = createFolder(repo, 'home', homeFixture.entries);

  root.change((doc) => {
    appendFolderEntries(doc, [
      folderEntry('apps', PatchpitType.Folder, apps.url),
      folderEntry('home', PatchpitType.Folder, home.url),
      folderEntry('system', PatchpitType.Folder, system.url),
    ]);
  });

  const handles = [
    root,
    apps,
    system,
    systemApps,
    systemConfig,
    systemRuntime,
    systemThemes,
    ...appPackages.flatMap((appPackage) => appPackage.handles),
    home,
    fileTypesHandle,
    appearanceHandle,
    darkThemeHandle,
    lightThemeHandle,
    filePickerStateHandle,
    windowManagerHandle,
    runtimeStateHandle,
    ...homeFixture.handles,
  ];
  const indexHandle = repo.create<FilesystemIndexDoc>(createFilesystemIndexDoc(root.url, handles));
  return {
    repo,
    rootUrl: root.url,
    appearanceHandle,
    darkThemeHandle,
    documentHandles: Object.fromEntries(handles.map((handle) => [handle.url, handle])),
    fileTypesHandle,
    filePickerStateHandle,
    indexHandle,
    lightThemeHandle,
    runtimeStateHandle,
    systemAppsHandle: systemApps,
    systemRuntimeHandle: systemRuntime,
    windowManagerHandle,
  };
}

export function removeSystemAppResource(
  filesystem: SeedFilesystem,
  url: string,
): boolean {
  const hasFolderEntry = filesystem.systemAppsHandle.doc().docs.some((entry) => entry.url === url);
  const hasIndexRow = filesystem.indexHandle.doc().filesystemIndex.documents.some((row) => row.url === url);
  const hasDocumentHandle = Object.hasOwn(filesystem.documentHandles, url);
  if (!hasFolderEntry && !hasIndexRow && !hasDocumentHandle) return false;

  if (hasFolderEntry) {
    filesystem.systemAppsHandle.change((doc) => {
      replaceFolderEntries(
        doc.docs,
        doc.docs.filter((entry) => entry.url !== url),
      );
    });
  }

  delete filesystem.documentHandles[url];

  if (hasFolderEntry || hasIndexRow) {
    removeFilesystemIndexResources(filesystem.indexHandle, [url], {
      syncHandles: hasFolderEntry ? [filesystem.systemAppsHandle] : [],
    });
  }

  return true;
}

export function recordRuntimeBootGateAck(
  filesystem: SeedFilesystem,
  input: {
    readonly ack: RuntimeHelloAck;
    readonly platform: RuntimePlatformReport;
  },
): void {
  if (runtimeBootGateAckAlreadyRecorded(filesystem.runtimeStateHandle.doc(), input)) return;

  filesystem.runtimeStateHandle.change((doc) => {
    doc.protocol = {
      id: input.ack.protocol,
      buildId: input.ack.buildId,
    };
    doc.boot = {
      status: 'ready',
      clientId: input.ack.clientId,
      runtimeInstanceId: input.ack.runtimeInstanceId,
      workspaceId: input.ack.workspaceId,
    };
    doc.features = runtimeStateFeatures(input.platform, true);
    doc.workers = [
      sharedWorkerBootGateState('ready', input.ack),
      bootstrapRuntimeState(),
    ];
  });
  syncFilesystemIndexResource(filesystem.indexHandle, filesystem.runtimeStateHandle);
}

function createRuntimeStateHandle(
  repo: Repo,
  stateId: string,
): DocHandle<RuntimeStateDoc> {
  return repo.create<RuntimeStateDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.RuntimeState),
    boot: {
      status: 'waiting-for-boot-gate-helloAck',
    },
    extension: automergeExtension,
    features: runtimeStateFeatures(),
    mimeType: automergeMimeType,
    name: automergeFileName(stateId),
    ownership: runtimeStateOwnership,
    protocol: {
      id: runtimeProtocol,
      buildId: 'unrecorded',
    },
    title: 'Runtime Boot Gate',
    workers: [
      sharedWorkerBootGateState('waiting-for-boot-gate-helloAck'),
      bootstrapRuntimeState(),
    ],
  });
}

const runtimeStateOwnership = {
  canonicalState: 'automerge',
  currentAutomergeHandleOwner: 'apps/shell/src/runtime/bootstrap-runtime.ts',
  note: 'The in-process bootstrap runtime owns Automerge handles; the SharedWorker is only a hello/ack and stale-build boot gate until runtime ownership moves.',
} as const;

function runtimeStateFeatures(
  platform?: RuntimePlatformReport,
  helloAckAvailable = false,
): RuntimeStateFeatures {
  return {
    requiredCurrentBoot: [
      ...requiredRuntimeBootFeatures.map((feature) => runtimePlatformFeature(feature, platform)),
      helloAckFeature(platform, helloAckAvailable),
    ],
    plannedRuntime: plannedSharedRuntimePlatformFeatures.map((feature) => runtimePlatformFeature(feature, platform)),
  };
}

function runtimePlatformFeature(
  feature: RuntimePlatformFeature,
  platform: RuntimePlatformReport | undefined,
): RuntimeFeatureRequirement {
  const requirement: RuntimeFeatureRequirement = { name: feature };
  if (platform !== undefined) requirement.available = platform.features[feature];
  return requirement;
}

function helloAckFeature(
  platform: RuntimePlatformReport | undefined,
  available: boolean,
): RuntimeFeatureRequirement {
  const requirement: RuntimeFeatureRequirement = {
    name: 'moduleSharedWorkerHelloAck',
    note: 'Module SharedWorker hello/ack with the page build id.',
  };
  if (platform !== undefined) requirement.available = available;
  return requirement;
}

function sharedWorkerBootGateState(
  status: Extract<RuntimeComponentState['status'], 'waiting-for-boot-gate-helloAck' | 'ready'>,
  ack?: RuntimeHelloAck,
): RuntimeComponentState {
  return {
    id: 'shared-worker-boot-gate',
    kind: 'shared-worker-boot-gate',
    status,
    ...(ack === undefined
      ? {}
      : {
          buildId: ack.buildId,
          clientId: ack.clientId,
          runtimeInstanceId: ack.runtimeInstanceId,
          workspaceId: ack.workspaceId,
        }),
    ownsAutomergeHandles: false,
    note: 'The SharedWorker currently owns only module hello/ack and stale-build shutdown.',
  };
}

function bootstrapRuntimeState(): RuntimeComponentState {
  return {
    id: 'bootstrap-runtime',
    kind: 'in-process-bootstrap-runtime',
    status: 'active',
    ownsAutomergeHandles: true,
    note: 'The in-process bootstrap runtime currently owns seed Automerge handles and commits runtime intents.',
  };
}

function runtimeBootGateAckAlreadyRecorded(
  doc: RuntimeStateDoc,
  input: {
    readonly ack: RuntimeHelloAck;
    readonly platform: RuntimePlatformReport;
  },
): boolean {
  return doc.boot.status === 'ready'
    && doc.boot.clientId === input.ack.clientId
    && doc.boot.runtimeInstanceId === input.ack.runtimeInstanceId
    && doc.boot.workspaceId === input.ack.workspaceId
    && doc.protocol.id === input.ack.protocol
    && doc.protocol.buildId === input.ack.buildId
    && JSON.stringify(doc.features) === JSON.stringify(runtimeStateFeatures(input.platform, true));
}

const sharedMetrics = {
  appBorder: '1px',
  detailPad: '0.75rem',
  previewImageWidth: '28rem',
  tabControlMargin: '2px',
  tabPad: '0.375rem',
} as const satisfies ThemeMetrics;

const sharedTypography = {
  codeFont: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  codeLineHeight: '1.55',
  codeSize: '0.8125rem',
} as const satisfies ThemeTypography;

const lightPalette = {
  background: '#dcdcddff',
  border: '#c9c9caff',
  code: '#242529ff',
  hover: '#dfdfe0ff',
  muted: '#58585aff',
  selectedBackground: '#cacacaff',
  selectedText: '#242529ff',
  sidebar: '#ebebecff',
  surface: '#fafafaff',
  tabs: '#ebebecff',
  text: '#242529ff',
  treeGuide: '#dfdfe0ff',
} as const satisfies ThemePalette;

const darkPalette = {
  background: '#3b414dff',
  border: '#464b57ff',
  code: '#acb2beff',
  hover: '#363c46ff',
  muted: '#a9afbcff',
  selectedBackground: '#454a56ff',
  selectedText: '#dce0e5ff',
  sidebar: '#2f343eff',
  surface: '#282c33ff',
  tabs: '#2f343eff',
  text: '#dce0e5ff',
  treeGuide: '#363c46ff',
} as const satisfies ThemePalette;

function stateSurface(role: SurfaceRole, type: PatchpitType): SurfaceSpec {
  return { role, state: { schema: patchpitDocSchemaRef(type), type } };
}

function homeSeedChildren(nodes: readonly SeedNode[]): readonly SeedNode[] {
  return nodes.flatMap((node) => (
    node.kind === 'folder' && node.name === 'home' ? node.children : [node]
  ));
}

function createFixtureEntries(repo: Repo, nodes: readonly SeedNode[]) {
  const handles: Array<DocHandle<FileDoc | FolderDoc>> = [];
  const entries = nodes.map((node) => {
    const created = createFixtureNode(repo, node);
    handles.push(...created.handles);
    return created.entry;
  });
  return { entries, handles };
}

function createFixtureNode(repo: Repo, node: SeedNode): {
  entry: FolderEntry;
  handles: Array<DocHandle<FileDoc | FolderDoc>>;
} {
  if (node.kind === 'file') {
    if (node.url !== undefined) {
      return {
        entry: folderEntry(node.name, PatchpitType.File, node.url),
        handles: [],
      };
    }
    const handle = createFile(repo, node.name, node.content ?? '');
    return {
      entry: folderEntry(node.name, PatchpitType.File, handle.url),
      handles: [handle],
    };
  }

  const children = createFixtureEntries(repo, node.children);
  const handle = createFolder(repo, node.name, children.entries);
  return {
    entry: folderEntry(node.name, PatchpitType.Folder, handle.url),
    handles: [handle, ...children.handles],
  };
}

type SeedAppPackageFile = {
  readonly content: string;
  readonly name: string;
};

type SeedAppPackageInput = {
  readonly entry: string;
  readonly entryKind: AppManifestDoc['entryKind'];
  readonly files: readonly SeedAppPackageFile[];
  readonly handles: AppManifestHandler[];
  readonly icon: string;
  readonly id: string;
  readonly name: string;
  readonly schemas?: readonly PatchpitRelationSchemaDescriptor[];
  readonly surfaces: SurfaceSpec[];
};

type SeedAppPackage = {
  readonly entry: FolderEntry;
  readonly handles: Array<DocHandle<AppManifestDoc | FileDoc | FolderDoc>>;
};

function installSeedAppPackage(repo: Repo, input: SeedAppPackageInput): SeedAppPackage {
  const manifestHandle = createAppManifest(repo, input);
  const fileHandles = input.files.map((file) => createFile(repo, file.name, file.content));
  const entryFileName = packageEntryFileName(input.entry);
  if (!input.files.some((file) => file.name === entryFileName)) {
    throw new Error(`Seed app ${input.id} is missing entry resource ${entryFileName}.`);
  }

  const packageHandle = createFolder(repo, input.id, [
    folderEntry(automergeFileName('manifest'), PatchpitType.AppManifest, manifestHandle.url),
    ...fileHandles.map((handle) => folderEntry(handle.doc().name, PatchpitType.File, handle.url)),
  ]);

  return {
    entry: folderEntry(input.id, PatchpitType.Folder, packageHandle.url),
    handles: [packageHandle, manifestHandle, ...fileHandles],
  };
}

function packageEntryFileName(entry: string): string {
  const lastSlash = entry.lastIndexOf('/');
  return lastSlash === -1 ? entry : entry.slice(lastSlash + 1);
}

function createAppManifest(
  repo: Repo,
  input: {
    entry: string;
    entryKind: AppManifestDoc['entryKind'];
    handles: AppManifestHandler[];
    icon: string;
    id: string;
    name: string;
    schemas?: readonly PatchpitRelationSchemaDescriptor[];
    surfaces: SurfaceSpec[];
  },
): DocHandle<AppManifestDoc> {
  return repo.create<AppManifestDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.AppManifest),
    entry: input.entry,
    entryKind: input.entryKind,
    extension: automergeExtension,
    handles: input.handles,
    icons: [{ emoji: input.icon }],
    id: input.id,
    manifestVersion: 1,
    mimeType: automergeMimeType,
    name: input.name,
    ...(input.schemas === undefined ? {} : { schemas: relationSchemaRegistry(...input.schemas) }),
    surfaces: input.surfaces,
    version: '0.0.0',
  });
}

function createFolder(
  repo: Repo,
  name: string,
  entries: FolderEntry[],
): DocHandle<FolderDoc> {
  return repo.create<FolderDoc>(createPatchpitFolderDoc(name, entries));
}

function createFile(
  repo: Repo,
  name: string,
  content: string,
): DocHandle<FileDoc> {
  return repo.create<FileDoc>(createPatchpitFileDoc(name, content));
}

const helloWorldAppFiles = [
  {
    content: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hello World</title>
    <link rel="stylesheet" href="./style.css">
    <script type="module" src="./app.js"></script>
  </head>
  <body>
    <div id="patchpit-root"></div>
  </body>
</html>
`,
    name: 'index.html',
  },
  {
    content: `export default async function activate(env) {
  const root = document.getElementById('patchpit-root') ?? document.body;
  root.innerHTML = '';
  const main = document.createElement('main');
  main.style.cssText = 'display:grid;place-content:center;min-height:100%;gap:0.5rem;font:16px system-ui,sans-serif;text-align:center;';
  const heading = document.createElement('h1');
  heading.textContent = 'Hello from /apps/hello-world';
  const detail = document.createElement('p');
  detail.textContent = 'Requesting host launch view...';
  main.append(heading, detail);
  root.append(main);

  try {
    if (typeof env.services?.view !== 'function') {
      throw new Error('view service unavailable');
    }
    const launch = await env.services.view({ name: 'launch' });
    const session = launch?.session ?? env.session;
    detail.textContent = 'Launch view: ' + (launch?.appId ?? env.appId) + ' / ' + session.id;
    const url = document.createElement('p');
    url.textContent = 'Session URL: ' + session.url;
    main.append(url);
  } catch (error) {
    detail.textContent = 'Launch view unavailable: ' + (error instanceof Error ? error.message : String(error));
  }
}
`,
    name: 'app.js',
  },
  {
    content: `html,
body,
#patchpit-root {
  height: 100%;
  margin: 0;
}

body {
  background: transparent;
}
`,
    name: 'style.css',
  },
] as const satisfies readonly SeedAppPackageFile[];

const filePickerAppFiles = [
  {
    content: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>File Picker</title>
    <link rel="stylesheet" href="./style.css">
    <script type="module" src="./app.js"></script>
  </head>
  <body>
    <div id="patchpit-root"></div>
  </body>
</html>
`,
    name: 'index.html',
  },
  {
    content: `const filePickerDragType = 'application/x.patchpit-file';
const selectAction = 'filePicker.selectUrl';
const toggleFolderAction = 'filePicker.toggleFolder';
const previewAction = 'route.preview';
const openAction = 'route.open';

let currentView;
let hostEnv;

export default async function activate(env) {
  hostEnv = env;
  const root = document.getElementById('patchpit-root') ?? document.body;
  root.innerHTML = '';

  const main = document.createElement('main');
  main.className = 'file-picker-app';
  root.append(main);

  await refresh(main);
}

async function refresh(main) {
  try {
    currentView = await hostEnv.services.view({ name: 'file-picker' });
    render(main, currentView);
  } catch (error) {
    main.replaceChildren(notice('File picker unavailable', error instanceof Error ? error.message : String(error)));
  }
}

function render(main, view) {
  const tree = document.createElement('nav');
  tree.className = 'tree-pane';
  tree.setAttribute('aria-label', 'project explorer');

  const list = document.createElement('ul');
  list.className = 'tree';
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', 'project files');
  list.append(treeItem(view.root, view, 0));
  tree.append(list);
  main.replaceChildren(tree);
}

function treeItem(node, view, depth) {
  const state = view.state;
  const isFolder = node.kind === 'folder';
  const isOpen = isFolderOpen(state, node.url);
  const isSelected = state.selectedUrls.includes(node.url);
  const isActive = state.activeUrl === node.url;
  const displayName = node.name || '/';

  const item = document.createElement('li');
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-selected', String(isSelected));
  if (isFolder) item.setAttribute('aria-expanded', String(isOpen));
  if (isActive) item.dataset.active = '';

  const button = document.createElement('button');
  button.className = 'tree-item';
  button.draggable = true;
  button.type = 'button';
  button.style.setProperty('--tree-depth-size', depth + 'rem');
  button.setAttribute('aria-pressed', String(isSelected));

  const icon = document.createElement('span');
  icon.className = 'emoji-icon tree-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = isFolder ? (isOpen ? '📂' : '📁') : fileIcon(view.fileTypes, node.mediaType);
  button.append(icon);

  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = displayName;
  button.append(name);

  button.addEventListener('click', (event) => {
    void selectFromPointer(event, node, view, displayName);
  });
  button.addEventListener('dblclick', () => {
    void act({ name: openAction, title: displayName, url: node.url });
  });
  button.addEventListener('dragstart', (event) => {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData(filePickerDragType, JSON.stringify({ title: displayName, url: node.url }));
  });

  item.append(button);

  if (isFolder && isOpen) {
    const group = document.createElement('ul');
    group.setAttribute('role', 'group');
    group.style.setProperty('--tree-depth-size', (depth + 1) + 'rem');
    for (const child of node.children ?? []) group.append(treeItem(child, view, depth + 1));
    item.append(group);
  }

  return item;
}

async function selectFromPointer(event, node, view, title) {
  const visibleUrls = visibleFilePickerUrls(view.root, view.state);
  const options = event.shiftKey
    ? { selectedUrls: selectionRange(view.state.activeUrl, node.url, visibleUrls) }
    : event.metaKey || event.ctrlKey
      ? { toggle: true }
      : undefined;

  optimisticSelect(node.url, options);
  await act(options === undefined ? { name: selectAction, url: node.url } : { name: selectAction, options, url: node.url });

  if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (node.kind === 'folder') {
      optimisticToggleFolder(node.url);
      await act({ name: toggleFolderAction, url: node.url });
    }
    await act({ name: previewAction, title, url: node.url });
  }

  const main = document.querySelector('.file-picker-app');
  if (main !== null) await refresh(main);
}

async function act(request) {
  try {
    await hostEnv.services.act(request);
  } catch (error) {
    const main = document.querySelector('.file-picker-app');
    if (main !== null) main.append(notice('Action failed', error instanceof Error ? error.message : String(error)));
  }
}

function optimisticSelect(url, options) {
  if (currentView === undefined) return;
  const selectedUrls = options?.selectedUrls ?? (
    options?.toggle === true
      ? toggleSelection(currentView.state.selectedUrls, url)
      : [url]
  );
  currentView = {
    ...currentView,
    state: {
      ...currentView.state,
      activeUrl: url,
      selectedUrls,
    },
  };
  const main = document.querySelector('.file-picker-app');
  if (main !== null) render(main, currentView);
}

function optimisticToggleFolder(url) {
  if (currentView === undefined) return;
  currentView = {
    ...currentView,
    state: {
      ...currentView.state,
      openFolders: {
        ...currentView.state.openFolders,
        [url]: !isFolderOpen(currentView.state, url),
      },
    },
  };
  const main = document.querySelector('.file-picker-app');
  if (main !== null) render(main, currentView);
}

function toggleSelection(selectedUrls, url) {
  return selectedUrls.includes(url)
    ? selectedUrls.filter((selectedUrl) => selectedUrl !== url)
    : [...selectedUrls, url];
}

function isFolderOpen(state, url) {
  return state.openFolders[url] ?? url === state.rootUrl;
}

function visibleFilePickerUrls(node, state) {
  if (node.kind !== 'folder' || !isFolderOpen(state, node.url)) return [node.url];
  return [node.url, ...(node.children ?? []).flatMap((child) => visibleFilePickerUrls(child, state))];
}

function selectionRange(anchorUrl, url, visibleUrls) {
  if (anchorUrl === undefined) return [url];
  const anchorIndex = visibleUrls.indexOf(anchorUrl);
  const selectedIndex = visibleUrls.indexOf(url);
  return anchorIndex === -1 || selectedIndex === -1
    ? [url]
    : visibleUrls.slice(Math.min(anchorIndex, selectedIndex), Math.max(anchorIndex, selectedIndex) + 1);
}

function fileIcon(fileTypes, mediaType) {
  const mimeType = String(mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
  return fileTypes.find((fileType) => matchesMime(fileType.match, mimeType))?.emoji ?? '📄';
}

function matchesMime(pattern, mimeType) {
  const normalizedPattern = String(pattern).trim().toLowerCase();
  if (normalizedPattern === mimeType) return true;
  const parts = normalizedPattern.split('*');
  if (parts.length === 1 || !mimeType.startsWith(parts[0] ?? '')) return false;

  let index = parts[0]?.length ?? 0;
  for (const part of parts.slice(1)) {
    if (part === '') continue;
    const nextIndex = mimeType.indexOf(part, index);
    if (nextIndex === -1) return false;
    index = nextIndex + part.length;
  }
  const last = parts.at(-1) ?? '';
  return last === '' || mimeType.endsWith(last);
}

function notice(title, message) {
  const section = document.createElement('section');
  section.className = 'notice';
  section.setAttribute('role', 'status');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('span');
  detail.textContent = message;
  section.append(heading, detail);
  return section;
}
`,
    name: 'app.js',
  },
  {
    content: `html,
body,
#patchpit-root {
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
  background: transparent;
  color: #242529;
  font: 13px system-ui, sans-serif;
}

.file-picker-app {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  background: transparent;
  color: #242529;
}

.tree-pane {
  height: 100%;
  overflow: auto;
  padding: 0.375rem 0;
}

.tree,
.tree ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-item {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  min-height: 1.75rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  padding: 0.25rem 0.5rem 0.25rem calc(0.5rem + var(--tree-depth-size));
}

.tree-item:hover {
  background: #dfdfe0;
}

[aria-selected=true] > .tree-item {
  background: #cacaca;
  color: #242529;
}

[data-active] > .tree-item {
  font-weight: 600;
}

.tree-icon {
  width: 1.25rem;
  text-align: center;
}

.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice {
  display: grid;
  gap: 0.35rem;
  margin: 0.5rem;
  padding: 0.75rem;
  border: 1px solid #c9c9ca;
  background: #fafafa;
  color: #58585a;
}

.notice strong {
  color: #242529;
}
`,
    name: 'style.css',
  },
] as const satisfies readonly SeedAppPackageFile[];

const viewerAppFiles = [
  {
    content: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Viewer</title>
    <link rel="stylesheet" href="./style.css">
    <script type="module" src="./app.js"></script>
  </head>
  <body>
    <div id="patchpit-root"></div>
  </body>
</html>
`,
    name: 'index.html',
  },
  {
    content: `export default async function activate(env) {
  const root = document.getElementById('patchpit-root') ?? document.body;
  root.innerHTML = '';
  root.style.cssText = 'height:100%;';

  const main = document.createElement('main');
  main.style.cssText = 'box-sizing:border-box;height:100%;overflow:auto;padding:1rem;font:14px/1.45 system-ui,sans-serif;color:#242529;background:transparent;';
  root.append(main);

  const showNotice = (title, message) => {
    main.innerHTML = '';
    const section = document.createElement('section');
    section.style.cssText = 'display:grid;align-content:center;min-height:100%;gap:0.35rem;text-align:center;color:#58585a;';
    const heading = document.createElement('h1');
    heading.textContent = title;
    heading.style.cssText = 'margin:0;font-size:1rem;color:#242529;';
    const detail = document.createElement('p');
    detail.textContent = message;
    detail.style.cssText = 'margin:0;';
    section.append(heading, detail);
    main.append(section);
  };

  try {
    if (typeof env.services?.view !== 'function') {
      throw new Error('view service unavailable');
    }
    const response = await env.services.view({ name: 'resource' });
    const resource = response?.resource;
    if (resource === undefined) {
      showNotice('Resource unavailable', 'The host did not provide a resource view.');
      return;
    }

    document.title = resource.title ?? resource.name ?? 'Viewer';
    main.innerHTML = '';

    if (resource.kind === 'folder') {
      const list = document.createElement('ul');
      list.style.cssText = 'display:grid;gap:0.25rem;margin:0;padding:0;list-style:none;';
      for (const child of resource.children ?? []) {
        const item = document.createElement('li');
        item.textContent = (child.kind === 'folder' ? 'Folder: ' : 'File: ') + child.name;
        item.style.cssText = 'padding:0.4rem 0.5rem;border:1px solid #d7d7d9;background:transparent;';
        list.append(item);
      }
      main.append(list);
      return;
    }

    if (typeof resource.sourceUrl === 'string' && resource.mediaType?.startsWith('image/')) {
      const image = document.createElement('img');
      image.src = resource.sourceUrl;
      image.alt = resource.name ?? '';
      image.style.cssText = 'display:block;max-width:100%;height:auto;margin:auto;';
      main.append(image);
      return;
    }

    if (typeof resource.sourceUrl === 'string' && resource.text === undefined) {
      const link = document.createElement('a');
      link.href = resource.sourceUrl;
      link.textContent = resource.sourceUrl;
      main.append(link);
      return;
    }

    const preview = document.createElement('pre');
    preview.textContent = resource.text ?? '';
    preview.style.cssText = 'box-sizing:border-box;min-height:100%;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,Liberation Mono,monospace;';
    main.append(preview);
  } catch (error) {
    showNotice('Resource view unavailable', error instanceof Error ? error.message : String(error));
  }
}
`,
    name: 'app.js',
  },
  {
    content: `html,
body,
#patchpit-root {
  height: 100%;
  margin: 0;
}

body {
  background: transparent;
}
`,
    name: 'style.css',
  },
] as const satisfies readonly SeedAppPackageFile[];
