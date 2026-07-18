import { prepareQuery, prepareTypedQuery } from '@tarstate/core/query';
import {
  compare,
  field,
  from,
  literal,
  orderBy,
  pipe,
  select,
  sourceOf,
  typedFrom,
  typedSelect,
  typedSourceOf,
  where,
} from '@tarstate/core/query/authoring';
import { fileRelation } from '@patchpit/artifacts';
import { folderLinksRelation, folderRelation } from './schema.ts';

const QUERY_IDENTITY = {
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:folder-graph:1',
  datasetId: 'patchpit:folder-graph',
} as const;

const folderLinks = typedFrom(folderLinksRelation, 'link');
const folderLinksQuery = typedSelect(folderLinks, 'result', ({ link }) => ({
  copyOf: link.row.copyOf!,
  icon: link.row.icon!,
  linkId: link.row.linkId,
  name: link.row.name,
  order: link.row.order!,
  resourceRef: link.row.resourceRef,
  sourceId: typedSourceOf(link),
  typeHint: link.row.typeHint,
}));

export const folderLinksPlan = await prepareTypedQuery(folderLinksQuery, QUERY_IDENTITY);

const portableLinksRelation = {
  relationId: folderLinksRelation.relationId,
  schemaView: folderLinksRelation.schemaView,
};

// typedSourceOf is optional, while Tarstate's source-link plan requires a
// definite origin. Keep this plan portable until typed presence refinement exists.
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

const folders = typedFrom(folderRelation, 'folder');
const folderDocumentTitle = typedSelect(folders, 'title', ({ folder }) => ({
  title: folder.row.title,
}));

export const folderDocumentTitlePlan = await prepareTypedQuery(folderDocumentTitle, QUERY_IDENTITY);

const files = typedFrom(fileRelation, 'file');
const fileDocumentTitle = typedSelect(files, 'title', ({ file }) => ({
  title: file.row.name,
}));

export const fileDocumentTitlePlan = await prepareTypedQuery(fileDocumentTitle, QUERY_IDENTITY);
