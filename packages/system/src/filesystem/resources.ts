import type { DocHandle } from '@automerge/automerge-repo';
import { patchpitDocMetadata } from './schemas';
import type { PatchpitJson } from '../schema';
import {
  automergeMimeType,
  isAutomergeFileName,
  PatchpitType,
  type FileDoc,
  type FilesystemIndexDoc,
  type FilesystemIndexOwnership,
  type FilesystemIndexRow,
  type FilesystemResource,
  type FolderDoc,
  type FolderEntry,
} from './types';

export type FilesystemResourceHandle<T extends FilesystemResource = FilesystemResource> = Pick<
  DocHandle<T>,
  'doc' | 'url'
>;

export const runtimeMaintainedFilesystemIndexOwnership = {
  canonicalState: 'linked-automerge-documents',
  currentMaintainer: '@patchpit/system/filesystem',
  indexLifecycle: 'runtime-maintained-materialized-index',
  note: 'Runtime-maintained index over linked Automerge docs; rebuild from handles and do not treat rows as canonical state or public projection payload.',
} as const satisfies FilesystemIndexOwnership;

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

export function createFilesystemIndexDoc(
  rootUrl: string,
  handles: Iterable<FilesystemResourceHandle>,
): FilesystemIndexDoc {
  return {
    '@patchpit': patchpitDocMetadata(PatchpitType.FilesystemIndex),
    filesystemIndex: {
      rootUrl,
      documents: filesystemIndexRowsForResources(handles),
    },
    ownership: { ...runtimeMaintainedFilesystemIndexOwnership },
  };
}

function filesystemIndexRowForResource(url: string, doc: FilesystemResource): FilesystemIndexRow {
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

function filesystemResourceFromHandle<T extends FilesystemResource>(
  handle: FilesystemResourceHandle<T>,
): T {
  return handle.doc();
}

function filesystemIndexRowsForResources(
  handles: Iterable<FilesystemResourceHandle>,
): FilesystemIndexRow[] {
  return Array.from(handles, (handle) => (
    filesystemIndexRowForResource(handle.url, filesystemResourceFromHandle(handle))
  ));
}

export function syncFilesystemIndexResource<T extends FilesystemResource>(
  indexHandle: DocHandle<FilesystemIndexDoc>,
  handle: DocHandle<T>,
): void {
  syncFilesystemIndexResources(indexHandle, [handle]);
}

export function syncFilesystemIndexResources(
  indexHandle: DocHandle<FilesystemIndexDoc>,
  handles: Iterable<FilesystemResourceHandle>,
): void {
  const rows = filesystemIndexRowsForResources(handles);
  if (rows.length === 0) return;

  indexHandle.change((doc) => {
    for (const row of rows) upsertFilesystemIndexRow(doc.filesystemIndex.documents, row);
  });
}

export function removeFilesystemIndexResources(
  indexHandle: DocHandle<FilesystemIndexDoc>,
  urls: Iterable<string>,
  options: {
    readonly syncHandles?: Iterable<FilesystemResourceHandle>;
  } = {},
): void {
  const removeUrls = [...urls];
  const upsertRows = filesystemIndexRowsForResources(options.syncHandles ?? []);
  if (removeUrls.length === 0 && upsertRows.length === 0) return;

  indexHandle.change((doc) => {
    removeFilesystemIndexRows(doc.filesystemIndex.documents, removeUrls);
    for (const row of upsertRows) upsertFilesystemIndexRow(doc.filesystemIndex.documents, row);
  });
}

function upsertFilesystemIndexRow(
  rows: FilesystemIndexRow[],
  row: FilesystemIndexRow,
): void {
  const index = rows.findIndex((item) => item.url === row.url);
  const nextRow = cloneFilesystemIndexRow(row);
  if (index === -1) rows.push(nextRow);
  else rows[index] = nextRow;
}

function removeFilesystemIndexRows(rows: FilesystemIndexRow[], urls: Iterable<string>): void {
  const urlSet = new Set(urls);
  if (urlSet.size === 0) return;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row !== undefined && urlSet.has(row.url)) rows.splice(index, 1);
  }
}

function cloneFilesystemIndexRow(row: FilesystemIndexRow): FilesystemIndexRow {
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
  if (name.endsWith('.html')) return 'text/html';
  if (name.endsWith('.css')) return 'text/css';
  if (name.endsWith('.js')) return 'text/javascript';
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.map')) return 'application/json';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function cloneJsonValue(value: PatchpitJson): PatchpitJson {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isJsonRecord(value)) {
    const clone: Record<string, PatchpitJson> = {};
    for (const [key, nestedValue] of Object.entries(value)) clone[key] = cloneJsonValue(nestedValue);
    return clone;
  }
  return value;
}

function isJsonRecord(value: PatchpitJson): value is Readonly<Record<string, PatchpitJson>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
