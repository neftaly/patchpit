import {
  parseRelationCandidate,
  prepareSchema,
  relationLiteral,
  schemaLiteral,
  sealSchema,
  TarstateParseError,
  type CandidateContext,
  type ParseResult,
  type SchemaRow,
} from '@tarstate/core';

export const fsSchemaBody = schemaLiteral({
  relations: {
    entries: {
      relationId: 'patchpit.fs.entry',
      key: ['entryId'],
      fields: {
        entryId: { type: { kind: 'string' } },
        parentId: { type: { kind: 'string' }, nullable: true },
        order: { type: { kind: 'integer' } },
        kind: { type: { kind: 'string', values: ['folder', 'file'] } },
        name: { type: { kind: 'string' } },
        resourceRef: { type: { kind: 'string' } },
      },
    },
  },
});

export type FsEntry = SchemaRow<typeof fsSchemaBody, 'entries'>;

export const fsSchemaArtifact = await sealSchema({
  id: 'urn:patchpit:schema:fs-entry@1',
  body: fsSchemaBody,
});

export const fsEntriesRelation = relationLiteral(
  fsSchemaArtifact,
  'entries',
);

const prepared = prepareSchema(fsSchemaBody);
if (!prepared.success) throw new TarstateParseError(prepared.issues);

export const parseFsEntries = (entries: readonly unknown[]): readonly FsEntry[] =>
  entries.map((entry, index) => {
    const result = safeParseFsEntry(entry, { path: [index] });
    if (!result.success) throw new TarstateParseError(result.issues);
    return result.value;
  });

export const parseFsEntry = (entry: unknown): FsEntry => parseFsEntries([entry])[0]!;

export const safeParseFsEntry = (
  entry: unknown,
  context?: CandidateContext,
): ParseResult<FsEntry> => {
  const result = parseRelationCandidate(
    prepared.value,
    fsEntriesRelation.relationId,
    entry,
    undefined,
    context,
  );
  return result.success
    ? { success: true, value: result.value.row as FsEntry, issues: result.issues }
    : result;
};
