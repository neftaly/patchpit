import {
  field,
  parameter,
  prepareQuery,
  sourceOf,
  typedFrom,
  typedOrderBy,
  typedPreparedPlan,
  typedSelect,
  typedSourceOf,
  type Expr,
  type QueryNode,
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

const entryField = (name: string) => field('entry', name);
const folderField = (name: string) => field('folder', name);
const equals = (left: Expr, right: Expr): Expr => ({ kind: 'compare', op: 'eq', left, right });
const both = (...args: readonly Expr[]): Expr => ({ kind: 'boolean', op: 'and', args });
const selectEntry = (input: QueryNode): QueryNode => ({
  kind: 'select',
  input,
  alias: 'selected',
  fields: {
    entryId: entryField('entryId'),
    kind: entryField('kind'),
    name: entryField('name'),
    order: entryField('order'),
    parentId: entryField('parentId'),
    resourceRef: entryField('resourceRef'),
    sourceId: sourceOf('entry'),
  },
});
const rootEntry: QueryNode = {
  kind: 'where',
  input: { kind: 'from', relation: fsEntriesRelation, alias: 'entry' },
  predicate: both(
    equals(entryField('entryId'), parameter('rootEntryId')),
    equals(sourceOf('entry'), parameter('rootSourceId')),
    equals(entryField('kind'), { kind: 'literal', value: 'folder' }),
  ),
};
const folders: QueryNode = {
  kind: 'recursive',
  name: 'authorized-folders',
  seed: {
    kind: 'select',
    input: rootEntry,
    alias: 'folder',
    fields: { entryId: entryField('entryId'), sourceId: sourceOf('entry') },
  },
  step: {
    kind: 'select',
    alias: 'folder',
    input: {
      kind: 'where',
      input: {
        kind: 'join',
        join: 'inner',
        left: { kind: 'recursion-ref', name: 'authorized-folders' },
        right: { kind: 'from', relation: fsEntriesRelation, alias: 'entry' },
        on: both(
          equals(folderField('entryId'), entryField('parentId')),
          equals(folderField('sourceId'), sourceOf('entry')),
        ),
      },
      predicate: equals(entryField('kind'), { kind: 'literal', value: 'folder' }),
    },
    fields: { entryId: entryField('entryId'), sourceId: sourceOf('entry') },
  },
  key: [folderField('sourceId'), folderField('entryId')],
};
const descendants = selectEntry({
  kind: 'join',
  join: 'inner',
  left: folders,
  right: { kind: 'from', relation: fsEntriesRelation, alias: 'entry' },
  on: both(
    equals(folderField('entryId'), entryField('parentId')),
    equals(folderField('sourceId'), sourceOf('entry')),
  ),
});
const fsSubtreeQuery: QueryNode = {
  kind: 'order',
  input: { kind: 'set', op: 'union', left: selectEntry(rootEntry), right: descendants },
  by: [
    { value: field('selected', 'sourceId'), direction: 'asc' },
    { value: field('selected', 'entryId'), direction: 'asc' },
  ],
};

export const fsSubtreePlan = await prepareQuery({
  root: fsSubtreeQuery,
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:fs-subtree:1',
  datasetId: 'patchpit:fs:subtree',
});
