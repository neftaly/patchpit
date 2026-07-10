import { openFsEntries, staticFsAttachment } from '@patchpit/fs';
import sandboxCompatBundle from 'virtual:patchpit/sandbox-compat-bundle';

export type Resource = {
  readonly kind: 'file' | 'folder';
  readonly localId: string;
  readonly name: string;
  readonly order: number;
  readonly parentId: string | null;
  readonly resourceRef: string;
  readonly sourceId: string;
};

export type ResourceGroup = {
  readonly sourceId: string;
  readonly rows: readonly { readonly depth: number; readonly resource: Resource }[];
};

const contents = new Map(sandboxCompatBundle.entries
  .filter(({ kind }) => kind === 'file')
  .map(({ resourceRef }) => [resourceRef, sandboxCompatBundle.contents[resourceRef] ?? resourceRef] as const));

export const openResources = () => openFsEntries([
  staticFsAttachment({ sourceId: 'sandbox-compat', entries: sandboxCompatBundle.entries }),
]);

export const resourceId = ({ localId, sourceId }: Resource) =>
  JSON.stringify([sourceId, localId]);

export const resourceById = (resources: readonly Resource[], id: string) =>
  resources.find((resource) => resourceId(resource) === id);

export const resourceContent = ({ resourceRef }: Resource) => contents.get(resourceRef);

type ResourceSnapshot = ReturnType<ReturnType<typeof openFsEntries>['observer']['getSnapshot']>;

export const resourcesFromSnapshot = (snapshot: ResourceSnapshot): readonly Resource[] => {
  if (snapshot.state === 'closed') return [];
  return snapshot.current.rows.map(({ entryId, kind, name, order, parentId, resourceRef, sourceId }) => {
    if (sourceId === undefined) throw new Error('Filesystem row is missing source provenance');
    return { kind, localId: entryId, name, order, parentId, resourceRef, sourceId };
  });
};

export const resourceGroups = (resources: readonly Resource[]): readonly ResourceGroup[] =>
  [...new Set(resources.map(({ sourceId }) => sourceId))].sort().map((sourceId) => {
    const sourceResources = resources.filter((resource) => resource.sourceId === sourceId);
    const children = new Map<string | null, Resource[]>();
    for (const resource of sourceResources) {
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
    for (const resource of sorted(sourceResources)) append(resource, 0);
    return { rows, sourceId };
  });

const sorted = (resources: readonly Resource[] | undefined) => [...resources ?? []].sort((left, right) =>
  left.order - right.order || left.name.localeCompare(right.name) || left.localId.localeCompare(right.localId));
