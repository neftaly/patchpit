import { openFsEntries, type FsAttachment } from '@patchpit/fs';

export type Resource = {
  readonly kind: 'file' | 'folder';
  readonly localId: string;
  readonly name: string;
  readonly order: number;
  readonly parentId: string | null;
  readonly resourceRef: string;
};

export const openResources = (attachment: FsAttachment) => openFsEntries([attachment]);

export const resourceById = (resources: readonly Resource[], localId: string) =>
  resources.find((resource) => resource.localId === localId);

type ResourceSnapshot = ReturnType<ReturnType<typeof openFsEntries>['observer']['getSnapshot']>;

export const resourcesFromSnapshot = (snapshot: ResourceSnapshot): readonly Resource[] => {
  if (snapshot.state === 'closed') return [];
  return snapshot.current.rows.map(({ entryId, kind, name, order, parentId, resourceRef, sourceId }) => {
    if (sourceId === undefined) throw new Error('Filesystem row is missing source provenance');
    return { kind, localId: entryId, name, order, parentId, resourceRef };
  });
};

export const resourceRows = (resources: readonly Resource[]) => {
  const children = new Map<string | null, Resource[]>();
  for (const resource of resources) {
    const siblings = children.get(resource.parentId) ?? [];
    siblings.push(resource);
    children.set(resource.parentId, siblings);
  }
  const rows: { depth: number; resource: Resource }[] = [];
  const visited = new Set<string>();
  const append = (resource: Resource, depth: number) => {
    if (visited.has(resource.localId)) return;
    visited.add(resource.localId);
    rows.push({ depth, resource });
    for (const child of sorted(children.get(resource.localId))) append(child, depth + 1);
  };
  for (const root of sorted(children.get(null))) append(root, 0);
  for (const resource of sorted(resources)) append(resource, 0);
  return rows;
};

const sorted = (resources: readonly Resource[] | undefined) => [...resources ?? []].sort((left, right) =>
  left.order - right.order || left.name.localeCompare(right.name) || left.localId.localeCompare(right.localId));
