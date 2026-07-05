import { automergeMapSource, defineAutomergeMapRelations } from '@tarstate/automerge';
import {
  as,
  asc,
  defineSchema,
  from,
  jsonField,
  maybe,
  optional,
  pipe,
  project,
  relation,
  sort,
  stringField,
} from '@tarstate/core';
import { evaluate } from '@tarstate/core/evaluate';
import { buildFilesystem, type FilesystemNode } from './tree';
import type { FilesystemIndexDoc, FilesystemIndexRow } from './types';

export type ProjectedFilesystem = {
  readonly diagnostics: readonly unknown[];
  readonly root: FilesystemNode | null;
};

const filesystemSchema = defineSchema({
  documents: relation<FilesystemIndexRow>({
    key: 'url',
    fields: {
      url: stringField(),
      type: stringField(),
      entries: optional(jsonField()),
      title: optional(stringField()),
      mimeType: optional(stringField()),
      content: optional(stringField()),
    },
  }),
});

const filesystemRelations = defineAutomergeMapRelations<FilesystemIndexDoc>()([
  { relation: filesystemSchema.documents, path: ['filesystemIndex', 'documents'] },
]);

const doc = as(filesystemSchema.documents, 'doc');
const filesystemEntryQuery = pipe(
  from(doc),
  sort(asc(doc.url)),
  project({
    content: maybe(doc.content),
    entries: maybe(doc.entries),
    mimeType: maybe(doc.mimeType),
    title: maybe(doc.title),
    type: doc.type,
    url: doc.url,
  }),
);

export function projectFilesystem(
  indexDoc: FilesystemIndexDoc,
  rootUrl: string,
): ProjectedFilesystem {
  const result = evaluate(
    automergeMapSource(indexDoc, { relations: filesystemRelations }),
    filesystemEntryQuery,
  );

  return result.diagnostics.length > 0
    ? { diagnostics: result.diagnostics, root: null }
    : {
        diagnostics: [],
        root: buildFilesystem(rootUrl, result.rows as readonly FilesystemIndexRow[]),
      };
}
