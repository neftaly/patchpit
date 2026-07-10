import { automergeFsPackageFromFiles, openAutomergeFsFolder } from '@patchpit/automerge-fs';
import { openRootFiles, staticFsAttachment } from '@patchpit/fs';

export type Resource = {
  readonly localId: string;
  readonly name: string;
  readonly resourceRef: string;
  readonly sourceId: string;
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
  ...shared.files.map(([resourceRef, { bytes }]) =>
    [resourceRef, new TextDecoder().decode(bytes)] as const),
]);

export const openResources = () => {
  const sharedFolder = openAutomergeFsFolder('shared', shared.folder);
  return openRootFiles([
    staticFsAttachment({
      sourceId: 'personal',
      entries: [
        { entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:personal-readme' },
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

type ResourceSnapshot = ReturnType<ReturnType<typeof openRootFiles>['observer']['getSnapshot']>;

export const resourcesFromSnapshot = (snapshot: ResourceSnapshot): readonly Resource[] => {
  if (snapshot.state === 'closed') return [];
  return snapshot.current.rows.map(({ entryId, name, resourceRef, sourceId }) => {
    if (sourceId === undefined) throw new Error('Filesystem row is missing source provenance');
    return { localId: entryId, name, resourceRef, sourceId };
  });
};
