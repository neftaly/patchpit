import {
  prepareQuery,
  type Expr,
  type QueryNode,
} from '@tarstate/core/query';
import {
  and,
  compare,
  field,
  from,
  join,
  literal,
  orderBy,
  parameter,
  pipe,
  prepareTypedQuery,
  select,
  sourceOf,
  typedFrom,
  typedOrderBy,
  typedSelect,
  typedSourceOf,
  union,
  where,
} from '@tarstate/core/query/authoring';
import { fsEntriesRelation } from './schema.ts';

const entries = typedFrom(fsEntriesRelation, 'entry');
const portableEntriesRelation = {
  relationId: fsEntriesRelation.relationId,
  schemaView: fsEntriesRelation.schemaView,
};
const orderedEntries = typedOrderBy(entries, ({ entry }) => [
  { value: typedSourceOf(entry), direction: 'asc' },
  { value: entry.row.entryId, direction: 'asc' },
]);

const fsEntriesQuery = typedSelect(orderedEntries, 'entry', ({ entry }) => ({
  entryId: entry.row.entryId,
  kind: entry.row.kind,
  name: entry.row.name,
  order: entry.row.order,
  parentId: entry.row.parentId,
  resourceRef: entry.row.resourceRef,
  sourceId: typedSourceOf(entry),
}));

export const fsEntriesPlan = await prepareTypedQuery(fsEntriesQuery, {
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:public:1',
  datasetId: 'patchpit:fs:entries',
});

const entryField = (name: string) => field('entry', name);
const folderField = (name: string) => field('folder', name);
const equals = (left: Expr, right: Expr) => compare('eq', left, right);
const selectEntry = (input: QueryNode): QueryNode => pipe(input, select('selected', {
    entryId: entryField('entryId'),
    kind: entryField('kind'),
    name: entryField('name'),
    order: entryField('order'),
    parentId: entryField('parentId'),
    resourceRef: entryField('resourceRef'),
    sourceId: sourceOf('entry'),
  }));
const rootEntry = pipe(
  from(portableEntriesRelation, 'entry'),
  where(and(
    equals(entryField('entryId'), parameter('rootEntryId')),
    equals(entryField('kind'), literal('folder')),
  )),
);
const folders: QueryNode = {
  kind: 'recursive',
  name: 'authorized-folders',
  seed: pipe(rootEntry, select('folder', {
    entryId: entryField('entryId'), sourceId: sourceOf('entry'),
  })),
  step: pipe(
    { kind: 'recursion-ref', name: 'authorized-folders' },
    join(from(portableEntriesRelation, 'entry'), 'inner', and(
      equals(folderField('entryId'), entryField('parentId')),
      equals(folderField('sourceId'), sourceOf('entry')),
    )),
    where(equals(entryField('kind'), literal('folder'))),
    select('folder', { entryId: entryField('entryId'), sourceId: sourceOf('entry') }),
  ),
  key: [folderField('sourceId'), folderField('entryId')],
};
const descendants = selectEntry(pipe(
  folders,
  join(from(portableEntriesRelation, 'entry'), 'inner', and(
    equals(folderField('entryId'), entryField('parentId')),
    equals(folderField('sourceId'), sourceOf('entry')),
  )),
));
export const fsSubtreeQuery = pipe(
  selectEntry(rootEntry),
  union(descendants),
  orderBy([
    { value: field('selected', 'sourceId'), direction: 'asc' },
    { value: field('selected', 'entryId'), direction: 'asc' },
  ]),
);

export const fsSubtreePlan = await prepareQuery({
  root: fsSubtreeQuery,
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:fs-subtree:1',
  datasetId: 'patchpit:fs:subtree',
});
