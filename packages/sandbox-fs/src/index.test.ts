import assert from 'node:assert/strict';
import test from 'node:test';
import type { FsTree } from '@patchpit/fs';
import { createStaticSandboxDocumentFromFsTree } from './index';

void test('creates sandbox documents from filesystem trees', async () => {
  const document = await createStaticSandboxDocumentFromFsTree(tree([
    ['index.html', { kind: 'file', src: '<main></main>' }],
    ['assets', {
      entries: [['style.css', { kind: 'file', src: 'body {}' }]],
      kind: 'dir',
    }],
  ]), {
    entry: ['index.html'],
    readFile: (file) => ({ body: file.src, contentType: contentType(file.path) }),
  });

  assert.equal(document.sandbox, 'allow-scripts');
  assert.equal(document.url.startsWith('data:text/html;charset=utf-8,'), true);
});

void test('resolves file bodies and custom entry paths', async () => {
  const document = await createStaticSandboxDocumentFromFsTree(tree([
    ['dir name', {
      entries: [['a/b.html', { kind: 'file', src: 'automerge:file' }]],
      kind: 'dir',
    }],
  ]), {
    entry: ['dir name', 'a/b.html'],
    readFile: (file) => file.src === 'automerge:file'
      ? { body: '<main>resolved</main>', contentType: 'text/html' }
      : undefined,
  });

  assert.equal(outerHtml(document.url).includes('data:text/html;base64,PG1haW4+cmVzb2x2ZWQ8L21haW4+'), true);
});

void test('rejects unresolved file bodies and delegates document validation', async () => {
  await assert.rejects(
    createStaticSandboxDocumentFromFsTree(tree([['index.html', { kind: 'file', src: 'automerge:missing' }]]), {
      entry: ['index.html'],
      readFile: () => undefined,
    }),
    /Sandbox file body is unresolved: index\.html/,
  );
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

void test('rejects invalid sandbox mounts before reading file bodies', async () => {
  let reads = 0;
  await assert.rejects(
    createStaticSandboxDocumentFromFsTree(tree([['app.html', { kind: 'file', src: '' }]]), {
      entry: ['index.html'],
      readFile: () => {
        reads += 1;
        return { body: '', contentType: 'text/html' };
      },
    }),
    /Sandbox entry file is missing: index\.html/,
  );
  assert.equal(reads, 0);
});

const outerHtml = (url: string) =>
  decodeURIComponent(url.slice('data:text/html;charset=utf-8,'.length));

const tree = (entries: Extract<FsTree, { readonly kind: 'dir' }>['entries']): FsTree => ({ entries, kind: 'dir' });

const contentType = (path: readonly string[]) =>
  path.at(-1)?.endsWith('.css') === true ? 'text/css' : 'text/html';

const readFile = () => ({ body: '', contentType: 'text/html' });
