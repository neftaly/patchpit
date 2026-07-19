import { prepareTypedQuery } from '@tarstate/core/query';
import {
  typedCompare,
  typedFrom,
  typedLiteral,
  typedOrderBy,
  typedSelect,
  typedSourceOf,
  typedWhere,
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
  copyOf: link.row.copyOf,
  icon: link.row.icon,
  linkId: link.row.linkId,
  name: link.row.name,
  order: link.row.order,
  resourceRef: link.row.resourceRef,
  sourceId: typedSourceOf(link),
  typeHint: link.row.typeHint,
}));

export const folderLinksPlan = await prepareTypedQuery(folderLinksQuery, QUERY_IDENTITY);

const nestedFolderLinks = typedWhere(folderLinks, ({ link }) =>
  typedCompare('eq', link.row.typeHint, typedLiteral('folder')));
const nestedFolderSourceLinks = typedSelect(nestedFolderLinks, 'sourceLink', ({ link }) => ({
  linkId: link.row.linkId,
  originSourceId: typedSourceOf(link),
  targetSourceId: link.row.resourceRef,
}));
const orderedNestedFolderSourceLinks = typedOrderBy(
  nestedFolderSourceLinks,
  ({ sourceLink }) => [{ value: sourceLink.row.linkId, direction: 'asc' }],
);
export const nestedFolderSourceLinksPlan = await prepareTypedQuery(
  orderedNestedFolderSourceLinks,
  QUERY_IDENTITY,
);

const folders = typedFrom(folderRelation, 'folder');
const folderDocumentTitle = typedSelect(folders, 'title', ({ folder }) => ({
  resourceRef: typedSourceOf(folder),
  title: folder.row.title,
}));

export const folderDocumentTitlePlan = await prepareTypedQuery(folderDocumentTitle, QUERY_IDENTITY);

const files = typedFrom(fileRelation, 'file');
const fileDocumentTitle = typedSelect(files, 'title', ({ file }) => ({
  resourceRef: typedSourceOf(file),
  title: file.row.name,
}));

export const fileDocumentTitlePlan = await prepareTypedQuery(fileDocumentTitle, QUERY_IDENTITY);
