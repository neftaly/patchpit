export type Resource = {
  readonly content: string;
  readonly localId: string;
  readonly name: string;
  readonly sourceId: string;
};

export const resources: readonly Resource[] = [
  {
    content: 'Personal notes',
    localId: 'readme',
    name: 'readme.md',
    sourceId: 'personal',
  },
  {
    content: 'Shared notes',
    localId: 'readme',
    name: 'readme.md',
    sourceId: 'shared',
  },
  {
    content: 'Review on Monday',
    localId: 'schedule',
    name: 'schedule.txt',
    sourceId: 'shared',
  },
];

export const resourceId = ({ localId, sourceId }: Resource) =>
  JSON.stringify([sourceId, localId]);

export const resourceById = (id: string) =>
  resources.find((resource) => resourceId(resource) === id);
