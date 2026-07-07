import assert from 'node:assert/strict';
import test from 'node:test';
import { createDb, q } from '@tarstate/core/db';
import { fsChildrenOfKey, fsNodeByKey, fsRowsFromTree } from './index.ts';

void test('filesystem tree rows use structural keys and keep src as data', () => {
  const src = 'https://example.test/tiger.svg';
  const rows = fsRowsFromTree({
    entries: [
      ['nested', { entries: [['tiger.svg', { kind: 'file', src }]], kind: 'dir' }],
      ['tiger.svg', { kind: 'file', src }],
    ],
    kind: 'dir',
  });

  assert.deepEqual(rows.filter((row) => row.src === src), [
    { key: [0, 0], kind: 'file', name: 'tiger.svg', parentKey: [0], path: ['nested', 'tiger.svg'], position: 0, src },
    { key: [1], kind: 'file', name: 'tiger.svg', parentKey: [], path: ['tiger.svg'], position: 1, src },
  ]);
});

void test('filesystem tree rows pass src through unchanged', () => {
  assert.deepEqual(fsRowsFromTree({
    entries: [
      ['empty-src.txt', { kind: 'file', src: '' }],
      ['not-url.txt', { kind: 'file', src: 'not-a-url' }],
    ],
    kind: 'dir',
  }), [
    { key: [], kind: 'dir', name: '', parentKey: null, path: [], position: 0 },
    { key: [0], kind: 'file', name: 'empty-src.txt', parentKey: [], path: ['empty-src.txt'], position: 0, src: '' },
    { key: [1], kind: 'file', name: 'not-url.txt', parentKey: [], path: ['not-url.txt'], position: 1, src: 'not-a-url' },
  ]);
});

void test('filesystem tree rows keep path segments unencoded', () => {
  const rows = fsRowsFromTree({
    entries: [
      ['a/b', { kind: 'file', src: 'automerge:slash' }],
      ['a', { entries: [['b', { kind: 'file', src: 'automerge:nested' }]], kind: 'dir' }],
      ['', { kind: 'file', src: 'automerge:empty' }],
      ['', { kind: 'file', src: 'automerge:empty-duplicate' }],
    ],
    kind: 'dir',
  });

  assert.deepEqual(rows.map((row) => [row.key, row.path]), [
    [[], []],
    [[0], ['a/b']],
    [[1], ['a']],
    [[1, 0], ['a', 'b']],
    [[2], ['']],
    [[3], ['']],
  ]);
});

void test('structural identity changes on move while src can remain stable', () => {
  const src = 'automerge:file-doc#head1|head2';

  assert.deepEqual(fsRowsFromTree({
    entries: [['before.txt', { kind: 'file', src }]],
    kind: 'dir',
  }).filter((row) => row.src), [
    { key: [0], kind: 'file', name: 'before.txt', parentKey: [], path: ['before.txt'], position: 0, src },
  ]);

  assert.deepEqual(fsRowsFromTree({
    entries: [
      ['folder', { entries: [['after.txt', { kind: 'file', src }]], kind: 'dir' }],
    ],
    kind: 'dir',
  }).filter((row) => row.src), [
    { key: [0, 0], kind: 'file', name: 'after.txt', parentKey: [0], path: ['folder', 'after.txt'], position: 0, src },
  ]);
});

void test('filesystem queries expose live row seams', () => {
  const db = createDb({
    nodes: [
      { key: [], kind: 'dir', name: '', parentKey: null, path: [], position: 0 },
      { key: [1], kind: 'file', name: 'b', parentKey: [], path: ['b'], position: 1, src: 'automerge:b' },
      { key: [0], kind: 'file', name: 'a', parentKey: [], path: ['a'], position: 0, src: 'automerge:a' },
    ],
  });

  assert.equal(q(db, fsNodeByKey, { env: { key: [] } })[0]?.name, '');
  assert.deepEqual(q(db, fsChildrenOfKey, { env: { key: [] } }).map((row) => row.key), [[0], [1]]);
});
