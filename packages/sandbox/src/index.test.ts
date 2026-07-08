import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxUrlMount, planSandboxDocument } from './index';

void test('plans sandbox document paths without reading or serving files', () => {
  const index = { path: ['index.html'], src: 'automerge:index' };
  const image = { path: ['assets', 'a/b.svg'], src: 'https://example.test/a.svg' };
  const plan = planSandboxDocument(['index.html'], [index, image]);

  assert.equal(plan.entryFileIndex, 0);
  assert.equal(plan.entryPath, 'index.html');
  assert.deepEqual(plan.files.map((file) => file.path), [
    'index.html',
    'assets/a%2Fb.svg',
  ]);
  assert.equal(plan.files[1]?.file, image);
});

void test('rejects invalid sandbox document mounts', () => {
  assert.throws(
    () => planSandboxDocument(['index.html'], [{ path: ['app.html'] }]),
    /Sandbox entry file is missing: index\.html/,
  );
  assert.throws(
    () => planSandboxDocument(['index.html'], [
      { path: ['index.html'] },
      { path: ['index.html'] },
    ]),
    /Duplicate sandbox document path: index\.html/,
  );
  assert.throws(
    () => planSandboxDocument([], []),
    /non-empty relative/,
  );
  assert.throws(
    () => planSandboxDocument(['index.html'], [{ path: ['.'] }]),
    /non-empty relative/,
  );
});

void test('creates sandbox URL mounts that serve planned files', async () => {
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/base/',
    entry: ['index.html'],
    files: [{
      path: ['index.html'],
      read: () => ({ body: '<script type="module" src="./app.js"></script>', contentType: 'text/html' }),
    }, {
      path: ['assets', 'a/b.svg'],
      read: () => ({ body: '<svg />', contentType: 'image/svg+xml' }),
    }],
    mountId: 'mount-1',
  });

  assert.equal(mount.document.referrerPolicy, 'no-referrer');
  assert.equal(mount.document.sandbox, 'allow-scripts');
  assert.equal(mount.document.url, 'https://patchpit.test/__patchpit/sandbox/mount-1/index.html');

  const response = await mount.respond('https://patchpit.test/__patchpit/sandbox/mount-1/assets/a%2Fb.svg');
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response?.headers.get('Content-Type'), 'image/svg+xml');
  assert.equal(await response?.text(), '<svg />');
});

void test('sandbox URL mounts return undefined for unrelated requests', async () => {
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{ path: ['index.html'], read: () => ({ body: '', contentType: 'text/html' }) }],
    mountId: 'mount-1',
  });

  assert.equal(await mount.respond('https://patchpit.test/index.html'), undefined);
});
