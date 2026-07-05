import { Repo, type DocHandle } from '@automerge/automerge-repo';
import { seedFileTypes, seedTree, type SeedNode } from '../fixtures/seed';
import { rootContainer } from './container';
import {
  automergeMimeType,
  automergeExtension,
  automergeFileName,
  isAutomergeFileName,
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
  type FilesystemIndexRow,
  type FilesystemResource,
  type FileTypesDoc,
  type FolderDoc,
  type FolderEntry,
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
  const terminalStateId = 'terminal-1';
  const lightThemeHandle = repo.create<ThemeDoc>({
    '@patchpit': { type: PatchpitType.Theme },
    extension: automergeExtension,
    metrics: sharedMetrics,
    mimeType: automergeMimeType,
    name: automergeFileName('one-light'),
    palette: lightPalette,
    title: 'One Light',
    typography: sharedTypography,
  });
  const darkThemeHandle = repo.create<ThemeDoc>({
    '@patchpit': { type: PatchpitType.Theme },
    extension: automergeExtension,
    metrics: sharedMetrics,
    mimeType: automergeMimeType,
    name: automergeFileName('one-dark'),
    palette: darkPalette,
    title: 'One Dark',
    typography: sharedTypography,
  });
  const appearanceHandle = repo.create<AppearanceDoc>({
    '@patchpit': { type: PatchpitType.Appearance },
    darkThemeUrl: darkThemeHandle.url,
    extension: automergeExtension,
    lightThemeUrl: lightThemeHandle.url,
    mimeType: automergeMimeType,
    mode: ThemeMode.System,
    name: automergeFileName('appearance'),
  });
  const filePickerApp = createAppManifest(repo, {
    entry: 'file-picker.html',
    handles: [],
    icon: '📁',
    id: 'file-picker',
    name: 'File Picker',
    surfaces: [
      {
        role: SurfaceRole.WorkspaceView,
        state: { type: PatchpitType.FilePickerState },
      },
    ],
  });
  const viewerApp = createAppManifest(repo, {
    entry: 'viewer.html',
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
  });
  const terminalApp = createAppManifest(repo, {
    entry: 'terminal.html',
    handles: [],
    icon: '💬',
    id: 'terminal',
    name: 'Terminal',
    surfaces: [
      {
        role: SurfaceRole.DocumentSet,
        state: { type: PatchpitType.TerminalState },
      },
    ],
  });
  const fileTypesHandle = repo.create<FileTypesDoc>({
    '@patchpit': { type: PatchpitType.FileTypes },
    extension: automergeExtension,
    fileTypes: seedFileTypes.map(({ emoji, match }) => ({ emoji, match })),
    mimeType: automergeMimeType,
    name: fileTypesName,
  });
  const filePickerStateHandle = repo.create<FilePickerStateDoc>({
    '@patchpit': { type: PatchpitType.FilePickerState },
    extension: automergeExtension,
    fileTypesUrl: fileTypesHandle.url,
    mimeType: automergeMimeType,
    name: automergeFileName(filePickerStateId),
    openFolders: {},
    rootUrl: root.url,
    selectedUrls: [],
  });
  const terminalStateHandle = repo.create<TerminalStateDoc>({
    '@patchpit': { type: PatchpitType.TerminalState },
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
    name: automergeFileName(terminalStateId),
  });
  const windowManagerHandle = repo.create<WindowManagerStateDoc>({
    '@patchpit': { type: PatchpitType.WindowManagerState },
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
    focus: 'main',
    layout: {
      direction: SplitDirection.Row,
      first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
      kind: WindowManagerNodeKind.Split,
      ratio: 0.2,
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
  const apps = createFolder(repo, 'apps', [
    entry(automergeFileName('file-picker'), PatchpitType.AppManifest, filePickerApp.url),
    entry(automergeFileName('terminal'), PatchpitType.AppManifest, terminalApp.url),
    entry(automergeFileName('viewer'), PatchpitType.AppManifest, viewerApp.url),
  ]);
  const systemApps = createFolder(repo, 'apps', [
    entry(automergeFileName(filePickerStateId), PatchpitType.FilePickerState, filePickerStateHandle.url),
    entry(automergeFileName(terminalStateId), PatchpitType.TerminalState, terminalStateHandle.url),
  ]);
  const systemThemes = createFolder(repo, 'themes', [
    entry(automergeFileName('one-dark'), PatchpitType.Theme, darkThemeHandle.url),
    entry(automergeFileName('one-light'), PatchpitType.Theme, lightThemeHandle.url),
  ]);
  const systemConfig = createFolder(repo, 'config', [
    entry(automergeFileName('appearance'), PatchpitType.Appearance, appearanceHandle.url),
    entry(fileTypesName, PatchpitType.FileTypes, fileTypesHandle.url),
  ]);
  const system = createFolder(repo, 'system', [
    entry('apps', PatchpitType.Folder, systemApps.url),
    entry('config', PatchpitType.Folder, systemConfig.url),
    entry('themes', PatchpitType.Folder, systemThemes.url),
    entry(automergeFileName('window-manager'), PatchpitType.WindowManagerState, windowManagerHandle.url),
  ]);
  const fixture = createFixtureEntries(repo, seedTree.children);

  root.change((doc) => {
    doc.docs = [
      entry('apps', PatchpitType.Folder, apps.url),
      ...fixture.entries,
      entry('system', PatchpitType.Folder, system.url),
    ];
  });

  const handles = [
    root,
    apps,
    system,
    systemApps,
    systemConfig,
    systemThemes,
    filePickerApp,
    terminalApp,
    viewerApp,
    fileTypesHandle,
    appearanceHandle,
    darkThemeHandle,
    lightThemeHandle,
    filePickerStateHandle,
    terminalStateHandle,
    windowManagerHandle,
    ...fixture.handles,
  ];
  const indexHandle = repo.create<FilesystemIndexDoc>({
    filesystemIndex: {
      rootUrl: root.url,
      documents: handles.map((handle) => indexRowForResource(handle.url, handle.doc())),
    },
  });
  return {
    repo,
    rootUrl: root.url,
    indexDoc: indexHandle.doc(),
    appearanceHandle,
    darkThemeHandle,
    documentHandles: Object.fromEntries(handles.map((handle) => [handle.url, handle])),
    fileTypesHandle,
    filePickerStateHandle,
    indexHandle,
    lightThemeHandle,
    terminalStateHandle,
    windowManagerHandle,
  };
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

function entry(name: string, type: PatchpitType | string, entryUrl: string): FolderEntry {
  return { name, type, url: entryUrl };
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
        entry: entry(node.name, PatchpitType.File, node.url),
        handles: [],
      };
    }
    const handle = createFile(repo, node.name, node.content ?? '');
    return {
      entry: entry(node.name, PatchpitType.File, handle.url),
      handles: [handle],
    };
  }

  const children = createFixtureEntries(repo, node.children);
  const handle = createFolder(repo, node.name, children.entries);
  return {
    entry: entry(node.name, PatchpitType.Folder, handle.url),
    handles: [handle, ...children.handles],
  };
}

function createAppManifest(
  repo: Repo,
  input: {
    entry: string;
    handles: AppManifestHandler[];
    icon: string;
    id: string;
    name: string;
    surfaces: SurfaceSpec[];
  },
): DocHandle<AppManifestDoc> {
  return repo.create<AppManifestDoc>({
    '@patchpit': { type: PatchpitType.AppManifest },
    entry: input.entry,
    extension: automergeExtension,
    handles: input.handles,
    icons: [{ emoji: input.icon }],
    id: input.id,
    manifestVersion: 1,
    mimeType: automergeMimeType,
    name: input.name,
    surfaces: input.surfaces,
  });
}

function createFolder(
  repo: Repo,
  name: string,
  entries: FolderEntry[],
): DocHandle<FolderDoc> {
  return repo.create<FolderDoc>({
    '@patchpit': { type: PatchpitType.Folder },
    docs: entries,
    name,
    title: name || '/',
  });
}

function createFile(
  repo: Repo,
  name: string,
  content: string,
): DocHandle<FileDoc> {
  return repo.create<FileDoc>({
    '@patchpit': { type: PatchpitType.File },
    content,
    extension: extensionFromName(name),
    mimeType: mimeTypeFromName(name),
    name,
  });
}

function indexRowForResource(url: string, doc: FilesystemResource): FilesystemIndexRow {
  const type = doc['@patchpit'].type;
  if ('docs' in doc) {
    return {
      content: JSON.stringify(doc, null, 2),
      entries: doc.docs,
      title: doc.title,
      type,
      url,
    };
  }
  return {
    content: 'content' in doc ? doc.content : JSON.stringify(doc, null, 2),
    mimeType: doc.mimeType,
    type,
    url,
  };
}

function extensionFromName(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1);
}

function mimeTypeFromName(name: string): string {
  if (isAutomergeFileName(name)) return automergeMimeType;
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.log')) return 'text/plain';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}
