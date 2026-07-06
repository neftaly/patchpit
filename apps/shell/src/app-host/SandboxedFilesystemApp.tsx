import type { FilesystemNode, WindowContext } from '@patchpit/system';
import { SandboxAppHost } from './SandboxAppHost';
import type { InstalledApp } from './installed-apps';
import { sandboxFilesystemAppEntry } from './sandbox-package-loader';

export function SandboxedFilesystemApp({
  app,
  context,
  filesystemRoot,
}: {
  readonly app: InstalledApp;
  readonly context: WindowContext;
  readonly filesystemRoot: FilesystemNode;
  readonly surfaceId: string;
}) {
  const entry = app.entry?.kind === 'file'
    ? sandboxFilesystemAppEntry({
        entry: app.entry,
        entryKind: app.manifest.entryKind,
        entryPath: app.manifest.entry,
        packageRoot: app.packageRoot,
      })
    : undefined;

  return (
    <SandboxAppHost
      appId={app.manifest.id}
      entry={entry}
      resourceRoot={filesystemRoot}
      session={{ app: context.app, id: context.id, url: context.url }}
      title={app.manifest.name}
    />
  );
}
