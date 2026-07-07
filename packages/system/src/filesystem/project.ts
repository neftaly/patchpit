import { buildFilesystem, type FilesystemNode } from './tree';
import { mimeTypeFromFileName } from './resources';
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
  return {
    diagnostics: [],
    rows: indexDoc.filesystemIndex.documents
      .map(projectFilesystemIndexRow)
      .sort((left, right) => left.url.localeCompare(right.url)),
  };
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
  rootId = '/',
): ProjectedFilesystem {
  const parsedTreeRows = parseFilesystemTreeRows(treeRowInputs);
  if (parsedTreeRows.diagnostics.length > 0) {
    return { diagnostics: parsedTreeRows.diagnostics, root: null };
  }

  const projection = projectRowsTree(parsedTreeRows.rows, {
    canHaveChildren: (row) => row.kind === 'folder',
    rootId,
  });
  return projection.root === null
    ? { diagnostics: projection.diagnostics, root: null }
    : { diagnostics: [], root: filesystemNodeFromProjectedTree(projection.root) };
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
  const indexRowsByUrl = mapIndexRowsByUrl(indexRows);
  const materialized = filesystemTreeFromIndexEntry(
    { name: '/', type: PatchpitType.Folder, url: rootUrl },
    indexRowsByUrl,
    new Set(),
  );

  return materialized.diagnostics.length > 0
    ? { diagnostics: materialized.diagnostics, rows: [] }
    : { diagnostics: [], rows: projectTreeRows(materialized.node) };
}

type PatchpitFilesystemTreeNode = FolderEntry & {
  readonly kind: FilesystemTreeNodeKind;
  readonly mediaType: string | null;
  readonly sourceUrl: string | null;
  readonly text: string;
  readonly title: string | null;
  readonly entries?: readonly PatchpitFilesystemTreeNode[];
};

type ProjectedFilesystemTreeRow = FilesystemTreeNodeRow & {
  readonly entries?: readonly ProjectedFilesystemTreeRow[];
};

type FilesystemTreeMaterialization = {
  readonly diagnostics: readonly unknown[];
  readonly node: PatchpitFilesystemTreeNode;
};

function filesystemTreeFromIndexEntry(
  entry: FolderEntry,
  indexRowsByUrl: ReadonlyMap<string, FilesystemIndexRow>,
  ancestors: Set<string>,
): FilesystemTreeMaterialization {
  if (ancestors.has(entry.url)) {
    return {
      diagnostics: [`Filesystem tree contains a cycle at ${entry.url}.`],
      node: emptyFilesystemTreeNode(entry),
    };
  }

  const indexRow = indexRowsByUrl.get(entry.url);
  const kind = treeNodeKind(entry.type);
  if (kind === 'folder' && indexRow === undefined) {
    return {
      diagnostics: [`Missing folder document for ${entry.url}.`],
      node: emptyFilesystemTreeNode(entry),
    };
  }
  if (kind === 'file' && indexRow === undefined && isAutomergeUrl(entry.url)) {
    return {
      diagnostics: [`Missing file document for ${entry.url}.`],
      node: emptyFilesystemTreeNode(entry),
    };
  }

  const node = {
    kind,
    mediaType: kind === 'file' ? indexRow?.mimeType ?? mimeTypeFromFileName(entry.name) : null,
    name: kind === 'folder' ? indexRow?.title || entry.name : entry.name,
    sourceUrl: kind === 'file' && indexRow === undefined ? entry.url : null,
    text: indexRow?.content ?? '',
    title: indexRow?.title ?? null,
    type: indexRow?.type ?? entry.type,
    url: entry.url,
  };

  if (kind !== 'folder') return { diagnostics: [], node };

  const childAncestorUrls = new Set([...ancestors, entry.url]);
  const childMaterializations = folderEntriesFromIndexField(indexRow?.entries)
    .map((childEntry) => filesystemTreeFromIndexEntry(childEntry, indexRowsByUrl, childAncestorUrls));

  return {
    diagnostics: childMaterializations.flatMap((child) => child.diagnostics),
    node: {
      ...node,
      entries: childMaterializations.map((child) => child.node),
    },
  };
}

function emptyFilesystemTreeNode(entry: FolderEntry): PatchpitFilesystemTreeNode {
  const kind = treeNodeKind(entry.type);
  return {
    kind,
    mediaType: kind === 'file' ? mimeTypeFromFileName(entry.name) : null,
    name: entry.name,
    sourceUrl: null,
    text: '',
    title: null,
    type: entry.type,
    url: entry.url,
  };
}

function parseFilesystemTreeRows(candidateRows: readonly unknown[]): {
  readonly diagnostics: readonly unknown[];
  readonly rows: readonly FilesystemTreeNodeRow[];
} {
  return {
    diagnostics: candidateRows.flatMap((candidateRow, index) => (
      isFilesystemTreeNodeRow(candidateRow) ? [] : [`Invalid filesystem tree row at index ${index}.`]
    )),
    rows: candidateRows.filter(isFilesystemTreeNodeRow),
  };
}

function isFilesystemTreeNodeRow(value: unknown): value is FilesystemTreeNodeRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string'
    && typeof value.url === 'string'
    && (value.parentId === null || typeof value.parentId === 'string')
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

function filesystemNodeFromProjectedTree(tree: ProjectedFilesystemTreeRow): FilesystemNode {
  if (tree.kind === 'file') {
    return {
      id: tree.id,
      kind: 'file',
      mediaType: tree.mediaType ?? mimeTypeFromFileName(tree.name),
      name: tree.name,
      sourceUrl: tree.sourceUrl,
      text: tree.text,
      url: tree.url,
    };
  }

  return {
    entries: (tree.entries ?? []).map(filesystemNodeFromProjectedTree),
    id: tree.id,
    kind: 'folder',
    name: tree.name,
    text: tree.text,
    url: tree.url,
  };
}

function projectFilesystemIndexRow(row: FilesystemIndexRow): FilesystemIndexRow {
  return {
    ...(row.content === undefined ? {} : { content: row.content }),
    ...(row.entries === undefined ? {} : { entries: structuredClone(row.entries) }),
    ...(row.mimeType === undefined ? {} : { mimeType: row.mimeType }),
    ...(row.title === undefined ? {} : { title: row.title }),
    type: row.type,
    url: row.url,
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

function treeNodeKind(type: string): FilesystemTreeNodeKind {
  return type === PatchpitType.Folder ? 'folder' : 'file';
}

function isFilesystemTreeNodeKind(value: unknown): value is FilesystemTreeNodeKind {
  return value === 'folder' || value === 'file';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAutomergeUrl(url: string): boolean {
  return url.startsWith('automerge:');
}

function projectTreeRows(
  root: PatchpitFilesystemTreeNode,
  id = '/',
  parentId: string | null = null,
  position = 0,
): readonly FilesystemTreeNodeRow[] {
  const { entries: childNodes = [], ...node } = root;
  const row = {
    ...node,
    id,
    isRoot: parentId === null,
    parentId,
    position,
  };

  return [
    row,
    ...childNodes.flatMap((child, childPosition) =>
      projectTreeRows(child, legacyTreePath(id, child.name), id, childPosition)),
  ];
}

function projectRowsTree(
  rows: readonly FilesystemTreeNodeRow[],
  {
    canHaveChildren,
    rootId,
  }: {
    readonly canHaveChildren: (row: FilesystemTreeNodeRow) => boolean;
    readonly rootId: string;
  },
): { readonly diagnostics: readonly unknown[]; readonly root: ProjectedFilesystemTreeRow | null } {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const root = rowsById.get(rootId);
  if (root === undefined) return { diagnostics: [`Missing filesystem tree root ${rootId}.`], root: null };

  const childRowsByParentId = new Map<string, readonly FilesystemTreeNodeRow[]>(
    rows
      .filter((row) => row.parentId !== null)
      .map((row) => row.parentId as string)
      .map((parentId) => [
        parentId,
        rows
          .filter((row) => row.parentId === parentId)
          .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
      ]),
  );

  return { diagnostics: [], root: projectedTreeRow(root, childRowsByParentId, canHaveChildren) };
}

function projectedTreeRow(
  row: FilesystemTreeNodeRow,
  childRowsByParentId: ReadonlyMap<string, readonly FilesystemTreeNodeRow[]>,
  canHaveChildren: (row: FilesystemTreeNodeRow) => boolean,
): ProjectedFilesystemTreeRow {
  return canHaveChildren(row)
    ? {
        ...row,
        entries: (childRowsByParentId.get(row.id) ?? []).map((child) =>
          projectedTreeRow(child, childRowsByParentId, canHaveChildren)),
      }
    : row;
}

function legacyTreePath(parentId: string, name: string): string {
  return parentId === '/' ? `/${name}` : `${parentId}/${name}`;
}
