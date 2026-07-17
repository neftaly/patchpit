import { prepareQuery } from '@tarstate/core/query';
import {
  compare,
  field,
  from,
  literal,
  orderBy,
  pipe,
  select,
  sourceOf,
  where,
} from '@tarstate/core/query/authoring';
import { fileRelation } from './file-content.ts';
import { folderLinksRelation, folderRelation } from './schema.ts';

const QUERY_IDENTITY = {
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:folder-graph:1',
  datasetId: 'patchpit:folder-graph',
} as const;

const portableLinksRelation = {
  relationId: folderLinksRelation.relationId,
  schemaView: folderLinksRelation.schemaView,
};
const folderLinksQuery = pipe(
  from(portableLinksRelation, 'link'),
  select('result', {
    copyOf: field('link', 'copyOf'),
    icon: field('link', 'icon'),
    linkId: field('link', 'linkId'),
    name: field('link', 'name'),
    order: field('link', 'order'),
    resourceRef: field('link', 'resourceRef'),
    sourceId: sourceOf('link'),
    typeHint: field('link', 'typeHint'),
  }),
);

export const folderLinksPlan = await prepareQuery({ root: folderLinksQuery, ...QUERY_IDENTITY });

export const nestedFolderSourceLinksPlan = await prepareQuery({
  root: pipe(
    from(portableLinksRelation, 'link'),
    where(compare('eq', field('link', 'typeHint'), literal('folder'))),
    select('sourceLink', {
      linkId: field('link', 'linkId'),
      originSourceId: sourceOf('link'),
      targetSourceId: field('link', 'resourceRef'),
    }),
    orderBy([{ value: field('sourceLink', 'linkId'), direction: 'asc' }]),
  ),
  ...QUERY_IDENTITY,
});

export const folderDocumentTitlePlan = await prepareQuery({
  root: pipe(
    from(folderRelation, 'folder'),
    select('title', { title: field('folder', 'title') }),
  ),
  ...QUERY_IDENTITY,
});

export const fileDocumentTitlePlan = await prepareQuery({
  root: pipe(
    from(fileRelation, 'file'),
    select('title', { title: field('file', 'name') }),
  ),
  ...QUERY_IDENTITY,
});
