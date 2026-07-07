import {
  defineSchema,
  idField,
  nullable,
  numberField,
  optional,
  refField,
  relation,
  stringEnumField,
  stringField,
  toSchemaManifest,
  type RelationRefRow,
} from '@tarstate/core/schema';

export const fsRelations = defineSchema({
  nodes: relation({
    key: 'id',
    fields: {
      id: idField('fsPath'),
      kind: stringEnumField(['folder', 'file'] as const),
      name: stringField(),
      parentId: nullable(refField({ relation: 'nodes', field: 'id' })),
      position: numberField(),
      src: optional(stringField()),
    },
  }),
});

export const fsSchema = toSchemaManifest(fsRelations, {
  schemaId: 'patchpit.fs@draft',
  description: 'Filesystem namespace rows. Resource resolution is intentionally out of scope.',
});

export type FsRow = RelationRefRow<typeof fsRelations.nodes>;
