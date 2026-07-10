import { automergeFsPackageFromFiles, openAutomergeFsFolder } from '@patchpit/automerge-fs';
import { openFsEntries, staticFsAttachment } from '@patchpit/fs';

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

const shared = automergeFsPackageFromFiles([
  {
    bytes: new TextEncoder().encode('Shared notes'),
    entryId: 'readme',
    name: 'readme.md',
    order: 0,
    parentId: null,
    resourceRef: 'content:shared-readme',
  },
  {
    bytes: new TextEncoder().encode('Review on Monday'),
    entryId: 'schedule',
    name: 'schedule.txt',
    order: 1,
    parentId: null,
    resourceRef: 'content:shared-schedule',
  },
]);
const contents = new Map([
  ['content:personal-readme', 'Personal notes'],
  ['content:personal-project-notes', 'Project notes'],
  ...shared.files.map(([resourceRef, { bytes }]) =>
    [resourceRef, new TextDecoder().decode(bytes)] as const),
]);

export const openResources = () => {
  const sharedFolder = openAutomergeFsFolder('shared', shared.folder);
  return openFsEntries([
    staticFsAttachment({
      sourceId: 'personal',
      entries: [
        { entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:personal-readme' },
        { entryId: 'projects', parentId: null, order: 1, kind: 'folder', name: 'projects', resourceRef: 'folder:personal-projects' },
        { entryId: 'project-notes', parentId: 'projects', order: 0, kind: 'file', name: 'notes.md', resourceRef: 'content:personal-project-notes' },
      ],
    }),
    sharedFolder.attachment,
  ]);
};

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
