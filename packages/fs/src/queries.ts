import {
  prepareQuery,
  typedFrom,
  typedOrderBy,
  typedPreparedPlan,
  typedSelect,
  typedSourceOf,
} from '@tarstate/core';
import { fsEntriesRelation } from './schema.ts';

const entries = typedFrom(fsEntriesRelation, 'entry');
const orderedEntries = typedOrderBy(entries, ({ entry }) => [
  { value: typedSourceOf(entry), direction: 'asc' },
  { value: entry.row.entryId, direction: 'asc' },
]);

export const fsEntriesQuery = typedSelect(orderedEntries, 'entry', ({ entry }) => ({
  entryId: entry.row.entryId,
  kind: entry.row.kind,
  name: entry.row.name,
  order: entry.row.order,
  parentId: entry.row.parentId,
  resourceRef: entry.row.resourceRef,
  sourceId: typedSourceOf(entry),
}));

export const fsEntriesPlan = typedPreparedPlan(await prepareQuery({
  root: fsEntriesQuery.root,
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:public:1',
  datasetId: 'patchpit:fs:entries',
}), fsEntriesQuery);
