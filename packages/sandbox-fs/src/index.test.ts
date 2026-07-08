import assert from 'node:assert/strict';
import test from 'node:test';
import type { FsTree } from '@patchpit/fs';
import { createSandboxUrlMountFromFsTree } from './index';

void test('creates filesystem-backed sandbox URL mounts without eagerly resolving bodies', async () => {
  let reads = 0;
  const mount = createSandboxUrlMountFromFsTree(tree([
    ['index.html', { kind: 'file', src: 'automerge:index' }],
    ['assets', {
      entries: [['style.css', { kind: 'file', src: 'automerge:style' }]],
      kind: 'dir',
    }],
  ]), {
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    mountId: 'mount-1',
    readFile: (file) => {
      reads += 1;
      return { body: file.src, contentType: file.path.at(-1) === 'style.css' ? 'text/css' : 'text/html' };
    },
  });

  assert.equal(reads, 0);
  assert.equal(mount.document.url, 'https://patchpit.test/__patchpit/sandbox/mount-1/index.html');

  const response = await mount.respond('https://patchpit.test/__patchpit/sandbox/mount-1/assets/style.css');
  assert.equal(reads, 1);
  assert.equal(await response?.text(), 'automerge:style');
});

void test('delegates sandbox mount validation', async () => {
  assert.throws(
    () => createSandboxUrlMountFromFsTree(tree([['app.html', { kind: 'file', src: '' }]]), {
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
      readFile,
    }),
    /Sandbox entry file is missing: index\.html/,
  );
  assert.throws(
    () => createSandboxUrlMountFromFsTree(tree([
      ['index.html', { kind: 'file', src: 'first' }],
      ['index.html', { kind: 'file', src: 'second' }],
    ]), { baseUrl: 'https://patchpit.test/', entry: ['index.html'], readFile }),
    /Duplicate sandbox document path: index\.html/,
  );
  assert.throws(
    () => createSandboxUrlMountFromFsTree(tree([['index.html', { kind: 'file', src: '' }], ['.', { kind: 'file', src: '' }]]), {
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
      readFile,
    }),
    /non-empty relative/,
  );
});

const tree = (entries: Extract<FsTree, { readonly kind: 'dir' }>['entries']): FsTree => ({ entries, kind: 'dir' });

const readFile = () => ({ body: '', contentType: 'text/html' });
