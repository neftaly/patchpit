import { TarstateParseError, type ParseResult } from '@tarstate/core';
import {
  parseRelationCandidate,
  prepareSchema,
  type CandidateContext,
} from '@tarstate/core/schema';
import {
  folderLinksRelation,
  folderRelation,
  folderSchemaArtifact,
  type Folder,
  type FolderLink,
} from '@patchpit/artifacts';

export {
  folderLinksRelation,
  folderRelation,
  folderSchemaArtifact,
  type Folder,
  type FolderLink,
};

const prepared = prepareSchema(folderSchemaArtifact.body);
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
