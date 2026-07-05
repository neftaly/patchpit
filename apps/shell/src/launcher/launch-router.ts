import type { DocHandle } from '@automerge/automerge-repo';
import {
  rootContainer,
  SurfaceRole,
  type FilePickerStateDoc,
  type RuntimeStateDoc,
  type WindowContext,
} from '@patchpit/system';
import type { AppLaunchIntentInput } from '../runtime/launch-intents';
import { ContextLaunchBehavior } from '../window-manager/window-manager-state';

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
  launchApp,
  rootUrl,
  runtimeStateHandle,
}: {
  readonly focusedAppId: string | undefined;
  readonly filePickerStateHandle: DocHandle<FilePickerStateDoc>;
  readonly launchApp: (input: AppLaunchIntentInput) => void;
  readonly rootUrl: string;
  readonly runtimeStateHandle: DocHandle<RuntimeStateDoc>;
}): readonly LauncherItem[] {
  const launcherSpecs = [
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
      emoji: '💬',
      label: 'Terminal',
      role: SurfaceRole.DocumentSet,
    },
    {
      app: 'state-browser',
      behavior: ContextLaunchBehavior.OpenContext,
      context: () => stateBrowserContext(runtimeStateHandle.url, rootUrl),
      emoji: '🧭',
      label: 'State Browser',
      role: SurfaceRole.DocumentSet,
    },
  ] satisfies readonly LauncherSpec[];

  return launcherSpecs.map((launcherSpec) => ({
    active: focusedAppId === launcherSpec.app,
    app: launcherSpec.app,
    emoji: launcherSpec.emoji,
    label: launcherSpec.label,
    launch: () => {
      if (launcherSpec.context === undefined) {
        launchApp({ app: launcherSpec.app, behavior: launcherSpec.behavior, role: launcherSpec.role });
        return;
      }
      launchApp({
        app: launcherSpec.app,
        behavior: launcherSpec.behavior,
        context: launcherSpec.context(),
        role: launcherSpec.role,
      });
    },
  }));
}

type LauncherSpec = ContextLauncherSpec | ManagedLauncherSpec;

type ContextLauncherSpec = LauncherSpecBase & {
  readonly app: string;
  readonly context: () => WindowContext;
};

type ManagedLauncherSpec = LauncherSpecBase & {
  readonly app: 'terminal';
  readonly context?: undefined;
};

type LauncherSpecBase = {
  readonly behavior: ContextLaunchBehavior;
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

function stateBrowserContext(url: string, rootUrl: string): WindowContext {
  return {
    app: 'state-browser',
    container: rootContainer(rootUrl),
    id: 'state-browser',
    title: 'State Browser',
    url,
  };
}
