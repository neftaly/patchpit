import {
  containerRootUrl,
  findNode,
  type FilePickerStateDoc,
  type FilesystemNode,
  type WindowContext,
} from '@patchpit/system';
import type { RuntimeClient } from '@patchpit/system/runtime';
import { SandboxAppHost } from './SandboxAppHost';
import type { InstalledApp } from './installed-apps';
import { sandboxFilesystemAppEntry } from './sandbox-package-loader';
import type { SandboxAppFilePickerType, SandboxFilePickerServiceScope } from './sandbox-service-bridge';

export function SandboxedFilesystemApp({
  app,
  context,
  filePicker,
  filesystemRoot,
  surfaceId,
}: {
  readonly app: InstalledApp;
  readonly context: WindowContext;
  readonly filePicker?: SandboxFilePickerHostScope | undefined;
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
      filePicker={sandboxFilePickerServiceScope({ app, context, filePicker, filesystemRoot, surfaceId })}
      resourceRoot={filesystemRoot}
      session={{ app: context.app, id: context.id, url: context.url }}
      title={app.manifest.name}
    />
  );
}

export type SandboxFilePickerHostScope = {
  readonly fileTypes: readonly SandboxAppFilePickerType[];
  readonly rootUrl: string;
  readonly runtime: RuntimeClient;
  readonly state: FilePickerStateDoc;
};

function sandboxFilePickerServiceScope({
  app,
  context,
  filePicker,
  filesystemRoot,
  surfaceId,
}: {
  readonly app: InstalledApp;
  readonly context: WindowContext;
  readonly filePicker?: SandboxFilePickerHostScope | undefined;
  readonly filesystemRoot: FilesystemNode;
  readonly surfaceId: string;
}): SandboxFilePickerServiceScope | undefined {
  if (app.manifest.id !== 'file-picker' || context.app !== 'file-picker') return undefined;
  if (filePicker === undefined) return undefined;
  const mountedRootUrl = containerRootUrl(context.container) ?? filePicker.state.rootUrl;
  const root = findNode(filesystemRoot, mountedRootUrl);
  if (root === null) return undefined;

  return {
    fileTypes: filePicker.fileTypes,
    root,
    rootUrl: filePicker.rootUrl,
    runtime: filePicker.runtime,
    sourceSurfaceId: surfaceId,
    state: filePicker.state,
  };
}
