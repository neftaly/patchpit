import { prepareTypedQuery } from '@tarstate/core/query';
import {
  typedFrom,
  typedLiteral,
  typedSelect,
  typedSourceOf,
  typedUnionAll,
  typedWhereSourcePresent,
} from '@tarstate/core/query/authoring';
import { fileRelation, folderLinksRelation } from '@patchpit/fs';

const QUERY_IDENTITY = {
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:app-contents:1',
  datasetId: 'patchpit:app:contents',
} as const;

const links = typedWhereSourcePresent(typedFrom(folderLinksRelation, 'link'), 'link');
const contentLinksQuery = typedSelect(links, 'sourceLink', ({ link }) => ({
  linkId: link.row.linkId,
  originSourceId: typedSourceOf(link),
  targetSourceId: link.row.resourceRef,
}));
export const contentLinksPlan = await prepareTypedQuery(contentLinksQuery, QUERY_IDENTITY);

const appLinks = typedSelect(links, 'snapshot', ({ link }) => ({
  binaryContent: typedLiteral(null),
  contentKind: typedLiteral(null),
  copyOf: link.row.copyOf,
  icon: link.row.icon,
  linkId: link.row.linkId,
  mimeType: typedLiteral(null),
  name: link.row.name,
  order: link.row.order,
  resourceRef: link.row.resourceRef,
  rowKind: typedLiteral('link'),
  sourceId: typedSourceOf(link),
  textContent: typedLiteral(null),
  typeHint: link.row.typeHint,
}));
const files = typedWhereSourcePresent(typedFrom(fileRelation, 'file'), 'file');
const appContents = typedSelect(files, 'snapshot', ({ file }) => ({
  binaryContent: file.row.binaryContent,
  contentKind: file.row.contentKind,
  copyOf: typedLiteral(null),
  icon: typedLiteral(null),
  linkId: typedLiteral(null),
  mimeType: file.row.mimeType,
  name: typedLiteral(null),
  order: typedLiteral(null),
  resourceRef: typedLiteral(null),
  rowKind: typedLiteral('content'),
  sourceId: typedSourceOf(file),
  textContent: file.row.textContent,
  typeHint: typedLiteral(null),
}));
export const appSnapshotPlan = await prepareTypedQuery(
  typedUnionAll(appLinks, appContents),
  QUERY_IDENTITY,
);
