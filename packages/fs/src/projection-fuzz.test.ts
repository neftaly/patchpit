import assert from 'node:assert/strict';
import test from 'node:test';
import { fsRowsFromTree } from './projection.ts';
import type { FsTree } from './tree.ts';

void test('filesystem row projection behavior fuzzes tree depth', () => {
  for (const depth of [0, 1, 8, 64, 512, 1_500]) {
    const rows = fsRowsFromTree(treeAtDepth(depth));
    assert.equal(rows.length, depth + 1);

    for (const [index, row] of rows.entries()) {
      assert.equal(row.key.length, index);
      assert.deepEqual(row.parentKey, index === 0 ? null : row.key.slice(0, -1));
      assert.equal(row.name, index === 0 ? '' : String(index - 1));
      assert.equal(row.position, 0);
    }

    assert.equal(rows.at(-1)?.kind, 'file');
    assert.equal(rows.at(-1)?.src, 'automerge:leaf');
  }
});

const treeAtDepth = (depth: number): FsTree => {
  let tree: FsTree = { kind: 'file', src: 'automerge:leaf' };
  for (let index = depth - 1; index >= 0; index -= 1) {
    tree = { entries: [[String(index), tree]], kind: 'dir' };
  }
  return tree;
};
