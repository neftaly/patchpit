import assert from 'node:assert/strict';
import test from 'node:test';
import { openFsEntries, staticFsAttachment } from './database.ts';

void test('filesystem query keeps stable local IDs scoped by source', () => {
  const runtime = openFsEntries([
    staticFsAttachment({
      sourceId: 'personal',
      entries: [{ entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:personal' }],
    }),
    staticFsAttachment({
      sourceId: 'shared',
      entries: [
        { entryId: 'folder', parentId: null, order: 2, kind: 'folder', name: 'archive', resourceRef: 'folder:archive' },
        { entryId: 'schedule', parentId: null, order: 1, kind: 'file', name: 'schedule.txt', resourceRef: 'content:schedule' },
        { entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:shared' },
        { entryId: 'nested', parentId: 'folder', order: 0, kind: 'file', name: 'nested.txt', resourceRef: 'content:nested' },
      ],
    }),
  ]);
  const snapshot = runtime.observer.getSnapshot();

  assert.equal(snapshot.state, 'open');
  assert.deepEqual(snapshot.current.rows, [
    { entryId: 'readme', kind: 'file', name: 'readme.md', order: 0, parentId: null, resourceRef: 'content:personal', sourceId: 'personal' },
    { entryId: 'folder', kind: 'folder', name: 'archive', order: 2, parentId: null, resourceRef: 'folder:archive', sourceId: 'shared' },
    { entryId: 'nested', kind: 'file', name: 'nested.txt', order: 0, parentId: 'folder', resourceRef: 'content:nested', sourceId: 'shared' },
    { entryId: 'readme', kind: 'file', name: 'readme.md', order: 0, parentId: null, resourceRef: 'content:shared', sourceId: 'shared' },
    { entryId: 'schedule', kind: 'file', name: 'schedule.txt', order: 1, parentId: null, resourceRef: 'content:schedule', sourceId: 'shared' },
  ]);
  assert.equal(new Set(snapshot.current.resultKeys).size, 5);

  runtime.close();
});
