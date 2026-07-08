import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxUrlMountFromFsFiles } from './index.ts';

void test('creates filesystem-backed sandbox URL mounts from files', async () => {
  const files = [{
    body: '<!doctype html>',
    contentType: 'text/html',
    path: ['index.html'],
    src: 'automerge:index',
  }, {
    body: 'body{}',
    contentType: 'text/css',
    path: ['assets', 'style.css'],
    src: 'automerge:style',
  }];

  const mount = createSandboxUrlMountFromFsFiles(files, {
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    mountId: 'mount-1',
  });

  assert.equal(mount.frame.src, 'https://patchpit.test/__patchpit/sandbox/mount-1/index.html');

  const response = await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/assets/style.css'));
  assert.equal(response?.headers.get('Content-Type'), 'text/css');
  assert.equal(await response?.text(), 'body{}');
});

void test('delegates sandbox mount validation', async () => {
  assert.throws(
    () => createSandboxUrlMountFromFsFiles([{ body: '', path: ['app.html'], src: '' }], {
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
    }),
    /Sandbox entry file is missing: index\.html/,
  );
  assert.throws(
    () => createSandboxUrlMountFromFsFiles([
      { body: '', path: ['index.html'], src: 'first' },
      { body: '', path: ['index.html'], src: 'second' },
    ], { baseUrl: 'https://patchpit.test/', entry: ['index.html'] }),
    /Duplicate sandbox document path: index\.html/,
  );
  assert.throws(
    () => createSandboxUrlMountFromFsFiles([
      { body: '', path: ['index.html'], src: '' },
      { body: '', path: ['.'], src: '' },
    ], {
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
    }),
    /non-empty relative/,
  );
});
