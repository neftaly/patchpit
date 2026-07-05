import type { DocHandle } from '@automerge/automerge-repo';
import {
  rootContainer,
  SurfaceRole,
  terminalContainer,
  type FilePickerStateDoc,
  type TerminalStateDoc,
  type WindowContext,
  type WindowManagerStateDoc,
} from '@patchpit/system';
import {
  commitWindowManagerState,
  launchContext,
} from '../window-manager/window-manager-state';

export type LauncherItem = {
  readonly active: boolean;
  readonly app: string;
  readonly emoji: string;
  readonly label: string;
  readonly launch: () => void;
};

export function launcherItems({
  activeApp,
  filePickerStateHandle,
  rootUrl,
  terminalStateHandle,
  windowManagerHandle,
}: {
  readonly activeApp: string | undefined;
  readonly filePickerStateHandle: DocHandle<FilePickerStateDoc>;
  readonly rootUrl: string;
  readonly terminalStateHandle: DocHandle<TerminalStateDoc>;
  readonly windowManagerHandle: DocHandle<WindowManagerStateDoc>;
}): readonly LauncherItem[] {
  return [
    launcherItem({
      activeApp,
      context: filePickerContext(filePickerStateHandle.url, rootUrl),
      emoji: '📁',
      label: 'Files',
      role: SurfaceRole.WorkspaceView,
      windowManagerHandle,
    }),
    launcherItem({
      activeApp,
      context: terminalContext(terminalStateHandle.url, rootUrl),
      emoji: '💬',
      label: 'Terminal',
      role: SurfaceRole.DocumentSet,
      windowManagerHandle,
    }),
  ];
}

function launcherItem({
  activeApp,
  context,
  emoji,
  label,
  role,
  windowManagerHandle,
}: {
  readonly activeApp: string | undefined;
  readonly context: WindowContext;
  readonly emoji: string;
  readonly label: string;
  readonly role: SurfaceRole;
  readonly windowManagerHandle: DocHandle<WindowManagerStateDoc>;
}): LauncherItem {
  return {
    active: activeApp === context.app,
    app: context.app,
    emoji,
    label,
    launch: () => {
      commitWindowManagerState(windowManagerHandle, (doc) => {
        launchContext(doc, context, role);
      });
    },
  };
}

function filePickerContext(url: string, rootUrl: string): WindowContext {
  return {
    app: 'file-picker',
    container: rootContainer(rootUrl),
    id: 'file-picker',
    title: 'File Picker',
    url,
  };
}

function terminalContext(url: string, rootUrl: string): WindowContext {
  return {
    app: 'terminal',
    container: terminalContainer(rootUrl),
    id: 'terminal',
    url,
  };
}
