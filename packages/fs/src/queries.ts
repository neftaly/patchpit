import {
  prepareQuery,
  typedAnd,
  typedCompare,
  typedFrom,
  typedIsNull,
  typedLiteral,
  typedOrderBy,
  typedPreparedPlan,
  typedSelect,
  typedSourceOf,
  typedWhere,
} from '@tarstate/core';
import { fsEntriesRelation } from './schema.ts';

const entries = typedFrom(fsEntriesRelation, 'entry');
const rootFiles = typedWhere(entries, ({ entry }) => typedAnd(
  typedIsNull(entry.row.parentId),
  typedCompare('eq', entry.row.kind, typedLiteral('file')),
));
const orderedFiles = typedOrderBy(rootFiles, ({ entry }) => [
  { value: entry.row.order, direction: 'asc' },
  { value: typedSourceOf(entry), direction: 'asc' },
  { value: entry.row.name, direction: 'asc' },
]);

export const fsRootFilesQuery = typedSelect(orderedFiles, 'file', ({ entry }) => ({
  entryId: entry.row.entryId,
  name: entry.row.name,
  resourceRef: entry.row.resourceRef,
  sourceId: typedSourceOf(entry),
}));

export const fsRootFilesPlan = typedPreparedPlan(await prepareQuery({
  root: fsRootFilesQuery.root,
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:public:1',
  datasetId: 'patchpit:fs:root',
}), fsRootFilesQuery);
