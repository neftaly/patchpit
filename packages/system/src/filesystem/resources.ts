import type { DocHandle } from '@automerge/automerge-repo';
import type { JsonValue } from '@tarstate/core';
import { patchpitDocMetadata } from './schemas';
import {
  automergeMimeType,
  isAutomergeFileName,
  PatchpitType,
  type FileDoc,
  type FilesystemIndexDoc,
  type FilesystemIndexRow,
  type FilesystemResource,
  type FolderDoc,
  type FolderEntry,
} from './types';

export function folderEntry(name: string, type: PatchpitType | string, entryUrl: string): FolderEntry {
  return { name, type, url: entryUrl };
}

export function appendFolderEntries(doc: FolderDoc, entries: readonly FolderEntry[]): void {
  for (const entry of entries) appendFolderEntry(doc, entry);
}

export function appendFolderEntry(doc: FolderDoc, entry: FolderEntry): void {
  doc.docs.push(cloneFolderEntry(entry));
}

export function replaceFolderEntries(target: FolderEntry[], entries: readonly FolderEntry[]): void {
  target.splice(0, target.length);
  for (const entry of entries) target.push(cloneFolderEntry(entry));
}

export function cloneFolderEntries(entries: readonly FolderEntry[]): FolderEntry[] {
  return entries.map(cloneFolderEntry);
}

export function cloneFolderEntry({ name, type, url }: FolderEntry): FolderEntry {
  return { name, type, url };
}

export function createPatchpitFolderDoc(name: string, entries: readonly FolderEntry[] = []): FolderDoc {
  return {
    '@patchpit': patchpitDocMetadata(PatchpitType.Folder),
    docs: cloneFolderEntries(entries),
    name,
    title: name || '/',
  };
}

export function createPatchpitFileDoc(name: string, content: string): FileDoc {
  return {
    '@patchpit': patchpitDocMetadata(PatchpitType.File),
    content,
    extension: fileExtensionFromName(name),
    mimeType: mimeTypeFromFileName(name),
    name,
  };
}

export function filesystemIndexRowForResource(url: string, doc: FilesystemResource): FilesystemIndexRow {
  const type = doc['@patchpit'].type;
  if ('docs' in doc) {
    return cloneFilesystemIndexRow({
      content: JSON.stringify(doc, null, 2),
      entries: cloneFolderEntries(doc.docs),
      title: doc.title,
      type,
      url,
    });
  }
  return cloneFilesystemIndexRow({
    content: 'content' in doc ? doc.content : JSON.stringify(doc, null, 2),
    mimeType: doc.mimeType,
    type,
    url,
  });
}

export function filesystemResourceFromHandle<T extends FilesystemResource>(
  handle: DocHandle<T>,
): FilesystemResource {
  return handle.doc() as unknown as FilesystemResource;
}

export function syncFilesystemIndexResource<T extends FilesystemResource>(
  indexHandle: DocHandle<FilesystemIndexDoc>,
  handle: DocHandle<T>,
): void {
  indexHandle.change((doc) => {
    upsertFilesystemIndexRow(
      doc.filesystemIndex.documents,
      filesystemIndexRowForResource(handle.url, filesystemResourceFromHandle(handle)),
    );
  });
}

export function upsertFilesystemIndexRow(
  rows: FilesystemIndexRow[],
  row: FilesystemIndexRow,
): void {
  const index = rows.findIndex((item) => item.url === row.url);
  const nextRow = cloneFilesystemIndexRow(row);
  if (index === -1) rows.push(nextRow);
  else rows[index] = nextRow;
}

export function removeFilesystemIndexRow(rows: FilesystemIndexRow[], url: string): void {
  const index = rows.findIndex((row) => row.url === url);
  if (index !== -1) rows.splice(index, 1);
}

export function cloneFilesystemIndexRow(row: FilesystemIndexRow): FilesystemIndexRow {
  return {
    ...(row.content === undefined ? {} : { content: row.content }),
    ...(row.entries === undefined ? {} : { entries: cloneJsonValue(row.entries) }),
    ...(row.mimeType === undefined ? {} : { mimeType: row.mimeType }),
    ...(row.title === undefined ? {} : { title: row.title }),
    type: row.type,
    url: row.url,
  };
}

export function fileExtensionFromName(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1);
}

export function mimeTypeFromFileName(name: string): string {
  if (isAutomergeFileName(name)) return automergeMimeType;
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneJsonValue(nestedValue as JsonValue)]),
    ) as JsonValue;
  }
  return value;
}

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null;
}
