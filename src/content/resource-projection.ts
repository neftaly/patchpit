import { openFsEntriesQuery, type FsDatabaseSource, type FsEntryRow } from '@patchpit/fs';

export const openResourceQuery = (source: FsDatabaseSource) => openFsEntriesQuery([source]);

export const resourceIdentity = ({ entryId, sourceId }: Pick<FsEntryRow, 'entryId' | 'sourceId'>) =>
  JSON.stringify([sourceId, entryId]);

export type ResourceProjection = {
  readonly rows: readonly ResourceTreeRow[];
  readonly byIdentity: ReadonlyMap<string, FsEntryRow>;
  readonly byEntryId: ReadonlyMap<string, FsEntryRow>;
  readonly launchableFolders: ReadonlySet<string>;
};

type ResourceTreeRow = {
  readonly depth: number;
  readonly resource: FsEntryRow;
};

export const findResource = (resources: ResourceProjection, sourceId: string, entryId: string) =>
  resources.byIdentity.get(resourceIdentity({ sourceId, entryId }));

type ResourceSnapshot = ReturnType<Awaited<ReturnType<typeof openFsEntriesQuery>>['getSnapshot']>;

export const resourceRowsFromQuerySnapshot = (snapshot: ResourceSnapshot): readonly FsEntryRow[] => {
  if (snapshot.state === 'closed') return [];
  return snapshot.current.rows.map((row) => {
    if (row.sourceId === undefined) throw new Error('Filesystem row is missing source provenance');
    return { ...row, sourceId: row.sourceId };
  });
};

export const projectResourceTree = (resources: readonly FsEntryRow[]): ResourceProjection => {
  const byIdentity = new Map<string, FsEntryRow>();
  const byEntryId = new Map<string, FsEntryRow>();
  const children = new Map<string, FsEntryRow[]>();
  for (const resource of resources) {
    const identity = resourceIdentity(resource);
    byIdentity.set(identity, resource);
    if (!byEntryId.has(resource.entryId)) byEntryId.set(resource.entryId, resource);
    const parent = hierarchyKey(resource.sourceId, resource.parentId);
    const siblings = children.get(parent) ?? [];
    siblings.push(resource);
    children.set(parent, siblings);
  }
  const rows: ResourceTreeRow[] = [];
  const visited = new Set<string>();
  const append = (resource: FsEntryRow, depth: number) => {
    const identity = resourceIdentity(resource);
    if (visited.has(identity)) return;
    visited.add(identity);
    rows.push({ depth, resource });
    for (const child of sorted(children.get(hierarchyKey(resource.sourceId, resource.entryId)))) append(child, depth + 1);
  };
  for (const sourceId of [...new Set(resources.map(({ sourceId }) => sourceId))].sort()) {
    for (const root of sorted(children.get(hierarchyKey(sourceId, null)))) append(root, 0);
  }
  for (const resource of sorted(resources.filter((entry) => !visited.has(resourceIdentity(entry))))) append(resource, 0);
  const launchableFolders = new Set(resources.flatMap((resource) =>
    resource.kind === 'file' && resource.name === 'index.html' && resource.parentId !== null
      ? [resourceIdentity({ sourceId: resource.sourceId, entryId: resource.parentId })]
      : []));
  return { rows, byIdentity, byEntryId, launchableFolders };
};

const sorted = (resources: readonly FsEntryRow[] | undefined) => [...resources ?? []].sort((left, right) =>
  left.sourceId.localeCompare(right.sourceId) || left.order - right.order
  || left.name.localeCompare(right.name) || left.entryId.localeCompare(right.entryId));

const hierarchyKey = (sourceId: string, entryId: string | null) => JSON.stringify([sourceId, entryId]);
