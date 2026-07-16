import {
  openFolderGraphQuery,
  type FolderDatabaseSource,
  type FolderLinkRow,
} from '@patchpit/fs';
import type { OpenLinkedDatabaseSource } from '@tarstate/core/database/session';

export const openResourceQuery = (options: {
  readonly root: FolderDatabaseSource;
  readonly openSource: OpenLinkedDatabaseSource;
}) => openFolderGraphQuery(options);

export const resourceIdentity = ({ linkId, sourceId }: Pick<FolderLinkRow, 'linkId' | 'sourceId'>) =>
  JSON.stringify([sourceId, linkId]);

export type ResourceProjection = {
  readonly rows: readonly ResourceTreeRow[];
  readonly byIdentity: ReadonlyMap<string, FolderLinkRow>;
  readonly byResourceRef: ReadonlyMap<string, FolderLinkRow>;
  readonly launchableFolders: ReadonlySet<string>;
};

type ResourceTreeRow = {
  readonly depth: number;
  readonly resource: FolderLinkRow;
};

type ResourceSnapshot = ReturnType<Awaited<ReturnType<typeof openResourceQuery>>['getSnapshot']>;

export const resourceRowsFromQuerySnapshot = (snapshot: ResourceSnapshot): readonly FolderLinkRow[] =>
  snapshot.state === 'closed' ? [] : snapshot.current.rows;

export const projectResourceTree = (
  resources: readonly FolderLinkRow[],
  rootSourceId?: string,
): ResourceProjection => {
  const byIdentity = new Map(resources.map((resource) => [resourceIdentity(resource), resource]));
  const byResourceRef = new Map<string, FolderLinkRow>();
  resources.forEach((resource) => {
    if (!byResourceRef.has(resource.resourceRef)) byResourceRef.set(resource.resourceRef, resource);
  });
  const byFolder = resources.reduce((folders, resource) => {
    folders.set(resource.sourceId, [...folders.get(resource.sourceId) ?? [], resource]);
    return folders;
  }, new Map<string, FolderLinkRow[]>());
  const rows: ResourceTreeRow[] = [];
  const expandedFolders = new Set<string>();
  const appendFolder = (sourceId: string, depth: number) => {
    if (expandedFolders.has(sourceId)) return;
    expandedFolders.add(sourceId);
    sorted(byFolder.get(sourceId)).forEach((resource) => {
      rows.push({ depth, resource });
      if (resource.typeHint === 'folder') appendFolder(resource.resourceRef, depth + 1);
    });
  };
  if (rootSourceId !== undefined) appendFolder(rootSourceId, 0);
  [...byFolder.keys()].sort().forEach((sourceId) => appendFolder(sourceId, 0));
  const launchableFolders = new Set(resources.flatMap(({ name, sourceId, typeHint }) =>
    name === 'index.html' && typeHint !== 'folder' ? [sourceId] : []));
  return { rows, byIdentity, byResourceRef, launchableFolders };
};

const sorted = (resources: readonly FolderLinkRow[] | undefined) => [...resources ?? []].sort((left, right) =>
  (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
  || left.name.localeCompare(right.name) || left.linkId.localeCompare(right.linkId));
