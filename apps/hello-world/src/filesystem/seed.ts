import { Repo, type DocHandle } from '@automerge/automerge-repo';
import { seedFileTypes, seedTree, type SeedNode } from '../fixtures/seed';
import {
  automergeMimeType,
  PatchpitType,
  SplitDirection,
  SurfaceRole,
  WindowManagerNodeKind,
  type AppManifestDoc,
  type AppManifestHandler,
  type FileDoc,
  type FilePickerStateDoc,
  type FilesystemDoc,
  type FilesystemDocumentRow,
  type FilesystemResource,
  type FileTypesDoc,
  type FolderDoc,
  type FolderEntry,
  type SeedFilesystem,
  type SurfaceSpec,
  type TerminalStateDoc,
  type WindowManagerStateDoc,
} from './types';

export function createSeedFilesystem(): SeedFilesystem {
  const repo = new Repo({ network: [] });
  const root = createFolder(repo, '', []);
  const fileTypesName = 'file-types.automerge';
  const filePickerStateId = 'file-picker-1';
  const terminalStateId = 'terminal-1';
  const windowManagerId = 'window-manager-1';
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
    extension: 'automerge',
    fileTypes: seedFileTypes.map(({ emoji, match }) => ({ emoji, match })),
    mimeType: automergeMimeType,
    name: fileTypesName,
  });
  const filePickerStateHandle = repo.create<FilePickerStateDoc>({
    '@patchpit': { type: PatchpitType.FilePickerState },
    extension: 'automerge',
    fileTypesUrl: fileTypesHandle.url,
    mimeType: automergeMimeType,
    name: `${filePickerStateId}.automerge`,
    openFolders: {},
    rootUrl: root.url,
    selectedUrls: [],
  });
  const terminalStateHandle = repo.create<TerminalStateDoc>({
    '@patchpit': { type: PatchpitType.TerminalState },
    extension: 'automerge',
    mimeType: automergeMimeType,
    name: `${terminalStateId}.automerge`,
  });
  const windowManagerHandle = repo.create<WindowManagerStateDoc>({
    '@patchpit': { type: PatchpitType.WindowManagerState },
    contexts: {
      'file-picker': {
        app: 'file-picker',
        id: 'file-picker',
        title: 'File Picker',
        url: filePickerStateHandle.url,
      },
      terminal: {
        app: 'terminal',
        id: 'terminal',
        title: 'Terminal',
        url: terminalStateHandle.url,
      },
    },
    extension: 'automerge',
    focus: 'main',
    layout: {
      direction: SplitDirection.Row,
      first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
      kind: WindowManagerNodeKind.Split,
      ratio: 0.2,
      second: {
        direction: SplitDirection.Column,
        first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'main' },
        kind: WindowManagerNodeKind.Split,
        ratio: 0.8,
        second: { kind: WindowManagerNodeKind.Surface, surfaceId: 'terminal' },
      },
    },
    mimeType: automergeMimeType,
    name: `${windowManagerId}.automerge`,
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
      terminal: {
        activeContext: 'terminal',
        contexts: ['terminal'],
        id: 'terminal',
        role: SurfaceRole.DocumentSet,
      },
    },
  });
  const apps = createFolder(repo, 'apps', [
    entry('file-picker.automerge', PatchpitType.AppManifest, filePickerApp.url),
    entry('terminal.automerge', PatchpitType.AppManifest, terminalApp.url),
    entry('viewer.automerge', PatchpitType.AppManifest, viewerApp.url),
  ]);
  const state = createFolder(repo, 'state', [
    entry(`${filePickerStateId}.automerge`, PatchpitType.FilePickerState, filePickerStateHandle.url),
    entry(`${terminalStateId}.automerge`, PatchpitType.TerminalState, terminalStateHandle.url),
    entry(`${windowManagerId}.automerge`, PatchpitType.WindowManagerState, windowManagerHandle.url),
  ]);
  const config = createFolder(repo, 'config', [
    entry(fileTypesName, PatchpitType.FileTypes, fileTypesHandle.url),
  ]);
  const fixture = createFixtureEntries(repo, seedTree.children);

  root.change((doc) => {
    doc.docs = [
      entry('apps', PatchpitType.Folder, apps.url),
      entry('config', PatchpitType.Folder, config.url),
      ...fixture.entries,
      entry('state', PatchpitType.Folder, state.url),
    ];
  });

  const handles = [
    root,
    apps,
    config,
    state,
    filePickerApp,
    terminalApp,
    viewerApp,
    fileTypesHandle,
    filePickerStateHandle,
    terminalStateHandle,
    windowManagerHandle,
    ...fixture.handles,
  ];
  const indexHandle = repo.create<FilesystemDoc>({
    filesystem: {
      rootUrl: root.url,
      documents: handles.map((handle) => documentRow(handle.url, handle.doc())),
    },
  });
  return {
    rootUrl: root.url,
    indexDoc: indexHandle.doc(),
    fileTypesHandle,
    filePickerStateHandle,
    windowManagerHandle,
  };
}

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
    extension: 'automerge',
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

function documentRow(url: string, doc: FilesystemResource): FilesystemDocumentRow {
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
  if (name.endsWith('.automerge')) return automergeMimeType;
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.log')) return 'text/plain';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}
