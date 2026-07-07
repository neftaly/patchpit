import type {
  FilesystemIndexRow,
  FolderEntry,
} from './types';
import { PatchpitType } from './types';
import { mimeTypeFromFileName } from './resources';

export type FilesystemNode =
  | {
      readonly kind: 'folder';
      readonly entries: readonly FilesystemNode[];
      readonly id: string;
      readonly name: string;
      readonly text: string;
      readonly url: string;
    }
  | {
      readonly kind: 'file';
      readonly id: string;
      readonly mediaType: string;
      readonly name: string;
      readonly sourceUrl: string | null;
      readonly text: string;
      readonly url: string;
    };

export function buildFilesystem(
  rootUrl: string,
  indexRows: readonly FilesystemIndexRow[],
): FilesystemNode {
  return filesystemNodeFromEntry(
    { name: '/', type: PatchpitType.Folder, url: rootUrl },
    '/',
    mapIndexRowsByUrl(indexRows),
  );
}

export function findNode(node: FilesystemNode, url: string): FilesystemNode | null {
  if (node.url === url) return node;
  if (node.kind === 'file') return null;
  for (const child of node.entries) {
    const match = findNode(child, url);
    if (match) return match;
  }
  return null;
}

export function nodePath(node: FilesystemNode, url: string, path = '/'): string | undefined {
  if (node.url === url) return path;
  if (node.kind === 'file') return undefined;
  for (const child of node.entries) {
    const match = nodePath(child, url, joinPath(path, child.name));
    if (match !== undefined) return match;
  }
  return undefined;
}

function filesystemNodeFromEntry(
  entry: FolderEntry,
  id: string,
  indexRowsByUrl: ReadonlyMap<string, FilesystemIndexRow>,
): FilesystemNode {
  if (entry.type !== PatchpitType.Folder) {
    return fileNodeFromEntry(entry, id, indexRowsByUrl.get(entry.url));
  }

  const indexRow = indexRowsByUrl.get(entry.url);
  if (indexRow === undefined) {
    throw new Error(`Missing folder document for ${entry.url}`);
  }

  return {
    entries: folderEntriesFromIndexField(indexRow.entries)
      .map((childEntry) => filesystemNodeFromEntry(childEntry, joinPath(id, childEntry.name), indexRowsByUrl)),
    id,
    kind: 'folder',
    name: indexRow.title || entry.name,
    text: indexRow.content ?? '',
    url: entry.url,
  };
}

function fileNodeFromEntry(
  entry: FolderEntry,
  id: string,
  indexRow: FilesystemIndexRow | undefined,
): FilesystemNode {
  return {
    id,
    kind: 'file',
    mediaType: indexRow?.mimeType ?? mimeTypeFromFileName(entry.name),
    name: entry.name,
    sourceUrl: indexRow === undefined && !isAutomergeUrl(entry.url) ? entry.url : null,
    text: indexRow?.content ?? '',
    url: entry.url,
  };
}

function mapIndexRowsByUrl(indexRows: readonly FilesystemIndexRow[]) {
  return new Map(indexRows.map((indexRow) => [indexRow.url, indexRow]));
}

function folderEntriesFromIndexField(input: unknown): readonly FolderEntry[] {
  return Array.isArray(input) && input.every(isFolderEntry) ? input : [];
}

function isFolderEntry(value: unknown): value is FolderEntry {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && typeof value.url === 'string';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAutomergeUrl(url: string): boolean {
  return url.startsWith('automerge:');
}

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}
