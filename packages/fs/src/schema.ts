import { TarstateParseError, type ParseResult } from '@tarstate/core';
import {
  parseRelationCandidate,
  prepareSchema,
  relationLiteral,
  schemaLiteral,
  sealSchema,
  type CandidateContext,
  type SchemaRow,
} from '@tarstate/core/schema';

const folderSchemaBody = schemaLiteral({
  description: 'One document-centric folder and its ordered resource links.',
  relations: {
    folder: {
      relationId: 'patchpit.folder',
      key: ['id'],
      fields: {
        id: { type: { kind: 'string', values: ['folder'] } },
        title: { type: { kind: 'string' } },
      },
    },
    links: {
      relationId: 'patchpit.folder.link',
      key: ['linkId'],
      fields: {
        linkId: { type: { kind: 'string' } },
        order: { type: { kind: 'integer' }, optional: true },
        name: { type: { kind: 'string' } },
        typeHint: { type: { kind: 'string' } },
        resourceRef: { type: { kind: 'string' } },
        icon: { type: { kind: 'string' }, optional: true },
        copyOf: { type: { kind: 'string' }, optional: true },
      },
    },
  },
});

export type Folder = SchemaRow<typeof folderSchemaBody, 'folder'>;
export type FolderLink = SchemaRow<typeof folderSchemaBody, 'links'>;

export const folderSchemaArtifact = await sealSchema({
  id: 'urn:patchpit:schema:folder@1',
  body: folderSchemaBody,
});

export const folderRelation = relationLiteral(folderSchemaArtifact, 'folder');
export const folderLinksRelation = relationLiteral(folderSchemaArtifact, 'links');

const prepared = prepareSchema(folderSchemaBody);
if (!prepared.success) throw new TarstateParseError(prepared.issues);

export const parseFolderLink = (candidate: unknown): FolderLink => {
  const result = safeParseFolderLink(candidate);
  if (!result.success) throw new TarstateParseError(result.issues);
  return result.value;
};

export const safeParseFolderLink = (
  candidate: unknown,
  context?: CandidateContext,
): ParseResult<FolderLink> => {
  const result = parseRelationCandidate(
    prepared.value,
    folderLinksRelation.relationId,
    candidate,
    undefined,
    context,
  );
  return result.success
    ? { success: true, value: result.value.row as FolderLink, issues: result.issues }
    : result;
};
