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

export type FsPath = readonly string[];
export type FsNodeKey = readonly number[];

const isFsPath = (value: unknown): value is FsPath => {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== 'string') return false;
  }
  return true;
};

const isFsNodeKey = (value: unknown): value is FsNodeKey => {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const segment = value[index];
    if (!Number.isInteger(segment) || segment < 0 || Object.is(segment, -0)) return false;
  }
  return true;
};

const fsPathField = customField<FsPath>({
  codec: 'patchpit.fs.path',
  validate: isFsPath,
});
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
      path: fsPathField,
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
