import {
  containerRootUrl,
  findNode,
  type FilePickerStateDoc,
  type FilesystemNode,
  type WindowContext,
} from '@patchpit/system';
import { useMemo } from 'react';
import type { RuntimeClient } from '@patchpit/system/runtime';
import { SandboxAppHost, type SandboxAppHostSessionEvent } from './SandboxAppHost';
import type { FilesystemApp } from '../runtime/installed-apps';
import { sandboxFilesystemAppEntry } from './sandbox-package-loader';
import type { SandboxAppFilePickerType, SandboxFilePickerServiceScope } from './sandbox-service-bridge';

export function SandboxedFilesystemApp({
  app,
  context,
  filePicker,
  filesystemRoot,
  onSessionEvent,
  surfaceId,
}: {
  readonly app: FilesystemApp;
  readonly context: WindowContext;
  readonly filePicker?: SandboxFilePickerHostScope | undefined;
  readonly filesystemRoot: FilesystemNode;
  readonly onSessionEvent?: ((event: SandboxAppHostSessionEvent) => void) | undefined;
  readonly surfaceId: string;
}) {
  const entry = useMemo(() => (app.entry?.kind === 'file'
    ? sandboxFilesystemAppEntry({
        entry: app.entry,
        entryPath: app.entryPath,
        packageRoot: app.packageRoot,
      })
    : undefined), [app.entry, app.entryPath, app.packageRoot]);

  return (
    <SandboxAppHost
      appId={app.id}
      entry={entry}
      filePicker={sandboxFilePickerServiceScope({ app, context, filePicker, filesystemRoot, surfaceId })}
      onSessionEvent={onSessionEvent}
      resourceRoot={filesystemRoot}
      session={{
        app: context.app,
        ...(context.delegation === undefined ? {} : { delegation: context.delegation }),
        id: context.id,
        url: context.url,
      }}
      title={app.name}
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
  readonly app: FilesystemApp;
  readonly context: WindowContext;
  readonly filePicker?: SandboxFilePickerHostScope | undefined;
  readonly filesystemRoot: FilesystemNode;
  readonly surfaceId: string;
}): SandboxFilePickerServiceScope | undefined {
  if (app.id !== 'file-picker' || context.app !== 'file-picker') return undefined;
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
