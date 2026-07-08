import assert from 'node:assert/strict';
import test from 'node:test';
import type { FsTree } from '@patchpit/fs';
import { createStaticSandboxDocumentFromFsTree } from './index';

void test('plans filesystem-backed sandbox documents without resolving bodies', async () => {
  let reads = 0;
  await assert.rejects(
    createStaticSandboxDocumentFromFsTree(tree([
      ['index.html', { kind: 'file', src: 'automerge:index' }],
      ['assets', {
        entries: [['style.css', { kind: 'file', src: 'automerge:style' }]],
        kind: 'dir',
      }],
    ]), {
      entry: ['index.html'],
      readFile: () => {
        reads += 1;
        return { body: '', contentType: 'text/html' };
      },
    }),
    /Sandbox URL mounts are not implemented yet/,
  );
  assert.equal(reads, 0);
});

void test('delegates sandbox mount validation', async () => {
  await assert.rejects(
    createStaticSandboxDocumentFromFsTree(tree([['app.html', { kind: 'file', src: '' }]]), { entry: ['index.html'], readFile }),
    /Sandbox entry file is missing: index\.html/,
  );
  await assert.rejects(
    createStaticSandboxDocumentFromFsTree(tree([
      ['index.html', { kind: 'file', src: 'first' }],
      ['index.html', { kind: 'file', src: 'second' }],
    ]), { entry: ['index.html'], readFile }),
    /Duplicate sandbox document path: index\.html/,
  );
  await assert.rejects(
    createStaticSandboxDocumentFromFsTree(tree([['index.html', { kind: 'file', src: '' }], ['.', { kind: 'file', src: '' }]]), { entry: ['index.html'], readFile }),
    /non-empty relative/,
  );
});

const tree = (entries: Extract<FsTree, { readonly kind: 'dir' }>['entries']): FsTree => ({ entries, kind: 'dir' });

const readFile = () => ({ body: '', contentType: 'text/html' });
