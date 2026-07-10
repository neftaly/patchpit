import {
  customField,
  defineSchema,
  nullable,
  numberField,
  optional,
  relation,
  stringEnumField,
  stringField,
  toSchemaManifest,
  type RelationRefRow,
} from '@tarstate/core/schema';

export type FsNodeKey = readonly number[];

const isFsNodeKey = (value: unknown): value is FsNodeKey => {
  if (!Array.isArray(value)) return false;
  return Array.from({ length: value.length }, (_, index) => {
    const segment = value[index];
    return index in value
      && typeof segment === 'number'
      && Number.isInteger(segment)
      && segment >= 0
      && !Object.is(segment, -0);
  }).every(Boolean);
};

const fsNodeKeyField = customField<FsNodeKey>({
  codec: 'patchpit.fs.nodeKey',
  validate: isFsNodeKey,
  stableKey: (key) => JSON.stringify(key),
});

export const fsRelations = defineSchema({
  nodes: relation({
    key: 'key',
    fields: {
      key: fsNodeKeyField,
      kind: stringEnumField(['dir', 'file'] as const),
      name: stringField(),
      parentKey: nullable(fsNodeKeyField),
      position: numberField(),
      src: optional(stringField()),
    },
  }),
});

export const fsSchemaManifest = toSchemaManifest(fsRelations, {
  schemaId: 'patchpit.fs@draft',
  description: 'Filesystem projection rows.',
});

export type FsRow = RelationRefRow<typeof fsRelations.nodes>;
