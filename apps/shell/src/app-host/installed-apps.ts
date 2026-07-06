import {
  PatchpitType,
  SurfaceRole,
  type AppManifestDoc,
  type FilesystemNode,
} from '@patchpit/system';

type FilesystemFolder = Extract<FilesystemNode, { readonly kind: 'folder' }>;

export type InstalledApp = {
  readonly entry: FilesystemNode | undefined;
  readonly icon: string;
  readonly manifest: AppManifestDoc;
  readonly manifestUrl: string;
  readonly packagePath: string;
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

  const manifestNode = node.entries.find((entry) => isAppManifestDoc(getDocument(entry.url)));
  if (manifestNode === undefined) return [];

  const manifest = getDocument(manifestNode.url);
  return isAppManifestDoc(manifest)
    ? [installedApp(manifest, manifestNode.url, resolveEntryNode(node, manifest.entry), path)]
    : [];
}

function installedApp(
  manifest: AppManifestDoc,
  manifestUrl: string,
  entry: FilesystemNode | undefined,
  packagePath: string,
): InstalledApp {
  return {
    entry,
    icon: manifest.icons?.[0]?.emoji ?? '□',
    manifest,
    manifestUrl,
    packagePath,
  };
}

function resolveEntryNode(packageFolder: FilesystemNode, entry: string): FilesystemNode | undefined {
  const parts = entry.split('/').filter((part) => part !== '' && part !== '.');
  let node: FilesystemNode | undefined = packageFolder;
  for (const part of parts) {
    if (node?.kind !== 'folder') return undefined;
    node = childNode(node, part);
  }
  return node;
}

function childFolder(node: FilesystemNode, name: string): FilesystemFolder | undefined {
  const child = childNode(node, name);
  return child?.kind === 'folder' ? child : undefined;
}

function childNode(node: FilesystemNode, name: string): FilesystemNode | undefined {
  return node.kind === 'folder' ? node.entries.find((entry) => entry.name === name) : undefined;
}

function isAppManifestDoc(value: unknown): value is AppManifestDoc {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { '@patchpit'?: { type?: unknown } })['@patchpit']?.type === PatchpitType.AppManifest
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { name?: unknown }).name === 'string'
    && typeof (value as { entry?: unknown }).entry === 'string'
  );
}
