import type { DocHandle, Repo } from '@automerge/automerge-repo';
import type { JsonValue } from '@tarstate/core';
import type { AutomergeMoveRoot } from '../shared/automerge-moves';

export enum PatchpitType {
  Appearance = 'appearance',
  AppManifest = 'app-manifest',
  File = 'file',
  FilePickerState = 'file-picker-state',
  FileTypes = 'file-types',
  Folder = 'folder',
  TerminalState = 'terminal-state',
  Theme = 'theme',
  WindowManagerState = 'window-manager-state',
}

export enum ThemeMode {
  Dark = 'dark',
  Light = 'light',
  System = 'system',
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

export enum TerminalLineKind {
  Error = 'error',
  Input = 'input',
  Output = 'output',
}

export enum ContainerMountKind {
  Automerge = 'automerge',
  Runtime = 'runtime',
}

export enum RuntimeMountProvider {
  Device = 'device',
  Memory = 'memory',
  Proc = 'proc',
  ShellCommands = 'shell-commands',
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

export type FilesystemIndexDoc = AutomergeMoveRoot & {
  filesystemIndex: {
    rootUrl: string;
    documents: FilesystemIndexRow[];
  };
};

export type FilesystemIndexRow = {
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

export type ThemePalette = {
  background: string;
  surface: string;
  sidebar: string;
  tabs: string;
  border: string;
  hover: string;
  selectedBackground: string;
  selectedText: string;
  text: string;
  code: string;
  muted: string;
  treeGuide: string;
  terminalText: string;
  terminalCursor: string;
  terminalSelection: string;
};

export type ThemeMetrics = {
  appBorder: string;
  detailPad: string;
  previewImageWidth: string;
  tabControlMargin: string;
  tabPad: string;
};

export type ThemeTypography = {
  codeFont: string;
  codeLineHeight: string;
  codeSize: string;
  terminalLineHeight: string;
};

export type ThemeDoc = PatchpitDoc<PatchpitType.Theme> & {
  name: string;
  extension: string;
  mimeType: string;
  title: string;
  metrics: ThemeMetrics;
  palette: ThemePalette;
  typography: ThemeTypography;
};

export type AppearanceDoc = PatchpitDoc<PatchpitType.Appearance> & {
  name: string;
  extension: string;
  darkThemeUrl: string;
  lightThemeUrl: string;
  mimeType: string;
  mode: ThemeMode;
};

export type TerminalStateDoc = PatchpitDoc<PatchpitType.TerminalState> & {
  name: string;
  extension: string;
  mimeType: string;
  capabilities: TerminalCapabilities;
  cwd: string;
  env: Record<string, string>;
  history: string[];
  lines: TerminalLine[];
};

export type TerminalCapabilities = {
  network: TerminalNetworkPolicy;
};

export type TerminalNetworkPolicy = {
  allowAll: boolean;
  allowedUrlPrefixes: string[];
  enabled: boolean;
};

export type TerminalLine = {
  kind: TerminalLineKind;
  text: string;
  prompt?: string;
};

export type AppContainer = {
  mounts: ContainerMount[];
};

export type ContainerMount =
  | {
      kind: ContainerMountKind.Automerge;
      path: string;
      url: string;
    }
  | {
      kind: ContainerMountKind.Runtime;
      path: string;
      provider: RuntimeMountProvider;
      writable?: boolean;
    };

export type AutomergeContainerMount = Extract<ContainerMount, { kind: ContainerMountKind.Automerge }>;

export type RuntimeContainerMount = Extract<ContainerMount, { kind: ContainerMountKind.Runtime }>;

export type WindowContext = {
  id: string;
  app: string;
  container: AppContainer;
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
  | AppearanceDoc
  | AppManifestDoc
  | FilePickerStateDoc
  | FileTypesDoc
  | FileDoc
  | FolderDoc
  | TerminalStateDoc
  | ThemeDoc
  | WindowManagerStateDoc;

export type SeedFilesystem = {
  repo: Repo;
  rootUrl: string;
  indexDoc: FilesystemIndexDoc;
  appearanceHandle: DocHandle<AppearanceDoc>;
  darkThemeHandle: DocHandle<ThemeDoc>;
  fileTypesHandle: DocHandle<FileTypesDoc>;
  filePickerStateHandle: DocHandle<FilePickerStateDoc>;
  indexHandle: DocHandle<FilesystemIndexDoc>;
  lightThemeHandle: DocHandle<ThemeDoc>;
  systemAppsHandle: DocHandle<FolderDoc>;
  terminalStateHandle: DocHandle<TerminalStateDoc>;
  windowManagerHandle: DocHandle<WindowManagerStateDoc>;
  documentHandles: Record<string, DocHandle<FilesystemResource>>;
};

export const automergeExtension = 'am';
export const automergeLegacyExtension = 'automerge';
export const automergeMimeType = 'application/vnd.automerge';
export const defaultFolderOpen = true;

export function automergeFileName(name: string): string {
  return `${name}.${automergeExtension}`;
}

export function isAutomergeFileName(name: string): boolean {
  return name.endsWith(`.${automergeExtension}`) || name.endsWith(`.${automergeLegacyExtension}`);
}
