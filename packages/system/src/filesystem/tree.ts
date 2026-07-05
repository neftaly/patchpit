import type {
  FilesystemIndexRow,
  FolderEntry,
} from './types';
import { PatchpitType } from './types';

export type FilesystemNode =
  | {
      readonly kind: 'folder';
      readonly entries: readonly FilesystemNode[];
      readonly name: string;
      readonly text: string;
      readonly url: string;
    }
  | {
      readonly kind: 'file';
      readonly mediaType: string;
      readonly name: string;
      readonly sourceUrl: string | null;
      readonly text: string;
      readonly url: string;
    };

export function buildFilesystem(
  rootUrl: string,
  rows: readonly FilesystemIndexRow[],
): FilesystemNode {
  return buildLinkedNode({ name: '/', type: PatchpitType.Folder, url: rootUrl }, rowsByUrl(rows));
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

function buildLinkedNode(
  entry: FolderEntry,
  rows: ReadonlyMap<string, FilesystemIndexRow>,
): FilesystemNode {
  if (entry.type !== PatchpitType.Folder) {
    return fileNode(entry, rows.get(entry.url));
  }

  const row = rows.get(entry.url);
  if (row === undefined) {
    throw new Error(`Missing folder document for ${entry.url}`);
  }

  return {
    entries: folderEntries(row.entries)
      .map((child) => buildLinkedNode(child, rows)),
    kind: 'folder',
    name: row.title || entry.name,
    text: row.content ?? '',
    url: entry.url,
  };
}

function fileNode(entry: FolderEntry, row: FilesystemIndexRow | undefined): FilesystemNode {
  return {
    kind: 'file',
    mediaType: row?.mimeType ?? mimeTypeFromName(entry.name),
    name: entry.name,
    sourceUrl: isExternalUrl(entry.url) ? entry.url : null,
    text: row?.content ?? '',
    url: entry.url,
  };
}

function rowsByUrl(rows: readonly FilesystemIndexRow[]) {
  return new Map(rows.map((row) => [row.url, row]));
}

function folderEntries(input: unknown): readonly FolderEntry[] {
  return Array.isArray(input) ? input as readonly FolderEntry[] : [];
}

function isExternalUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function mimeTypeFromName(name: string): string {
  if (name.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}
