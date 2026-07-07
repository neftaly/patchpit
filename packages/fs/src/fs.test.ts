import assert from 'node:assert/strict';
import test from 'node:test';
import { createDb, q } from '@tarstate/core/db';
import { fsChildrenOfId, fsNodeById, fsRowsFromTree } from './index.ts';

void test('filesystem tree rows use structural ids and keep src as data', () => {
  const src = 'https://example.test/tiger.svg';
  const rows = fsRowsFromTree({
    entries: [
      ['nested', { entries: [['tiger.svg', { kind: 'file', src }]], kind: 'dir' }],
      ['tiger.svg', { kind: 'file', src }],
    ],
    kind: 'dir',
  });

  assert.deepEqual(rows.filter((row) => row.src === src), [
    { id: '[0,0]', kind: 'file', name: 'tiger.svg', parentId: '[0]', path: ['nested', 'tiger.svg'], position: 0, src },
    { id: '[1]', kind: 'file', name: 'tiger.svg', parentId: '[]', path: ['tiger.svg'], position: 1, src },
  ]);
});

void test('filesystem tree rows pass src through without policy validation', () => {
  assert.deepEqual(fsRowsFromTree({
    entries: [
      ['empty-src.txt', { kind: 'file', src: '' }],
      ['not-url.txt', { kind: 'file', src: 'not-a-url' }],
    ],
    kind: 'dir',
  }), [
    { id: '[]', kind: 'dir', name: '', parentId: null, path: [], position: 0 },
    { id: '[0]', kind: 'file', name: 'empty-src.txt', parentId: '[]', path: ['empty-src.txt'], position: 0, src: '' },
    { id: '[1]', kind: 'file', name: 'not-url.txt', parentId: '[]', path: ['not-url.txt'], position: 1, src: 'not-a-url' },
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

  assert.deepEqual(rows.map((row) => [row.id, row.path]), [
    ['[]', []],
    ['[0]', ['a/b']],
    ['[1]', ['a']],
    ['[1,0]', ['a', 'b']],
    ['[2]', ['']],
    ['[3]', ['']],
  ]);
});

void test('structural identity changes on move while src can remain stable', () => {
  const src = 'automerge:file-doc#head1|head2';

  assert.deepEqual(fsRowsFromTree({
    entries: [['before.txt', { kind: 'file', src }]],
    kind: 'dir',
  }).filter((row) => row.src), [
    { id: '[0]', kind: 'file', name: 'before.txt', parentId: '[]', path: ['before.txt'], position: 0, src },
  ]);

  assert.deepEqual(fsRowsFromTree({
    entries: [
      ['folder', { entries: [['after.txt', { kind: 'file', src }]], kind: 'dir' }],
    ],
    kind: 'dir',
  }).filter((row) => row.src), [
    { id: '[0,0]', kind: 'file', name: 'after.txt', parentId: '[0]', path: ['folder', 'after.txt'], position: 0, src },
  ]);
});

void test('filesystem queries expose live row seams', () => {
  const db = createDb({
    nodes: [
      { id: '[]', kind: 'dir', name: '', parentId: null, path: [], position: 0 },
      { id: '[1]', kind: 'file', name: 'b', parentId: '[]', path: ['b'], position: 1, src: 'automerge:b' },
      { id: '[0]', kind: 'file', name: 'a', parentId: '[]', path: ['a'], position: 0, src: 'automerge:a' },
    ],
  });

  assert.equal(q(db, fsNodeById, { env: { id: '[]' } })[0]?.name, '');
  assert.deepEqual(q(db, fsChildrenOfId, { env: { id: '[]' } }).map((row) => row.id), ['[0]', '[1]']);
});
