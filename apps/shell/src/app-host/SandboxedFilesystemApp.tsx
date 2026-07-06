import type { WindowContext } from '@patchpit/system';
import { SandboxAppHost } from './SandboxAppHost';
import type { InstalledApp } from './installed-apps';

export function SandboxedFilesystemApp({
  app,
  context,
}: {
  readonly app: InstalledApp;
  readonly context: WindowContext;
  readonly surfaceId: string;
}) {
  return (
    <SandboxAppHost
      appId={app.manifest.id}
      entry={app.entry?.kind === 'file' ? { text: app.entry.text, url: app.entry.url } : undefined}
      session={{ app: context.app, id: context.id, url: context.url }}
      title={app.manifest.name}
    />
  );
}
