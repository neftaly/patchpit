import assert from 'node:assert/strict';
import test from 'node:test';
import { createDb, q } from '@tarstate/core/db';
import { validateRelationRow } from '@tarstate/core/relation';
import { fsRowsFromTree } from './projection.ts';
import { fsChildrenOfKey, fsNodeByKey } from './queries.ts';
import { fsRelations } from './schema.ts';
import { fsTreeFromFiles } from './tree.ts';

const validNodeRow = {
  key: [0],
  kind: 'file',
  name: 'file.txt',
  parentKey: [],
  position: 0,
  src: 'automerge:file',
};

const invalidRelationFields = (row: Record<string, unknown>) =>
  validateRelationRow(fsRelations.nodes, row)
    .filter((diagnostic) => diagnostic.code === 'field_invalid')
    .map((diagnostic) => diagnostic.field);

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
    { key: [0, 0], kind: 'file', name: 'tiger.svg', parentKey: [0], position: 0, src },
    { key: [1], kind: 'file', name: 'tiger.svg', parentKey: [], position: 1, src },
  ]);
});

void test('filesystem tree can be projected from file paths', () => {
  assert.deepEqual(fsTreeFromFiles([
    { path: ['assets', 'app.js'], src: 'automerge:app' },
    { path: ['assets'], src: 'automerge:assets-file' },
    { path: ['index.html'], src: 'automerge:index' },
  ]), {
    entries: [
      ['assets', {
        entries: [['app.js', { kind: 'file', src: 'automerge:app' }]],
        kind: 'dir',
      }],
      ['assets', { kind: 'file', src: 'automerge:assets-file' }],
      ['index.html', { kind: 'file', src: 'automerge:index' }],
    ],
    kind: 'dir',
  });
});

void test('filesystem tree rows pass src through unchanged', () => {
  assert.deepEqual(fsRowsFromTree({
    entries: [
      ['empty-src.txt', { kind: 'file', src: '' }],
      ['not-url.txt', { kind: 'file', src: 'not-a-url' }],
    ],
    kind: 'dir',
  }), [
    { key: [], kind: 'dir', name: '', parentKey: null, position: 0 },
    { key: [0], kind: 'file', name: 'empty-src.txt', parentKey: [], position: 0, src: '' },
    { key: [1], kind: 'file', name: 'not-url.txt', parentKey: [], position: 1, src: 'not-a-url' },
  ]);
});

void test('structural identity changes on move while src can remain stable', () => {
  const src = 'automerge:file-doc#head1|head2';

  assert.deepEqual(fsRowsFromTree({
    entries: [['before.txt', { kind: 'file', src }]],
    kind: 'dir',
  }).filter((row) => row.src), [
    { key: [0], kind: 'file', name: 'before.txt', parentKey: [], position: 0, src },
  ]);

  assert.deepEqual(fsRowsFromTree({
    entries: [
      ['folder', { entries: [['after.txt', { kind: 'file', src }]], kind: 'dir' }],
    ],
    kind: 'dir',
  }).filter((row) => row.src), [
    { key: [0, 0], kind: 'file', name: 'after.txt', parentKey: [0], position: 0, src },
  ]);
});

void test('filesystem rows do not share parent key arrays with parent rows', () => {
  const rows = fsRowsFromTree({
    entries: [['folder', { entries: [['file.txt', { kind: 'file', src: 'automerge:file' }]], kind: 'dir' }]],
    kind: 'dir',
  });
  const folder = rows.find((row) => row.name === 'folder');
  const file = rows.find((row) => row.name === 'file.txt');
  assert.notEqual(file?.parentKey, folder?.key);
  assert.deepEqual(file?.parentKey, folder?.key);
});

void test('filesystem relation validates node key arrays', () => {
  const sparseKey = [0];
  sparseKey.length = 2;

  assert.deepEqual(validateRelationRow(fsRelations.nodes, validNodeRow), []);
  assert.deepEqual(validateRelationRow(fsRelations.nodes, fsRowsFromTree({ entries: [], kind: 'dir' })[0] ?? {}), []);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, key: [-1] }), ['key']);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, key: [-0] }), ['key']);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, key: [1.5] }), ['key']);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, key: [Number.POSITIVE_INFINITY] }), ['key']);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, key: ['0'] }), ['key']);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, key: sparseKey }), ['key']);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, key: 0 }), ['key']);
  assert.deepEqual(invalidRelationFields({ ...validNodeRow, parentKey: [-1] }), ['parentKey']);
});

void test('filesystem queries expose live row seams', () => {
  const db = createDb({
    nodes: [
      { key: [], kind: 'dir', name: '', parentKey: null, position: 0 },
      { key: [1], kind: 'file', name: 'b', parentKey: [], position: 1, src: 'automerge:b' },
      { key: [0], kind: 'file', name: 'a', parentKey: [], position: 0, src: 'automerge:a' },
    ],
  });

  assert.equal(q(db, fsNodeByKey, { env: { key: [] } })[0]?.name, '');
  assert.deepEqual(q(db, fsChildrenOfKey, { env: { key: [] } }).map((row) => row.key), [[0], [1]]);
});
