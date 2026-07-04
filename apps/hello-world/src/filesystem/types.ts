import type { DocHandle } from '@automerge/automerge-repo';
import type { JsonValue } from '@tarstate/core';
import type { AutomergeMoveRoot } from '../shared/automerge-moves';

export enum PatchpitType {
  AppManifest = 'app-manifest',
  File = 'file',
  FilePickerState = 'file-picker-state',
  FileTypes = 'file-types',
  Folder = 'folder',
  TerminalState = 'terminal-state',
  WindowManagerState = 'window-manager-state',
}

export enum SplitDirection {
  Column = 'column',
  Row = 'row',
}

export enum WindowManagerNodeKind {
  Surface = 'surface',
  Split = 'split',
}

export enum SurfaceRole {
  DocumentSet = 'document-set',
  WorkspaceView = 'workspace-view',
}

export type FolderEntry = {
  name: string;
  type: string;
  url: string;
};

export type PatchpitDoc<T extends string> = AutomergeMoveRoot & {
  '@patchpit': {
    suggestedImportUrl?: string;
    type: T;
  };
};

export type FolderDoc = PatchpitDoc<PatchpitType.Folder> & {
  docs: FolderEntry[];
  name?: string;
  title: string;
};

export type FileDoc = PatchpitDoc<PatchpitType.File> & {
  content: string;
  name: string;
  extension: string;
  mimeType: string;
};

export type AppManifestDoc = PatchpitDoc<PatchpitType.AppManifest> & {
  manifestVersion: 1;
  id: string;
  name: string;
  entry: string;
  extension: string;
  handles?: AppManifestHandler[];
  icons?: AppManifestIcon[];
  mimeType: string;
  surfaces?: SurfaceSpec[];
};

export type AppManifestHandler = {
  port: string;
  intent: 'preview' | 'open' | 'reveal' | 'activate';
  accepts: string[];
};

export type AppManifestIcon = {
  emoji: string;
};

export type SurfaceSpec = {
  role: SurfaceRole;
  state?: { type: string; schema?: string };
};

export type FilesystemDoc = AutomergeMoveRoot & {
  filesystem: {
    rootUrl: string;
    documents: FilesystemDocumentRow[];
  };
};

export type FilesystemDocumentRow = {
  url: string;
  type: string;
  entries?: JsonValue;
  title?: string;
  mimeType?: string;
  content?: string;
};

export type FilePickerStateDoc = PatchpitDoc<PatchpitType.FilePickerState> & {
  name: string;
  extension: string;
  fileTypesUrl: string;
  mimeType: string;
  activeUrl?: string;
  openFolders: Record<string, boolean>;
  rootUrl: string;
  selectedUrls: string[];
};

export type FileTypesDoc = PatchpitDoc<PatchpitType.FileTypes> & {
  name: string;
  extension: string;
  mimeType: string;
  fileTypes: FileType[];
};

export type FileType = {
  emoji: string;
  match: string;
};

export type TerminalStateDoc = PatchpitDoc<PatchpitType.TerminalState> & {
  name: string;
  extension: string;
  mimeType: string;
};

export type WindowContext = {
  id: string;
  app: string;
  title?: string;
  url: string;
};

export type WindowSurface = {
  id: string;
  role: SurfaceRole;
  contexts: string[];
  activeContext?: string;
  previewContext?: string;
};

export type WindowLayoutNode =
  | {
      direction: SplitDirection;
      first: WindowLayoutNode;
      kind: WindowManagerNodeKind.Split;
      ratio: number;
      second: WindowLayoutNode;
    }
  | {
      kind: WindowManagerNodeKind.Surface;
      surfaceId: string;
    };

export type WindowManagerStateDoc = PatchpitDoc<PatchpitType.WindowManagerState> & {
  name: string;
  extension: string;
  mimeType: string;
  contexts: Record<string, WindowContext>;
  focus: string;
  layout: WindowLayoutNode;
  surfaces: Record<string, WindowSurface>;
};

export type FilesystemResource =
  | AppManifestDoc
  | FilePickerStateDoc
  | FileTypesDoc
  | FileDoc
  | FolderDoc
  | TerminalStateDoc
  | WindowManagerStateDoc;

export type SeedFilesystem = {
  rootUrl: string;
  indexDoc: FilesystemDoc;
  fileTypesHandle: DocHandle<FileTypesDoc>;
  filePickerStateHandle: DocHandle<FilePickerStateDoc>;
  windowManagerHandle: DocHandle<WindowManagerStateDoc>;
};

export const automergeMimeType = 'application/vnd.automerge';
export const defaultFolderOpen = true;
