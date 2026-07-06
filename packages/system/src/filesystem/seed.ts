import { Repo, type DocHandle } from '@automerge/automerge-repo';
import {
  seedAppPackages,
  type SeedAppPackageDefinition,
  type SeedAppPackageEntryKind,
  type SeedAppPackageFile,
  type SeedAppPackageSurface,
} from '../fixtures/seed-app-packages';
import { seedFileTypes, seedTree, type SeedNode } from '../fixtures/seed';
import {
  plannedSharedRuntimePlatformFeatures,
  requiredRuntimeBootFeatures,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
} from '../runtime/platform';
import { runtimeProtocol, type RuntimeHelloAck } from '../runtime/protocol';
import type { PatchpitRelationSchemaDescriptor } from '../schema';
import { rootContainer } from './container';
import {
  patchpitDocMetadata,
  patchpitSystemSchemaCatalog,
  patchpitSystemSchemaRef,
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
  const appPackages = seedAppPackages.map((appPackage) => installSeedAppPackage(repo, seedAppPackageInput(appPackage)));
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
  const homeFixture = createFixtureEntries(repo, homeSeedChildren(seedTree.children));
  const home = createFolder(repo, 'home', [
    folderEntry('apps', PatchpitType.Folder, apps.url),
    ...homeFixture.entries,
  ]);

  root.change((doc) => {
    appendFolderEntries(doc, [
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

type SeedAppPackageInput = {
  readonly entry: string;
  readonly entryKind: AppManifestDoc['entryKind'];
  readonly files: readonly SeedAppPackageFile[];
  readonly handles: readonly AppManifestHandler[];
  readonly icon: string;
  readonly id: string;
  readonly name: string;
  readonly schemas?: readonly PatchpitRelationSchemaDescriptor[];
  readonly surfaces: readonly SurfaceSpec[];
  readonly version: string;
};

type InstalledSeedAppPackage = {
  readonly entry: FolderEntry;
  readonly handles: Array<DocHandle<FileDoc | FolderDoc>>;
};

function installSeedAppPackage(repo: Repo, input: SeedAppPackageInput): InstalledSeedAppPackage {
  const packageFiles = createPackageFileEntries(repo, input.files);
  if (!input.files.some((file) => file.name === input.entry)) {
    throw new Error(`Seed app ${input.id} is missing entry resource ${input.entry}.`);
  }

  const packageHandle = createFolder(repo, input.id, packageFiles.entries);

  return {
    entry: folderEntry(input.id, PatchpitType.Folder, packageHandle.url),
    handles: [packageHandle, ...packageFiles.handles],
  };
}

function createPackageFileEntries(
  repo: Repo,
  files: readonly SeedAppPackageFile[],
): {
  readonly entries: FolderEntry[];
  readonly handles: Array<DocHandle<FileDoc | FolderDoc>>;
} {
  const directFiles = new Map<string, SeedAppPackageFile>();
  const childFiles = new Map<string, SeedAppPackageFile[]>();

  for (const file of files) {
    const parts = file.name.split('/').filter((part) => part !== '');
    if (parts.length === 0 || parts.includes('.') || parts.includes('..')) {
      throw new Error(`Invalid seed app package file path: ${file.name}`);
    }
    const [name, ...rest] = parts;
    if (name === undefined) throw new Error(`Invalid seed app package file path: ${file.name}`);
    if (rest.length === 0) {
      if (directFiles.has(name) || childFiles.has(name)) throw new Error(`Duplicate seed app package path: ${file.name}`);
      directFiles.set(name, { ...file, name });
      continue;
    }
    if (directFiles.has(name)) throw new Error(`Duplicate seed app package path: ${file.name}`);
    const siblings = childFiles.get(name) ?? [];
    siblings.push({ ...file, name: rest.join('/') });
    childFiles.set(name, siblings);
  }

  const entries: FolderEntry[] = [];
  const handles: Array<DocHandle<FileDoc | FolderDoc>> = [];

  for (const [name, file] of [...directFiles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const handle = createFile(repo, name, file.content);
    entries.push(folderEntry(name, PatchpitType.File, handle.url));
    handles.push(handle);
  }

  for (const [name, children] of [...childFiles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const child = createPackageFileEntries(repo, children);
    const handle = createFolder(repo, name, child.entries);
    entries.push(folderEntry(name, PatchpitType.Folder, handle.url));
    handles.push(handle, ...child.handles);
  }

  return { entries, handles };
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

function seedAppPackageInput(appPackage: SeedAppPackageDefinition): SeedAppPackageInput {
  const manifest = appPackage.manifest;
  const schemas = manifest.schemaIds?.map(seedAppPackageSchema);
  return {
    entry: manifest.entry,
    entryKind: seedAppPackageEntryKind(manifest.entryKind),
    files: appPackage.files,
    handles: manifest.handles.map((handle) => ({ accepts: [...handle.accepts], intent: handle.intent, port: handle.port })),
    icon: manifest.icon,
    id: manifest.id,
    name: manifest.name,
    ...(schemas === undefined ? {} : { schemas }),
    surfaces: manifest.surfaces.map(seedAppPackageSurface),
    version: manifest.version,
  };
}

function seedAppPackageEntryKind(entryKind: SeedAppPackageEntryKind): AppManifestDoc['entryKind'] {
  return entryKind;
}

function seedAppPackageSurface(surface: SeedAppPackageSurface): SurfaceSpec {
  return {
    role: seedAppPackageSurfaceRole(surface.role),
    ...(surface.state === undefined
      ? {}
      : {
          state: {
            type: surface.state.type,
            ...(surface.state.schemaId === undefined
              ? {}
              : { schema: patchpitSystemSchemaRef(seedAppPackageSchema(surface.state.schemaId)) }),
          },
        }),
  };
}

function seedAppPackageSurfaceRole(role: SeedAppPackageSurface['role']): SurfaceRole {
  switch (role) {
    case 'document-set':
      return SurfaceRole.DocumentSet;
    case 'workspace-view':
      return SurfaceRole.WorkspaceView;
  }
}

function seedAppPackageSchema(schemaId: string): PatchpitRelationSchemaDescriptor {
  const schema = patchpitSystemSchemaCatalog[schemaId];
  if (schema === undefined) throw new Error(`Seed app package referenced unknown schema "${schemaId}".`);
  return schema;
}
