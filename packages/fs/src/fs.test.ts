import assert from 'node:assert/strict';
import test from 'node:test';
import { openRootFiles, staticFsAttachment } from './database.ts';

void test('filesystem query keeps stable local IDs scoped by source', () => {
  const runtime = openRootFiles([
    staticFsAttachment({
      sourceId: 'personal',
      entries: [{ entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:personal' }],
    }),
    staticFsAttachment({
      sourceId: 'shared',
      entries: [
        { entryId: 'schedule', parentId: null, order: 1, kind: 'file', name: 'schedule.txt', resourceRef: 'content:schedule' },
        { entryId: 'readme', parentId: null, order: 0, kind: 'file', name: 'readme.md', resourceRef: 'content:shared' },
        { entryId: 'nested', parentId: 'folder', order: 0, kind: 'file', name: 'nested.txt', resourceRef: 'content:nested' },
      ],
    }),
  ]);
  const snapshot = runtime.observer.getSnapshot();

  assert.equal(snapshot.state, 'open');
  assert.deepEqual(snapshot.current.rows, [
    { entryId: 'readme', name: 'readme.md', resourceRef: 'content:personal', sourceId: 'personal' },
    { entryId: 'readme', name: 'readme.md', resourceRef: 'content:shared', sourceId: 'shared' },
    { entryId: 'schedule', name: 'schedule.txt', resourceRef: 'content:schedule', sourceId: 'shared' },
  ]);
  assert.equal(new Set(snapshot.current.resultKeys).size, 3);

  runtime.close();
});
