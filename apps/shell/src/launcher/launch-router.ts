import {
  rootContainer,
  type WindowContext,
} from '@patchpit/system';
import {
  installedAppHasStatefulLaunch,
  installedAppRole,
  type InstalledApp,
} from '../app-host/installed-apps';
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
  filePickerStateUrl,
  installedApps,
  launchApp,
  rootUrl,
  runtimeStateUrl,
}: {
  readonly focusedAppId: string | undefined;
  readonly filePickerStateUrl: string;
  readonly installedApps: readonly InstalledApp[];
  readonly launchApp: (input: AppLaunchIntentInput) => void;
  readonly rootUrl: string;
  readonly runtimeStateUrl: string;
}): readonly LauncherItem[] {
  return installedApps.map((app) => ({
    active: focusedAppId === app.manifest.id,
    app: app.manifest.id,
    emoji: app.icon,
    label: app.manifest.id === 'file-picker' ? 'Files' : app.manifest.name,
    launch: () => {
      launchApp(launcherLaunchInput(app, { filePickerStateUrl, rootUrl, runtimeStateUrl }));
    },
  }));
}

function launcherLaunchInput(
  app: InstalledApp,
  urls: {
    readonly filePickerStateUrl: string;
    readonly rootUrl: string;
    readonly runtimeStateUrl: string;
  },
): AppLaunchIntentInput {
  const role = installedAppRole(app);
  if (app.manifest.id === 'file-picker') {
    return {
      app: app.manifest.id,
      behavior: ContextLaunchBehavior.ToggleSurface,
      context: filePickerContext(urls.filePickerStateUrl, urls.rootUrl),
      role,
    };
  }
  if (app.manifest.id === 'state-browser') {
    return {
      app: app.manifest.id,
      behavior: ContextLaunchBehavior.OpenContext,
      context: stateBrowserContext(urls.runtimeStateUrl, urls.rootUrl),
      role,
    };
  }
  if (app.manifest.id === 'viewer') {
    return {
      app: app.manifest.id,
      behavior: ContextLaunchBehavior.OpenContext,
      context: statelessAppContext(app, urls.rootUrl, urls.rootUrl),
      role,
    };
  }
  if (installedAppHasStatefulLaunch(app)) {
    return {
      app: app.manifest.id,
      behavior: ContextLaunchBehavior.OpenContext,
      role,
    };
  }
  return {
    app: app.manifest.id,
    behavior: ContextLaunchBehavior.OpenContext,
    context: statelessAppContext(app, app.entry?.url ?? app.manifestUrl, urls.rootUrl),
    role,
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

function stateBrowserContext(url: string, rootUrl: string): WindowContext {
  return {
    app: 'state-browser',
    container: rootContainer(rootUrl),
    id: 'state-browser',
    title: 'State Browser',
    url,
  };
}

function statelessAppContext(app: InstalledApp, url: string, rootUrl: string): WindowContext {
  return {
    app: app.manifest.id,
    container: rootContainer(rootUrl),
    id: `${app.manifest.id}:${url}`,
    title: app.manifest.name,
    url,
  };
}
