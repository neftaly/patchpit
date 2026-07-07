import assert from 'node:assert/strict';
import test from 'node:test';
import { createDb, q } from '@tarstate/core/db';
import { fsChildrenOfPath, fsNodeByPath, fsRowsFromTree } from './index.ts';

void test('tree ingestion uses path identity and keeps src as data', () => {
  const src = 'https://example.test/tiger.svg';
  const rows = fsRowsFromTree({
    entries: [
      { kind: 'file', name: 'tiger.svg', src },
      { entries: [{ kind: 'file', name: 'tiger.svg', src }], kind: 'folder', name: 'nested' },
    ],
    kind: 'folder',
    name: '/',
  });

  assert.deepEqual(rows.filter((row) => row.src === src), [
    { id: '/tiger.svg', kind: 'file', name: 'tiger.svg', parentId: '/', position: 0, src },
    { id: '/nested/tiger.svg', kind: 'file', name: 'tiger.svg', parentId: '/nested', position: 0, src },
  ]);
});

void test('path identity changes on move while src can remain stable', () => {
  const src = 'automerge:file-doc#head1|head2';

  assert.deepEqual(fsRowsFromTree({
    entries: [{ kind: 'file', name: 'before.txt', src }],
    kind: 'folder',
    name: '/',
  }).filter((row) => row.src), [
    { id: '/before.txt', kind: 'file', name: 'before.txt', parentId: '/', position: 0, src },
  ]);

  assert.deepEqual(fsRowsFromTree({
    entries: [
      { entries: [{ kind: 'file', name: 'after.txt', src }], kind: 'folder', name: 'folder' },
    ],
    kind: 'folder',
    name: '/',
  }).filter((row) => row.src), [
    { id: '/folder/after.txt', kind: 'file', name: 'after.txt', parentId: '/folder', position: 0, src },
  ]);
});

void test('namespace queries expose live row seams', () => {
  const db = createDb({
    nodes: [
      { id: '/', kind: 'folder', name: '/', parentId: null, position: 0 },
      { id: '/b', kind: 'file', name: 'b', parentId: '/', position: 1 },
      { id: '/a', kind: 'file', name: 'a', parentId: '/', position: 0 },
    ],
  });

  assert.equal(q(db, fsNodeByPath, { env: { path: '/' } })[0]?.name, '/');
  assert.deepEqual(q(db, fsChildrenOfPath, { env: { path: '/' } }).map((row) => row.id), ['/a', '/b']);
});
