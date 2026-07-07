import {
  defineSchema,
  idField,
  jsonField,
  nullable,
  numberField,
  optional,
  refField,
  relation,
  stringEnumField,
  stringField,
  toSchemaManifest,
  type FieldSpec,
  type RelationRefRow,
} from '@tarstate/core/schema';

export type FsPath = readonly string[];

const fsPathField = jsonField() as FieldSpec<FsPath>;

export const fsRelations = defineSchema({
  nodes: relation({
    key: 'id',
    fields: {
      id: idField('fsNodeAddress'),
      kind: stringEnumField(['dir', 'file'] as const),
      name: stringField(),
      path: fsPathField,
      parentId: nullable(refField({ relation: 'nodes', field: 'id' })),
      position: numberField(),
      src: optional(stringField()),
    },
  }),
});

export const fsSchema = toSchemaManifest(fsRelations, {
  schemaId: 'patchpit.fs@draft',
  description: 'Filesystem projection rows. Resource resolution is intentionally out of scope.',
});

export type FsRow = RelationRefRow<typeof fsRelations.nodes>;
