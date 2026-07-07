import assert from 'node:assert/strict';
import test from 'node:test';
import { createDb, q } from '@tarstate/core/db';
import { fsChildrenOfPath, fsNodeByPath, fsRowsFromTree } from './index.ts';

void test('filesystem tree rows use namespace paths and keep src as data', () => {
  const src = 'https://example.test/tiger.svg';
  const rows = fsRowsFromTree({
    entries: new Map([
      ['nested', { entries: new Map([['tiger.svg', { kind: 'file', src }]]), kind: 'dir' }],
      ['tiger.svg', { kind: 'file', src }],
    ]),
    kind: 'dir',
  });

  assert.deepEqual(rows.filter((row) => row.src === src), [
    { id: '/nested/tiger.svg', kind: 'file', name: 'tiger.svg', parentId: '/nested', position: 0, src },
    { id: '/tiger.svg', kind: 'file', name: 'tiger.svg', parentId: '/', position: 1, src },
  ]);
});

void test('filesystem tree rows pass src through without policy validation', () => {
  assert.deepEqual(fsRowsFromTree({
    entries: new Map([
      ['empty-src.txt', { kind: 'file', src: '' }],
      ['not-url.txt', { kind: 'file', src: 'not-a-url' }],
    ]),
    kind: 'dir',
  }), [
    { id: '/', kind: 'dir', name: '/', parentId: null, position: 0 },
    { id: '/empty-src.txt', kind: 'file', name: 'empty-src.txt', parentId: '/', position: 0, src: '' },
    { id: '/not-url.txt', kind: 'file', name: 'not-url.txt', parentId: '/', position: 1, src: 'not-a-url' },
  ]);
});

void test('filesystem tree rows encode keys into unambiguous paths', () => {
  assert.deepEqual(fsRowsFromTree({
    entries: new Map([
      ['a/b', { kind: 'file', src: 'automerge:slash' }],
      ['a', { entries: new Map([['b', { kind: 'file', src: 'automerge:nested' }]]), kind: 'dir' }],
      ['', { kind: 'file', src: 'automerge:empty' }],
    ]),
    kind: 'dir',
  }).map((row) => row.id), ['/', '/a%2Fb', '/a', '/a/b', '/%00']);
});

void test('path identity changes on move while src can remain stable', () => {
  const src = 'automerge:file-doc#head1|head2';

  assert.deepEqual(fsRowsFromTree({
    entries: new Map([['before.txt', { kind: 'file', src }]]),
    kind: 'dir',
  }).filter((row) => row.src), [
    { id: '/before.txt', kind: 'file', name: 'before.txt', parentId: '/', position: 0, src },
  ]);

  assert.deepEqual(fsRowsFromTree({
    entries: new Map([
      ['folder', { entries: new Map([['after.txt', { kind: 'file', src }]]), kind: 'dir' }],
    ]),
    kind: 'dir',
  }).filter((row) => row.src), [
    { id: '/folder/after.txt', kind: 'file', name: 'after.txt', parentId: '/folder', position: 0, src },
  ]);
});

void test('namespace queries expose live row seams', () => {
  const db = createDb({
    nodes: [
      { id: '/', kind: 'dir', name: '/', parentId: null, position: 0 },
      { id: '/b', kind: 'file', name: 'b', parentId: '/', position: 1, src: 'automerge:b' },
      { id: '/a', kind: 'file', name: 'a', parentId: '/', position: 0, src: 'automerge:a' },
    ],
  });

  assert.equal(q(db, fsNodeByPath, { env: { path: '/' } })[0]?.name, '/');
  assert.deepEqual(q(db, fsChildrenOfPath, { env: { path: '/' } }).map((row) => row.id), ['/a', '/b']);
});
