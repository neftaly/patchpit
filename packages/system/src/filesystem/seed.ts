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
  terminalStateSchema,
} from './schemas';
import {
  appendFolderEntries,
  appendFolderEntry,
  createFilesystemIndexDoc,
  createPatchpitFileDoc,
  createPatchpitFolderDoc,
  folderEntry,
  removeFilesystemIndexResources,
  replaceFolderEntries,
  syncFilesystemIndexResource,
  syncFilesystemIndexResources,
} from './resources';
import {
  automergeMimeType,
  automergeExtension,
  automergeFileName,
  PatchpitType,
  SurfaceRole,
  WindowManagerNodeKind,
  type AppManifestDoc,
  type AppManifestHandler,
  type AppearanceDoc,
  type FileDoc,
  type FilePickerStateDoc,
  type FilesystemIndexDoc,
  type FilesystemResource,
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
  type TerminalStateDoc,
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
      files: [firstPartyShellEntryFile('File Picker')],
      handles: [],
      icon: '📁',
      id: 'file-picker',
      name: 'File Picker',
      surfaces: [stateSurface(SurfaceRole.WorkspaceView, PatchpitType.FilePickerState)],
      schemas: [filePickerStateSchema],
    }),
    installSeedAppPackage(repo, {
      entry: 'index.html',
      files: [firstPartyShellEntryFile('Terminal')],
      handles: [],
      icon: '💬',
      id: 'terminal',
      name: 'Terminal',
      surfaces: [stateSurface(SurfaceRole.DocumentSet, PatchpitType.TerminalState)],
      schemas: [terminalStateSchema],
    }),
    installSeedAppPackage(repo, {
      entry: 'index.html',
      files: [firstPartyShellEntryFile('Viewer')],
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
      entry: 'app.js',
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
    layout: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
    mimeType: automergeMimeType,
    name: automergeFileName('window-manager'),
    surfaces: {
      files: {
        activeContext: 'file-picker',
        contexts: ['file-picker'],
        id: 'files',
        role: SurfaceRole.WorkspaceView,
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
  const fixture = createFixtureEntries(repo, seedTree.children);

  root.change((doc) => {
    appendFolderEntries(doc, [
      folderEntry('apps', PatchpitType.Folder, apps.url),
      ...fixture.entries,
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
    fileTypesHandle,
    appearanceHandle,
    darkThemeHandle,
    lightThemeHandle,
    filePickerStateHandle,
    windowManagerHandle,
    runtimeStateHandle,
    ...fixture.handles,
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

export function createTerminalStateResource(
  filesystem: SeedFilesystem,
  stateId: string,
): DocHandle<TerminalStateDoc> {
  const handle = createTerminalStateHandle(filesystem.repo, stateId);
  filesystem.documentHandles[handle.url] = handle as unknown as DocHandle<FilesystemResource>;
  registerFilesystemResource({
    folderHandle: filesystem.systemAppsHandle,
    handle,
    indexHandle: filesystem.indexHandle,
    name: handle.doc().name,
    type: PatchpitType.TerminalState,
  });
  return handle;
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

function registerFilesystemResource<T extends FilesystemResource>({
  folderHandle,
  handle,
  indexHandle,
  name,
  type,
}: {
  readonly folderHandle: DocHandle<FolderDoc>;
  readonly handle: DocHandle<T>;
  readonly indexHandle: DocHandle<FilesystemIndexDoc>;
  readonly name: string;
  readonly type: PatchpitType | string;
}): void {
  const newFolderEntry = folderEntry(name, type, handle.url);

  folderHandle.change((doc) => {
    appendFolderEntry(doc, newFolderEntry);
  });

  syncFilesystemIndexResources(indexHandle, [folderHandle, handle]);
}

function createTerminalStateHandle(
  repo: Repo,
  stateId: string,
): DocHandle<TerminalStateDoc> {
  return repo.create<TerminalStateDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.TerminalState),
    capabilities: {
      network: {
        allowAll: true,
        allowedUrlPrefixes: [],
        enabled: true,
      },
    },
    cwd: '/home',
    env: {},
    extension: automergeExtension,
    history: [],
    lines: [],
    mimeType: automergeMimeType,
    name: automergeFileName(stateId),
  });
}

function createRuntimeStateHandle(
  repo: Repo,
  stateId: string,
): DocHandle<RuntimeStateDoc> {
  return repo.create<RuntimeStateDoc>({
    '@patchpit': patchpitDocMetadata(PatchpitType.RuntimeState),
    appInstances: [],
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
  terminalLineHeight: '1.2',
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
  terminalCursor: '#242529ff',
  terminalSelection: '#cacacaff',
  terminalText: '#242529ff',
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
  terminalCursor: '#dce0e5ff',
  terminalSelection: '#454a56ff',
  terminalText: '#dce0e5ff',
  text: '#dce0e5ff',
  treeGuide: '#363c46ff',
} as const satisfies ThemePalette;

function stateSurface(role: SurfaceRole, type: PatchpitType): SurfaceSpec {
  return { role, state: { schema: patchpitDocSchemaRef(type), type } };
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
    extension: automergeExtension,
    handles: input.handles,
    icons: [{ emoji: input.icon }],
    id: input.id,
    manifestVersion: 1,
    mimeType: automergeMimeType,
    name: input.name,
    ...(input.schemas === undefined ? {} : { schemas: relationSchemaRegistry(...input.schemas) }),
    surfaces: input.surfaces,
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

function firstPartyShellEntryFile(name: string): SeedAppPackageFile {
  return {
    content: firstPartyShellEntryHtml(name),
    name: 'index.html',
  };
}

function firstPartyShellEntryHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${name}</title>
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>This first-party app is served by the Patchpit shell compatibility host.</p>
  </main>
</body>
</html>
`;
}

const helloWorldAppFiles = [
  {
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hello World</title>
  <script type="module" src="./app.js"></script>
</head>
<body>
  <main>
    <h1>Hello World</h1>
    <p>This sandbox example was loaded from /apps/hello-world.</p>
  </main>
</body>
</html>
`,
    name: 'index.html',
  },
  {
    content: `export default function activate(env) {
  const root = document.getElementById('patchpit-root') ?? document.body;
  root.innerHTML = '';
  const main = document.createElement('main');
  main.style.cssText = 'display:grid;place-content:center;min-height:100%;gap:0.5rem;font:16px system-ui,sans-serif;text-align:center;';
  const heading = document.createElement('h1');
  heading.textContent = 'Hello from /apps/hello-world';
  const detail = document.createElement('p');
  detail.textContent = 'Sandboxed session ' + env.session.id;
  main.append(heading, detail);
  root.append(main);
}
`,
    name: 'app.js',
  },
] as const satisfies readonly SeedAppPackageFile[];
