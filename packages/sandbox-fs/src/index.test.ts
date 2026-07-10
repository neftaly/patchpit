import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxUrlMountFromFsFiles, sandboxFsFilesFromEntries } from './index.ts';

void test('projects nested filesystem resources into a sandbox URL mount', async () => {
  const resources = new Map([
    ['content:index', { body: '<link rel="stylesheet" href="./assets/app.css">', contentType: 'text/html' }],
    ['content:css', { body: 'body{}', contentType: 'text/css' }],
  ]);
  const files = await sandboxFsFilesFromEntries([
    { entryId: 'index', kind: 'file', name: 'index.html', order: 0, parentId: null, resourceRef: 'content:index' },
    { entryId: 'assets', kind: 'folder', name: 'assets', order: 1, parentId: null, resourceRef: 'folder:assets' },
    { entryId: 'css', kind: 'file', name: 'app.css', order: 0, parentId: 'assets', resourceRef: 'content:css' },
  ], (resourceRef) => resources.get(resourceRef));
  const mount = createSandboxUrlMountFromFsFiles(files, {
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    mountId: 'fs-app',
  });

  assert.deepEqual(files.map(({ path }) => path), [['index.html'], ['assets', 'app.css']]);
  const css = await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/fs-app/assets/app.css'));
  assert.equal(await css?.text(), 'body{}');
});

void test('rejects filesystem parent cycles', async () => {
  await assert.rejects(() => sandboxFsFilesFromEntries([
    { entryId: 'left', kind: 'folder', name: 'left', order: 0, parentId: 'right', resourceRef: 'folder:left' },
    { entryId: 'right', kind: 'folder', name: 'right', order: 0, parentId: 'left', resourceRef: 'folder:right' },
  ], () => undefined), /Filesystem parent cycle/);
});

void test('creates filesystem-backed sandbox URL mounts from files', async () => {
  const files = [{
    body: '<!doctype html>',
    contentType: 'text/html',
    path: ['index.html'],
  }, {
    body: 'body{}',
    contentType: 'text/css',
    path: ['assets', 'style.css'],
  }];

  const mount = createSandboxUrlMountFromFsFiles(files, {
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    mountId: 'mount-1',
  });

  assert.equal(mount.frameAttributes.src, 'https://patchpit.test/__patchpit/sandbox/mount-1/index.html');

  const response = await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/assets/style.css'));
  assert.equal(response?.headers.get('Content-Type'), 'text/css');
  assert.equal(await response?.text(), 'body{}');
});

void test('delegates sandbox mount validation', async () => {
  assert.throws(
    () => createSandboxUrlMountFromFsFiles([{ body: '', path: ['app.html'] }], {
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
    }),
    /Sandbox entry file is missing: index\.html/,
  );
  assert.throws(
    () => createSandboxUrlMountFromFsFiles([
      { body: '', path: ['index.html'] },
      { body: '', path: ['index.html'] },
    ], { baseUrl: 'https://patchpit.test/', entry: ['index.html'] }),
    /Duplicate sandbox document path: index\.html/,
  );
  assert.throws(
    () => createSandboxUrlMountFromFsFiles([
      { body: '', path: ['index.html'] },
      { body: '', path: ['.'] },
    ], {
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
    }),
    /non-empty relative/,
  );
});
