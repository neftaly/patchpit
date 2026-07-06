import { automergeMapSource, defineAutomergeMapRelations } from '@tarstate/automerge';
import {
  as,
  asc,
  from,
  maybe,
  pipe,
  project,
  sort,
} from '@tarstate/core';
import { evaluate } from '@tarstate/core/evaluate';
import { buildFilesystem, type FilesystemNode } from './tree';
import { mimeTypeFromFileName } from './resources';
import { filesystemIndexSchema, patchpitSystemRelationRef } from './schemas';
import {
  PatchpitType,
  type FilesystemIndexDoc,
  type FilesystemIndexRow,
  type FolderEntry,
} from './types';
import {
  filesystemTreeNodesRelation,
  type FilesystemTreeNodeKind,
  type FilesystemTreeNodeRow,
} from '../runtime/protocol';

export type ProjectedFilesystem = {
  readonly diagnostics: readonly unknown[];
  readonly root: FilesystemNode | null;
};

export type FilesystemIndexProjection = {
  readonly diagnostics: readonly unknown[];
  readonly rows: readonly FilesystemIndexRow[];
};

export type FilesystemTreeProjection = {
  readonly diagnostics: readonly unknown[];
  readonly rows: readonly FilesystemTreeNodeRow[];
};

export type FilesystemTreeProjectionRelations = Readonly<{
  [filesystemTreeNodesRelation]: readonly FilesystemTreeNodeRow[];
}>;

const filesystemIndexDocumentsRelation = patchpitSystemRelationRef<FilesystemIndexRow>(
  filesystemIndexSchema,
  'documents',
);

const filesystemRelations = defineAutomergeMapRelations<FilesystemIndexDoc>()([
  { relation: filesystemIndexDocumentsRelation, path: ['filesystemIndex', 'documents'] },
]);

const indexedDocument = as(filesystemIndexDocumentsRelation, 'document');
const filesystemIndexRowsQuery = pipe(
  from(indexedDocument),
  sort(asc(indexedDocument.url)),
  project({
    content: maybe(indexedDocument.content),
    entries: maybe(indexedDocument.entries),
    mimeType: maybe(indexedDocument.mimeType),
    title: maybe(indexedDocument.title),
    type: indexedDocument.type,
    url: indexedDocument.url,
  }),
);

export function projectFilesystem(
  indexDoc: FilesystemIndexDoc,
  rootUrl: string,
): ProjectedFilesystem {
  const projection = projectFilesystemRows(indexDoc);

  return projection.diagnostics.length > 0
    ? { diagnostics: projection.diagnostics, root: null }
    : projectFilesystemTree(projection.rows, rootUrl);
}

export function projectFilesystemRows(indexDoc: FilesystemIndexDoc): FilesystemIndexProjection {
  const evaluation = evaluate(
    automergeMapSource(indexDoc, { relations: filesystemRelations }),
    filesystemIndexRowsQuery,
  );

  return evaluation.diagnostics.length > 0
    ? { diagnostics: evaluation.diagnostics, rows: [] }
    : { diagnostics: [], rows: evaluation.rows as readonly FilesystemIndexRow[] };
}

export function projectFilesystemTreeRows(
  indexDoc: FilesystemIndexDoc,
  rootUrl: string,
): FilesystemTreeProjection {
  const projection = projectFilesystemRows(indexDoc);
  if (projection.diagnostics.length > 0) {
    return { diagnostics: projection.diagnostics, rows: [] };
  }
  return filesystemTreeRowsFromIndex(projection.rows, rootUrl);
}

export function projectFilesystemTree(
  indexRows: readonly FilesystemIndexRow[],
  rootUrl: string,
): ProjectedFilesystem {
  return {
    diagnostics: [],
    root: buildFilesystem(rootUrl, indexRows),
  };
}

export function projectFilesystemTreeFromRows(
  treeRowInputs: readonly unknown[],
  rootUrl: string,
): ProjectedFilesystem {
  const parsedTreeRows = parseFilesystemTreeRows(treeRowInputs);
  if (parsedTreeRows.diagnostics.length > 0) {
    return { diagnostics: parsedTreeRows.diagnostics, root: null };
  }

  const diagnostics: unknown[] = [];
  const treeRowsByUrl = new Map<string, FilesystemTreeNodeRow>();
  let rootRowCount = 0;
  for (const treeRow of parsedTreeRows.rows) {
    if (treeRowsByUrl.has(treeRow.url)) diagnostics.push(`Duplicate filesystem tree row for ${treeRow.url}.`);
    if (treeRow.isRoot) rootRowCount += 1;
    treeRowsByUrl.set(treeRow.url, treeRow);
  }

  if (rootRowCount !== 1) {
    diagnostics.push(`Expected exactly one filesystem tree root row, found ${rootRowCount}.`);
  }

  const rootRow = treeRowsByUrl.get(rootUrl);
  if (rootRow === undefined) diagnostics.push(`Missing filesystem tree root row for ${rootUrl}.`);
  else if (!rootRow.isRoot || rootRow.parentUrl !== null) {
    diagnostics.push(`Filesystem tree root row for ${rootUrl} must be marked as the root.`);
  }

  const childRowsByParentUrl = new Map<string, FilesystemTreeNodeRow[]>();
  for (const treeRow of parsedTreeRows.rows) {
    if (treeRow.isRoot !== (treeRow.parentUrl === null)) {
      diagnostics.push(`Filesystem tree row ${treeRow.url} has inconsistent root metadata.`);
    }
    if (treeRow.parentUrl === null) continue;
    const parentRow = treeRowsByUrl.get(treeRow.parentUrl);
    if (parentRow === undefined) {
      diagnostics.push(`Filesystem tree row ${treeRow.url} references missing parent ${treeRow.parentUrl}.`);
      continue;
    }
    if (parentRow.kind !== 'folder') {
      diagnostics.push(`Filesystem tree row ${treeRow.url} references non-folder parent ${treeRow.parentUrl}.`);
      continue;
    }
    const childRows = childRowsByParentUrl.get(treeRow.parentUrl) ?? [];
    childRows.push(treeRow);
    childRowsByParentUrl.set(treeRow.parentUrl, childRows);
  }

  if (rootRow === undefined || diagnostics.length > 0) {
    return { diagnostics, root: null };
  }

  const projectedRoot = filesystemNodeFromTreeRow(rootRow, childRowsByParentUrl, new Set(), diagnostics);
  return diagnostics.length > 0
    ? { diagnostics, root: null }
    : { diagnostics: [], root: projectedRoot };
}

export function filesystemTreeProjectionRelations(
  nodeRows: readonly FilesystemTreeNodeRow[],
): FilesystemTreeProjectionRelations {
  return { [filesystemTreeNodesRelation]: nodeRows };
}

function filesystemTreeRowsFromIndex(
  indexRows: readonly FilesystemIndexRow[],
  rootUrl: string,
): FilesystemTreeProjection {
  const diagnostics: unknown[] = [];
  const indexRowsByUrl = mapIndexRowsByUrl(indexRows);
  const treeRows: FilesystemTreeNodeRow[] = [];

  appendFilesystemTreeRows(
    { name: '/', type: PatchpitType.Folder, url: rootUrl },
    { isRoot: true, parentUrl: null, position: 0 },
    indexRowsByUrl,
    treeRows,
    diagnostics,
    new Set(),
  );

  return diagnostics.length > 0
    ? { diagnostics, rows: [] }
    : { diagnostics: [], rows: treeRows };
}

function appendFilesystemTreeRows(
  entry: FolderEntry,
  placement: { readonly isRoot: boolean; readonly parentUrl: string | null; readonly position: number },
  indexRowsByUrl: ReadonlyMap<string, FilesystemIndexRow>,
  treeRows: FilesystemTreeNodeRow[],
  diagnostics: unknown[],
  ancestors: Set<string>,
): void {
  if (ancestors.has(entry.url)) {
    diagnostics.push(`Filesystem tree contains a cycle at ${entry.url}.`);
    return;
  }

  const indexRow = indexRowsByUrl.get(entry.url);
  const kind = treeNodeKind(entry.type);
  if (kind === 'folder' && indexRow === undefined) {
    diagnostics.push(`Missing folder document for ${entry.url}.`);
    return;
  }

  treeRows.push({
    isRoot: placement.isRoot,
    kind,
    mediaType: kind === 'file' ? indexRow?.mimeType ?? mimeTypeFromFileName(entry.name) : null,
    name: kind === 'folder' ? indexRow?.title || entry.name : entry.name,
    parentUrl: placement.parentUrl,
    position: placement.position,
    sourceUrl: kind === 'file' && isExternalUrl(entry.url) ? entry.url : null,
    text: indexRow?.content ?? '',
    title: indexRow?.title ?? null,
    type: indexRow?.type ?? entry.type,
    url: entry.url,
  });

  if (kind !== 'folder') return;

  ancestors.add(entry.url);
  const childEntries = folderEntriesFromIndexField(indexRow?.entries);
  childEntries.forEach((childEntry, position) => {
    appendFilesystemTreeRows(
      childEntry,
      { isRoot: false, parentUrl: entry.url, position },
      indexRowsByUrl,
      treeRows,
      diagnostics,
      ancestors,
    );
  });
  ancestors.delete(entry.url);
}

function parseFilesystemTreeRows(candidateRows: readonly unknown[]): {
  readonly diagnostics: readonly unknown[];
  readonly rows: readonly FilesystemTreeNodeRow[];
} {
  const diagnostics: unknown[] = [];
  const treeRows: FilesystemTreeNodeRow[] = [];

  candidateRows.forEach((candidateRow, index) => {
    if (!isFilesystemTreeNodeRow(candidateRow)) {
      diagnostics.push(`Invalid filesystem tree row at index ${index}.`);
      return;
    }
    treeRows.push(candidateRow);
  });

  return { diagnostics, rows: treeRows };
}

function isFilesystemTreeNodeRow(value: unknown): value is FilesystemTreeNodeRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.url === 'string'
    && (value.parentUrl === null || typeof value.parentUrl === 'string')
    && typeof value.isRoot === 'boolean'
    && typeof value.position === 'number'
    && Number.isInteger(value.position)
    && value.position >= 0
    && typeof value.name === 'string'
    && isFilesystemTreeNodeKind(value.kind)
    && typeof value.type === 'string'
    && (value.title === null || typeof value.title === 'string')
    && (value.mediaType === null || typeof value.mediaType === 'string')
    && (value.sourceUrl === null || typeof value.sourceUrl === 'string')
    && typeof value.text === 'string'
  );
}

function filesystemNodeFromTreeRow(
  treeRow: FilesystemTreeNodeRow,
  childrenByParent: ReadonlyMap<string, readonly FilesystemTreeNodeRow[]>,
  ancestors: Set<string>,
  diagnostics: unknown[],
): FilesystemNode {
  if (treeRow.kind === 'file') {
    return {
      kind: 'file',
      mediaType: treeRow.mediaType ?? mimeTypeFromFileName(treeRow.name),
      name: treeRow.name,
      sourceUrl: treeRow.sourceUrl,
      text: treeRow.text,
      url: treeRow.url,
    };
  }

  if (ancestors.has(treeRow.url)) {
    diagnostics.push(`Filesystem tree contains a cycle at ${treeRow.url}.`);
    return { entries: [], kind: 'folder', name: treeRow.name, text: treeRow.text, url: treeRow.url };
  }

  ancestors.add(treeRow.url);
  const childNodes = [...(childrenByParent.get(treeRow.url) ?? [])]
    .sort(compareFilesystemTreeRows)
    .map((child) => filesystemNodeFromTreeRow(child, childrenByParent, ancestors, diagnostics));
  ancestors.delete(treeRow.url);

  return {
    entries: childNodes,
    kind: 'folder',
    name: treeRow.name,
    text: treeRow.text,
    url: treeRow.url,
  };
}

function compareFilesystemTreeRows(left: FilesystemTreeNodeRow, right: FilesystemTreeNodeRow): number {
  return left.position - right.position || left.name.localeCompare(right.name) || left.url.localeCompare(right.url);
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

function treeNodeKind(type: string): FilesystemTreeNodeKind {
  return type === PatchpitType.Folder ? 'folder' : 'file';
}

function isFilesystemTreeNodeKind(value: unknown): value is FilesystemTreeNodeKind {
  return value === 'folder' || value === 'file';
}

function isExternalUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
