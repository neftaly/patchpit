import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFsEntries, type FsEntry } from './schema.ts';

void test('filesystem entry identity survives parent and order changes', () => {
  for (let index = 0; index < 1_000; index += 1) {
    const entry: FsEntry = {
      entryId: `entry:${index}`,
      parentId: index % 2 === 0 ? null : `folder:${index % 17}`,
      order: index % 23,
      kind: 'file',
      name: `${index}.txt`,
      resourceRef: `content:${index}`,
    };
    const [moved] = parseFsEntries([{ ...entry, parentId: 'moved', order: 0 }]);
    assert.equal(moved?.entryId, entry.entryId);
    assert.equal(moved?.resourceRef, entry.resourceRef);
  }
});
