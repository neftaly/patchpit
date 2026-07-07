import {
  defineSchema,
  jsonField,
  nullable,
  numberField,
  optional,
  relation,
  stringEnumField,
  stringField,
  toSchemaManifest,
  type FieldSpec,
  type RelationRefRow,
} from '@tarstate/core/schema';

export type FsPath = readonly string[];
export type FsNodeKey = readonly number[];

const fsPathField = jsonField() as FieldSpec<FsPath>;
const fsNodeKeyField = jsonField() as FieldSpec<FsNodeKey>;

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
