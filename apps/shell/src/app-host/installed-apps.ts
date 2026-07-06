import {
  SurfaceRole,
  type AppManifestDoc,
  type FilesystemNode,
} from '@patchpit/system';
import { isPackageAppManifestDoc } from '../runtime/app-manifest-discovery';
import { resolvePackageEntry } from '../runtime/package-entry';

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

export function installedAppRole(app: InstalledApp): SurfaceRole {
  return app.manifest.surfaces?.[0]?.role ?? SurfaceRole.DocumentSet;
}

export function installedAppHasStatefulLaunch(app: InstalledApp): boolean {
  return app.manifest.surfaces?.some((surface) => surface.state !== undefined) ?? false;
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
