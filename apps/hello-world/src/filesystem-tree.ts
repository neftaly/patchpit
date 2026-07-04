import type {
  FilesystemDocumentRow,
  FilesystemResourceRecord,
  FolderDoc,
  FolderEntry,
} from './filesystem';
import { EntryKind } from './filesystem';

export type FilesystemNode =
  | {
      readonly kind: 'folder';
      readonly entries: readonly FilesystemNode[];
      readonly name: string;
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
  documents: readonly FilesystemResourceRecord[],
  rows: readonly FilesystemDocumentRow[],
): FilesystemNode {
  return buildLinkedNode({ name: '/', type: EntryKind.Folder, url: rootUrl }, documentsByUrl(documents), rowsByUrl(rows));
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

export function folderSummary(node: Extract<FilesystemNode, { kind: 'folder' }>) {
  return {
    url: node.url,
    entries: node.entries.map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      url: entry.url,
    })),
  };
}

function buildLinkedNode(
  entry: FolderEntry,
  docs: ReadonlyMap<string, FilesystemResourceRecord['doc']>,
  rows: ReadonlyMap<string, FilesystemDocumentRow>,
): FilesystemNode {
  if (entry.type === EntryKind.File) {
    return fileNode(entry, rows.get(entry.url));
  }

  const doc = docs.get(entry.url);
  if (!isFolderDoc(doc)) {
    throw new Error(`Missing folder document for ${entry.url}`);
  }

  return {
    entries: doc.entries
      .map((child) => buildLinkedNode(child, docs, rows))
      .sort(compareNodes),
    kind: 'folder',
    name: doc.name || entry.name,
    url: entry.url,
  };
}

function fileNode(entry: FolderEntry, row: FilesystemDocumentRow | undefined): FilesystemNode {
  return {
    kind: 'file',
    mediaType: row?.mimeType ?? mimeTypeFromName(entry.name),
    name: entry.name,
    sourceUrl: isExternalUrl(entry.url) ? entry.url : null,
    text: row?.content ?? '',
    url: entry.url,
  };
}

function compareNodes(left: FilesystemNode, right: FilesystemNode): number {
  return left.kind === right.kind
    ? left.name.localeCompare(right.name)
    : left.kind === 'folder'
      ? -1
      : 1;
}

function documentsByUrl(documents: readonly FilesystemResourceRecord[]) {
  return new Map(documents.map((record) => [record.url, record.doc]));
}

function rowsByUrl(rows: readonly FilesystemDocumentRow[]) {
  return new Map(rows.map((row) => [row.url, row]));
}

function isFolderDoc(doc: FilesystemResourceRecord['doc'] | undefined): doc is FolderDoc {
  return doc?.entryKind === EntryKind.Folder;
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
