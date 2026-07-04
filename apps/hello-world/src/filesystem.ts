import { Repo, type DocHandle } from '@automerge/automerge-repo';
import { launchUrl } from './shared/launch-url';

export enum PatchworkType {
  File = 'file',
  FileManagerState = 'file-manager-state',
  Folder = 'folder',
  WindowManagerState = 'window-manager-state',
}

export enum SplitDirection {
  Column = 'column',
  Row = 'row',
}

export enum WindowManagerNodeKind {
  Pane = 'pane',
  Split = 'split',
}

export enum WindowTabKind {
  Viewer = 'viewer',
}

export type FolderEntry = {
  name: string;
  type: string;
  url: string;
};

export type PatchworkDoc<T extends string> = {
  '@patchwork': {
    suggestedImportUrl?: string;
    type: T;
  };
};

export type FolderDoc = PatchworkDoc<PatchworkType.Folder> & {
  docs: FolderEntry[];
  name?: string;
  title: string;
};

export type FileDoc = PatchworkDoc<PatchworkType.File> & {
  content: string;
  name: string;
  extension: string;
  metadata: { permissions: number };
  mimeType: string;
};

export type FilesystemDoc = {
  filesystem: {
    rootUrl: string;
    documents: FilesystemDocumentRow[];
  };
};

export type FilesystemDocumentRow = {
  url: string;
  type: string;
  mimeType?: string;
  content?: string;
};

export type FileManagerStateDoc = PatchworkDoc<PatchworkType.FileManagerState> & {
  name: string;
  extension: string;
  mimeType: string;
  activeUrl: string;
  launchUrl: string;
  openFolders: Record<string, boolean | undefined>;
  selectedUrls: string[];
};

export type WindowTab = {
  id: string;
  kind: WindowTabKind;
  targetUrl: string;
  temporary: boolean;
};

export type WindowPane = {
  id: string;
  selectedTabId: string | null;
};

export type WindowPaneTab = {
  id: string;
  order: number;
  paneId: string;
  tabId: string;
};

export type WindowFocus = {
  id: string;
  paneId: string;
};

export type WorkspaceLayout = {
  filePickerRatio: number;
};

export type WindowLayoutNode =
  | {
      direction: SplitDirection;
      children: WindowLayoutNode[];
      kind: WindowManagerNodeKind.Split;
      sizes: number[];
    }
  | {
      kind: WindowManagerNodeKind.Pane;
      paneId: string;
    };

export type WindowManagerStateDoc = PatchworkDoc<PatchworkType.WindowManagerState> & {
  name: string;
  extension: string;
  mimeType: string;
  focus: Record<string, WindowFocus>;
  layout: WindowLayoutNode;
  paneTabs: Record<string, WindowPaneTab>;
  panes: Record<string, WindowPane>;
  tabs: Record<string, WindowTab>;
  workspace: WorkspaceLayout;
};

export type FilesystemResource = FolderDoc | FileDoc | FileManagerStateDoc | WindowManagerStateDoc;

export type FilesystemResourceRecord = {
  url: string;
  doc: FilesystemResource;
};

export type SeedFilesystem = {
  repo: Repo;
  rootUrl: string;
  indexDoc: FilesystemDoc;
  documents: FilesystemResourceRecord[];
  fileManagerHandle: DocHandle<FileManagerStateDoc>;
  windowManagerHandle: DocHandle<WindowManagerStateDoc>;
};

const tigerUrl = 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg';

export const defaultFolderOpen = true;
export const currentFocusId = 'current';
const defaultWorkspace: WorkspaceLayout = { filePickerRatio: 0.2 };

export function createSeedFilesystem(): SeedFilesystem {
  const repo = new Repo({ network: [] });
  const root = createFolder(repo, '', []);
  const fileManagerId = 'file-manager-1';
  const windowManagerId = 'window-manager-1';
  const fileManagerHandle = repo.create<FileManagerStateDoc>({
    '@patchwork': { type: PatchworkType.FileManagerState },
    activeUrl: root.url,
    extension: 'automerge',
    launchUrl: appUrl('file-picker.html', root.url),
    mimeType: 'application/vnd.automerge',
    name: `${fileManagerId}.automerge`,
    openFolders: {},
    selectedUrls: [root.url],
  });
  const windowManagerHandle = repo.create<WindowManagerStateDoc>({
    '@patchwork': { type: PatchworkType.WindowManagerState },
    extension: 'automerge',
    focus: {
      [currentFocusId]: {
        id: currentFocusId,
        paneId: 'main',
      },
    },
    layout: { kind: WindowManagerNodeKind.Pane, paneId: 'main' },
    mimeType: 'application/vnd.automerge',
    name: `${windowManagerId}.automerge`,
    panes: {
      main: {
        id: 'main',
        selectedTabId: null,
      },
    },
    paneTabs: {},
    tabs: {},
    workspace: defaultWorkspace,
  });
  const device = createFolder(repo, 'device', [
    entry(`${fileManagerId}.automerge`, PatchworkType.FileManagerState, fileManagerHandle.url),
    entry(`${windowManagerId}.automerge`, PatchworkType.WindowManagerState, windowManagerHandle.url),
  ]);
  const homeReadme = createFile(
    repo,
    'README.md',
    ['# Home', '', 'This is a tiny filesystem namespace fixture.'].join('\n'),
  );
  const home = createFolder(repo, 'home', [
    entry('README.md', PatchworkType.File, homeReadme.url),
    entry('ghostscript-tiger.svg', PatchworkType.File, tigerUrl),
  ]);

  root.change((doc) => {
    doc.docs = [
      entry('device', PatchworkType.Folder, device.url),
      entry('home', PatchworkType.Folder, home.url),
    ];
  });

  const handles = [
    root,
    device,
    fileManagerHandle,
    windowManagerHandle,
    home,
    homeReadme,
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
    windowManagerHandle,
  };
}

function entry(name: string, type: PatchworkType | string, entryUrl: string): FolderEntry {
  return { name, type, url: entryUrl };
}

function appUrl(path: string, src: string): string {
  return launchUrl(path, src);
}

function createFolder(
  repo: Repo,
  name: string,
  entries: FolderEntry[],
): DocHandle<FolderDoc> {
  return repo.create<FolderDoc>({
    '@patchwork': { type: PatchworkType.Folder },
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
    '@patchwork': { type: PatchworkType.File },
    content,
    extension: extensionFromName(name),
    metadata: { permissions: 0o644 },
    mimeType: mimeTypeFromName(name),
    name,
  });
}

function documentRow({ url, doc }: FilesystemResourceRecord): FilesystemDocumentRow {
  const type = doc['@patchwork'].type;
  if (isFolderDoc(doc)) return { type, url };
  return {
    content: 'content' in doc ? doc.content : JSON.stringify(doc, null, 2),
    mimeType: doc.mimeType,
    type,
    url,
  };
}

function isFolderDoc(doc: FilesystemResource): doc is FolderDoc {
  return doc['@patchwork'].type === PatchworkType.Folder;
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
