import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStaticFsDatabaseSource,
  openFsEntriesQuery,
  openFsSubtreeQuery,
} from '@patchpit/fs';

void test('filesystem query keeps stable local IDs scoped by source', async () => {
  const query = await openFsEntriesQuery([
    createStaticFsDatabaseSource({
      sourceId: 'personal',
      entries: [{ entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:personal' }],
    }),
    createStaticFsDatabaseSource({
      sourceId: 'shared',
      entries: [
        { entryId: 'folder', parentId: null, order: 2, kind: 'folder', name: 'archive', resourceRef: 'folder:archive' },
        { entryId: 'schedule', parentId: null, order: 1, kind: 'file', name: 'schedule.txt', resourceRef: 'content:schedule' },
        { entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:shared' },
        { entryId: 'nested', parentId: 'folder', order: 0, kind: 'file', name: 'nested.txt', resourceRef: 'content:nested' },
      ],
    }),
  ]);
  const snapshot = query.getSnapshot();

  assert.equal(snapshot.state, 'open');
  assert.deepEqual(snapshot.current.rows, [
    { entryId: 'readme', kind: 'file', name: 'readme.md', order: 0, parentId: null, resourceRef: 'content:personal', sourceId: 'personal' },
    { entryId: 'folder', kind: 'folder', name: 'archive', order: 2, parentId: null, resourceRef: 'folder:archive', sourceId: 'shared' },
    { entryId: 'nested', kind: 'file', name: 'nested.txt', order: 0, parentId: 'folder', resourceRef: 'content:nested', sourceId: 'shared' },
    { entryId: 'readme', kind: 'file', name: 'readme.md', order: 0, parentId: null, resourceRef: 'content:shared', sourceId: 'shared' },
    { entryId: 'schedule', kind: 'file', name: 'schedule.txt', order: 1, parentId: null, resourceRef: 'content:schedule', sourceId: 'shared' },
  ]);
  assert.equal(new Set(snapshot.current.resultKeys).size, 5);

  query.close();
});

void test('filesystem subtree query is recursive and source-authority scoped', async () => {
  const selected = createStaticFsDatabaseSource({
    sourceId: 'selected',
    entries: [
      { entryId: 'app', parentId: null, order: 0, kind: 'folder', name: 'app', resourceRef: 'folder:app' },
      { entryId: 'index', parentId: 'app', order: 0, kind: 'file', name: 'index.html', resourceRef: 'content:index' },
      { entryId: 'assets', parentId: 'app', order: 1, kind: 'folder', name: 'assets', resourceRef: 'folder:assets' },
      { entryId: 'icon', parentId: 'assets', order: 0, kind: 'file', name: 'icon.svg', resourceRef: 'content:icon' },
      { entryId: 'outside', parentId: null, order: 1, kind: 'file', name: 'outside.txt', resourceRef: 'content:outside' },
    ],
  });
  const query = await openFsSubtreeQuery(selected, 'app');
  const snapshot = query.getSnapshot();

  assert.equal(snapshot.state, 'open');
  assert.equal(snapshot.current.readiness, 'ready');
  assert.equal(snapshot.current.completeness, 'exact');
  assert.deepEqual(snapshot.current.rows.map(({ entryId, sourceId }) => [entryId, sourceId]), [
    ['app', 'selected'],
    ['assets', 'selected'],
    ['icon', 'selected'],
    ['index', 'selected'],
  ]);
  query.close();
});
