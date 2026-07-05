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
  ContextLaunchBehavior,
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
  focusedAppId,
  filePickerStateHandle,
  newTerminalStateHandle,
  rootUrl,
  windowManagerHandle,
}: {
  readonly focusedAppId: string | undefined;
  readonly filePickerStateHandle: DocHandle<FilePickerStateDoc>;
  readonly newTerminalStateHandle: () => DocHandle<TerminalStateDoc>;
  readonly rootUrl: string;
  readonly windowManagerHandle: DocHandle<WindowManagerStateDoc>;
}): readonly LauncherItem[] {
  const specs = [
    {
      app: 'file-picker',
      behavior: ContextLaunchBehavior.ToggleSurface,
      context: () => filePickerContext(filePickerStateHandle.url, rootUrl),
      emoji: '📁',
      label: 'Files',
      role: SurfaceRole.WorkspaceView,
    },
    {
      app: 'terminal',
      behavior: ContextLaunchBehavior.OpenContext,
      context: () => terminalContext(newTerminalStateHandle().url, rootUrl),
      emoji: '💬',
      label: 'Terminal',
      role: SurfaceRole.DocumentSet,
    },
  ] satisfies readonly LauncherSpec[];

  return specs.map((spec) => ({
    active: focusedAppId === spec.app,
    app: spec.app,
    emoji: spec.emoji,
    label: spec.label,
    launch: () => {
      const context = spec.context();
      commitWindowManagerState(windowManagerHandle, (doc) => {
        launchContext(doc, { behavior: spec.behavior, context, role: spec.role });
      });
    },
  }));
}

type LauncherSpec = {
  readonly app: string;
  readonly behavior: ContextLaunchBehavior;
  readonly context: () => WindowContext;
  readonly emoji: string;
  readonly label: string;
  readonly role: SurfaceRole;
};

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
    id: `terminal:${url}`,
    url,
  };
}
