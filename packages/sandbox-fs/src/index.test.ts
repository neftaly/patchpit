import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxUrlMountFromFsFiles } from './index.ts';

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
