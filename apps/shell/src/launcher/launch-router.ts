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
  installedApps,
  launchApp,
}: {
  readonly focusedAppId: string | undefined;
  readonly installedApps: readonly InstalledApp[];
  readonly launchApp: (input: AppLaunchIntentInput) => void;
}): readonly LauncherItem[] {
  return installedApps
    .filter(isDirectLauncherApp)
    .map((app) => ({
      active: focusedAppId === app.manifest.id,
      app: app.manifest.id,
      emoji: app.icon,
      label: app.manifest.id === 'file-picker' ? 'Files' : app.manifest.name,
      launch: () => {
        launchApp(launcherLaunchInput(app));
      },
    }));
}

function launcherLaunchInput(app: InstalledApp): AppLaunchIntentInput {
  const role = installedAppRole(app);
  return {
    app: app.manifest.id,
    behavior: app.manifest.id === 'file-picker'
      ? ContextLaunchBehavior.ToggleSurface
      : ContextLaunchBehavior.OpenContext,
    role,
  };
}

function isDirectLauncherApp(app: InstalledApp): boolean {
  if (installedAppHasStatefulLaunch(app)) return true;
  return (app.manifest.handles?.length ?? 0) === 0;
}
