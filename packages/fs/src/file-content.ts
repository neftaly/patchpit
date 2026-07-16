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
export type BinaryFileContent = {
  readonly kind: 'tarstate.value';
  readonly type: 'bytes';
  readonly value: string;
};

export const fileSchemaArtifact = await sealSchema({
  id: 'urn:patchpit:schema:file@1',
  body: fileSchemaBody,
});

export const fileRelation = relationLiteral(fileSchemaArtifact, 'file');

export const decodeBinaryFileContent = (
  input: BinaryFileContent,
): Uint8Array<ArrayBuffer> | undefined => {
  try {
    const padded = input.value.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(input.value.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
};
