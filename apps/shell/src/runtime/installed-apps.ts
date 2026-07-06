import {
  findNode,
  SurfaceRole,
  type AppManifestDoc,
  type FilesystemNode,
} from '@patchpit/system';
import type {
  InstalledAppRuntimeRow,
  Json,
} from '@patchpit/system/runtime';
import { isPackageAppManifestDoc } from './app-manifest-discovery';
import { resolvePackageEntry } from './package-entry';

type FilesystemFolder = Extract<FilesystemNode, { readonly kind: 'folder' }>;

export type InstalledApp = {
  readonly entry: FilesystemNode | undefined;
  readonly icon: string;
  readonly manifest: AppManifestDoc;
  readonly manifestUrl: string;
  readonly packagePath: string;
  readonly packageRoot: FilesystemFolder;
};

export function installedAppsFromFilesystem({
  getDocument,
  root,
}: {
  readonly getDocument: (url: string) => unknown;
  readonly root: FilesystemNode;
}): readonly InstalledApp[] {
  const appsFolder = childFolder(root, 'apps');
  if (appsFolder === undefined) return [];

  return appsFolder.entries
    .flatMap((entry) => installedAppFromNode(entry, `/apps/${entry.name}`, getDocument));
}

export function installedAppsFromProjectionRows({
  getDocument,
  root,
  rows,
}: {
  readonly getDocument: (url: string) => unknown;
  readonly root: FilesystemNode;
  readonly rows: readonly InstalledAppRuntimeRow[];
}): readonly InstalledApp[] {
  return rows.flatMap((row) => installedAppFromRuntimeRow(row, root, getDocument));
}

export function installedAppRole(app: InstalledApp): SurfaceRole {
  return app.manifest.surfaces?.[0]?.role ?? SurfaceRole.DocumentSet;
}

export function installedAppHasStatefulLaunch(app: InstalledApp): boolean {
  return app.manifest.surfaces?.some((surface) => surface.state !== undefined) ?? false;
}

export function installedAppRuntimeRows(apps: readonly InstalledApp[]): readonly InstalledAppRuntimeRow[] {
  return apps.map((app) => {
    const entryUrl = app.entry?.url;
    return {
      appId: app.manifest.id,
      entryKind: app.manifest.entryKind,
      entryPath: app.manifest.entry,
      entryStatus: entryUrl === undefined ? 'missing' : 'resolved',
      ...(entryUrl === undefined ? {} : { entryUrl }),
      handles: (app.manifest.handles ?? []) as Json,
      hasStatefulLaunch: installedAppHasStatefulLaunch(app),
      icon: app.icon,
      launchRole: installedAppRole(app),
      manifestUrl: app.manifestUrl,
      name: app.manifest.name,
      packagePath: app.packagePath,
      packageUrl: app.packageRoot.url,
      surfaces: (app.manifest.surfaces ?? []) as Json,
      version: app.manifest.version,
    };
  });
}

export function isInstalledAppRuntimeRow(row: unknown): row is InstalledAppRuntimeRow {
  if (!isRecord(row)) return false;
  return (
    typeof row.appId === 'string'
    && typeof row.entryKind === 'string'
    && typeof row.entryPath === 'string'
    && (row.entryStatus === 'resolved' || row.entryStatus === 'missing')
    && (row.entryUrl === undefined || typeof row.entryUrl === 'string')
    && Array.isArray(row.handles)
    && typeof row.hasStatefulLaunch === 'boolean'
    && typeof row.icon === 'string'
    && (row.launchRole === SurfaceRole.DocumentSet || row.launchRole === SurfaceRole.WorkspaceView)
    && typeof row.manifestUrl === 'string'
    && typeof row.name === 'string'
    && typeof row.packagePath === 'string'
    && typeof row.packageUrl === 'string'
    && Array.isArray(row.surfaces)
    && typeof row.version === 'string'
  );
}

function installedAppFromRuntimeRow(
  row: InstalledAppRuntimeRow,
  root: FilesystemNode,
  getDocument: (url: string) => unknown,
): readonly InstalledApp[] {
  const manifest = getDocument(row.manifestUrl);
  const packageRoot = findNode(root, row.packageUrl);
  if (!isPackageAppManifestDoc(manifest) || manifest.id !== row.appId) return [];
  if (packageRoot?.kind !== 'folder') return [];

  const entry = row.entryUrl === undefined ? undefined : findNode(root, row.entryUrl) ?? undefined;
  return [installedApp(manifest, row.manifestUrl, entry, row.packagePath, packageRoot)];
}

function installedAppFromNode(
  node: FilesystemNode,
  path: string,
  getDocument: (url: string) => unknown,
): readonly InstalledApp[] {
  if (node.kind === 'file') return [];

  const manifestNode = node.entries.find((entry) => isPackageAppManifestDoc(getDocument(entry.url)));
  if (manifestNode === undefined) return [];

  const manifest = getDocument(manifestNode.url);
  return isPackageAppManifestDoc(manifest)
    ? [installedApp(manifest, manifestNode.url, resolvePackageEntry(node, manifest.entry, childEntryNode), path, node)]
    : [];
}

function installedApp(
  manifest: AppManifestDoc,
  manifestUrl: string,
  entry: FilesystemNode | undefined,
  packagePath: string,
  packageRoot: FilesystemFolder,
): InstalledApp {
  return {
    entry,
    icon: manifest.icons?.[0]?.emoji ?? '□',
    manifest,
    manifestUrl,
    packagePath,
    packageRoot,
  };
}

function childEntryNode(node: FilesystemNode, name: string): FilesystemNode | undefined {
  return node.kind === 'folder' ? childNode(node, name) : undefined;
}

function childFolder(node: FilesystemNode, name: string): FilesystemFolder | undefined {
  const child = childNode(node, name);
  return child?.kind === 'folder' ? child : undefined;
}

function childNode(node: FilesystemNode, name: string): FilesystemNode | undefined {
  return node.kind === 'folder' ? node.entries.find((entry) => entry.name === name) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
