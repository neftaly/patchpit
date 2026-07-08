import assert from 'node:assert/strict';
import test from 'node:test';
import type { FsTree } from '@patchpit/fs';
import { createSandboxDocumentFromFsTree } from './index';

void test('creates opaque sandbox documents from filesystem trees', async () => {
  const document = await createSandboxDocumentFromFsTree(tree([
    ['index.html', { kind: 'file', src: '<main></main>' }],
    ['assets', {
      entries: [['style.css', { kind: 'file', src: 'body {}' }]],
      kind: 'dir',
    }],
  ]), { resolveFile: (file) => ({ body: file.src, contentType: contentType(file.path) }) });

  assert.equal(document.sandbox, 'allow-scripts');
  assert.equal(document.url.startsWith('data:text/html;charset=utf-8,'), true);
});

void test('resolves file bodies and custom entry paths', async () => {
  const document = await createSandboxDocumentFromFsTree(tree([
    ['dir name', {
      entries: [['a/b.html', { kind: 'file', src: 'automerge:file' }]],
      kind: 'dir',
    }],
  ]), {
    entry: ['dir name', 'a/b.html'],
    resolveFile: (file) => file.src === 'automerge:file'
      ? { body: '<main>resolved</main>', contentType: 'text/html' }
      : undefined,
  });

  assert.equal(outerHtml(document.url).includes('data:text/html;base64,PG1haW4+cmVzb2x2ZWQ8L21haW4+'), true);
});

void test('rejects missing, duplicate, and unrepresentable sandbox paths', async () => {
  await assert.rejects(
    createSandboxDocumentFromFsTree(tree([['index.html', { kind: 'file', src: 'automerge:missing' }]])),
    /Sandbox file body is unresolved: index\.html/,
  );
  await assert.rejects(
    createSandboxDocumentFromFsTree(tree([['app.html', { kind: 'file', src: '' }]])),
    /Sandbox entry file is missing: index\.html/,
  );
  await assert.rejects(
    createSandboxDocumentFromFsTree(tree([
      ['index.html', { kind: 'file', src: 'first' }],
      ['index.html', { kind: 'file', src: 'second' }],
    ])),
    /Duplicate sandbox file path: index\.html/,
  );
  await assert.rejects(
    createSandboxDocumentFromFsTree(tree([['index.html', { kind: 'file', src: '' }], ['.', { kind: 'file', src: '' }]])),
    /non-empty relative/,
  );
  await assert.rejects(
    createSandboxDocumentFromFsTree(tree([
      ['a.html', { kind: 'file', src: '' }],
      ['a.html', { entries: [['b.html', { kind: 'file', src: '' }]], kind: 'dir' }],
    ]), { entry: ['a.html'] }),
    /both file and directory/,
  );
});

const outerHtml = (url: string) =>
  decodeURIComponent(url.slice('data:text/html;charset=utf-8,'.length));

const tree = (entries: Extract<FsTree, { readonly kind: 'dir' }>['entries']): FsTree => ({ entries, kind: 'dir' });

const contentType = (path: readonly string[]) =>
  path.at(-1)?.endsWith('.css') === true ? 'text/css' : 'text/html';
