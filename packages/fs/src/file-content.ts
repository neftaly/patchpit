import { builtInCapabilityRefs } from '@tarstate/core';
import {
  relationLiteral,
  schemaLiteral,
  sealSchema,
  type SchemaRow,
} from '@tarstate/core/schema';

const replaceable = { editCapabilities: [builtInCapabilityRefs.fieldReplace] } as const;
const fileMetadataFields = {
  id: { type: { kind: 'string', values: ['file'] } },
  extension: { type: { kind: 'string' } },
  mimeType: { type: { kind: 'string' } },
  name: { type: { kind: 'string' } },
} as const;

const fileSchemaBody = schemaLiteral({
  description: 'One Patchwork-compatible binary or collaborative text file.',
  relations: {
    file: {
      relationId: 'patchpit.file',
      key: ['id', 'contentKind'],
      fields: {
        ...fileMetadataFields,
        contentKind: { type: { kind: 'string', values: ['binary', 'text'] } },
        binaryContent: { type: { kind: 'bytes' }, optional: true, ...replaceable },
        textContent: { type: { kind: 'string' }, optional: true, ...replaceable },
      },
    },
  },
});

export type FileRow = SchemaRow<typeof fileSchemaBody, 'file'>;

export const fileSchemaArtifact = await sealSchema({
  id: 'urn:patchpit:schema:file@1',
  body: fileSchemaBody,
});

export const fileRelation = relationLiteral(fileSchemaArtifact, 'file');
