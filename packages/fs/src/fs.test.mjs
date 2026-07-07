import assert from 'node:assert/strict';
import test from 'node:test';
import { createDb, q } from '@tarstate/core/db';
import { fsChildrenOfPath, fsNodeByPath, fsRowsFromTree } from './index.ts';

void test('tree ingestion uses Pushwork path keys and keeps src as data', () => {
  const src = 'https://example.test/tiger.svg';
  const rows = fsRowsFromTree({
    entries: {
      nested: { entries: { 'tiger.svg': { kind: 'file', src } }, kind: 'dir' },
      'tiger.svg': { kind: 'file', src },
    },
    kind: 'dir',
  });

  assert.deepEqual(rows.filter((row) => row.src === src), [
    { id: '/nested/tiger.svg', kind: 'file', name: 'tiger.svg', parentId: '/nested', position: 0, src },
    { id: '/tiger.svg', kind: 'file', name: 'tiger.svg', parentId: '/', position: 1, src },
  ]);
});

void test('tree ingestion passes src through without policy validation', () => {
  assert.deepEqual(fsRowsFromTree({
    entries: {
      'empty-src.txt': { kind: 'file', src: '' },
      'not-url.txt': { kind: 'file', src: 'not-a-url' },
    },
    kind: 'dir',
  }), [
    { id: '/', kind: 'dir', name: '/', parentId: null, position: 0 },
    { id: '/empty-src.txt', kind: 'file', name: 'empty-src.txt', parentId: '/', position: 0, src: '' },
    { id: '/not-url.txt', kind: 'file', name: 'not-url.txt', parentId: '/', position: 1, src: 'not-a-url' },
  ]);
});

void test('tree ingestion accepts Pushwork map entries', () => {
  assert.deepEqual(fsRowsFromTree({
    entries: new Map([
      ['src', { entries: new Map([['main.ts', { kind: 'file', src: 'automerge:main' }]]), kind: 'dir' }],
    ]),
    kind: 'dir',
  }), [
    { id: '/', kind: 'dir', name: '/', parentId: null, position: 0 },
    { id: '/src', kind: 'dir', name: 'src', parentId: '/', position: 0 },
    { id: '/src/main.ts', kind: 'file', name: 'main.ts', parentId: '/src', position: 0, src: 'automerge:main' },
  ]);
});

void test('path identity changes on move while src can remain stable', () => {
  const src = 'automerge:file-doc#head1|head2';

  assert.deepEqual(fsRowsFromTree({
    entries: { 'before.txt': { kind: 'file', src } },
    kind: 'dir',
  }).filter((row) => row.src), [
    { id: '/before.txt', kind: 'file', name: 'before.txt', parentId: '/', position: 0, src },
  ]);

  assert.deepEqual(fsRowsFromTree({
    entries: { folder: { entries: { 'after.txt': { kind: 'file', src } }, kind: 'dir' } },
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
