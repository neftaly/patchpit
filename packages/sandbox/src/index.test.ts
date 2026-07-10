import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxFrameAttributes, createSandboxUrlMount } from './index.ts';
import { indexSandboxFiles } from './document.ts';

void test('plans sandbox document paths without reading or serving files', () => {
  const index = { path: ['index.html'], src: 'automerge:index' };
  const image = { path: ['assets', 'a/b.svg'], src: 'https://example.test/a.svg' };
  const plan = indexSandboxFiles(['index.html'], [index, image]);

  assert.deepEqual([...plan.keys()], [
    'index.html',
    'assets/a%2Fb.svg',
  ]);
  assert.equal(plan.get('index.html'), index);
  assert.equal(plan.get('assets/a%2Fb.svg'), image);
});

void test('rejects invalid sandbox document mounts', () => {
  assert.throws(
    () => indexSandboxFiles(['index.html'], [{ path: ['app.html'] }]),
    /Sandbox entry file is missing: index\.html/,
  );
  assert.throws(
    () => indexSandboxFiles(['index.html'], [
      { path: ['index.html'] },
      { path: ['index.html'] },
    ]),
    /Duplicate sandbox document path: index\.html/,
  );
  assert.throws(
    () => indexSandboxFiles([], []),
    /non-empty relative/,
  );
  assert.throws(
    () => indexSandboxFiles(['index.html'], [{ path: ['.'] }]),
    /non-empty relative/,
  );
});

void test('creates sandbox frame attributes from iframe-shaped launch data', () => {
  assert.deepEqual(createSandboxFrameAttributes({
    baseUrl: 'https://patchpit.test/base/',
    entry: ['assets', 'a/b.html'],
    mountId: 'mount-1',
  }), {
    referrerPolicy: 'no-referrer',
    sandbox: 'allow-scripts',
    src: 'https://patchpit.test/__patchpit/sandbox/mount-1/assets/a%2Fb.html',
  });
  assert.throws(
    () => createSandboxFrameAttributes({ baseUrl: 'https://patchpit.test/', entry: [], mountId: 'mount-1' }),
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
    }, {
      path: ['assets', 'unknown.bin'],
      read: () => ({ body: new Uint8Array([1, 2, 3]) }),
    }],
    mountId: 'mount-1',
  });

  assert.equal(mount.frameAttributes.referrerPolicy, 'no-referrer');
  assert.equal(mount.frameAttributes.sandbox, 'allow-scripts');
  assert.equal(mount.frameAttributes.src, 'https://patchpit.test/__patchpit/sandbox/mount-1/index.html');

  const response = await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/assets/a%2Fb.svg'));
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(response?.headers.get('Content-Type'), 'image/svg+xml');
  assert.equal(response?.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response?.headers.get('Content-Security-Policy') ?? '', /sandbox allow-scripts/);
  assert.doesNotMatch(response?.headers.get('Content-Security-Policy') ?? '', /allow-same-origin/);
  assert.match(
    response?.headers.get('Content-Security-Policy') ?? '',
    /connect-src https:\/\/patchpit\.test\/__patchpit\/sandbox\/mount-1\//,
  );
  assert.equal(await response?.text(), '<svg />');

  const unknown = await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/assets/unknown.bin'));
  assert.equal(unknown?.headers.get('Content-Type'), 'application/octet-stream');
});

void test('sandbox URL mounts reject in-scope non-GET and non-HEAD methods', async () => {
  let reads = 0;
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{
      path: ['index.html'],
      read: () => {
        reads += 1;
        return { body: '', contentType: 'text/html' };
      },
    }],
    mountId: 'mount-1',
  });

  const response = await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/index.html', {
    method: 'POST',
  }));

  assert.equal(reads, 0);
  assert.equal(response?.status, 405);
  assert.equal(response?.headers.get('Allow'), 'GET, HEAD');
  assert.match(response?.headers.get('Content-Security-Policy') ?? '', /sandbox allow-scripts/);
  assert.equal(await response?.text(), 'Method not allowed');
  assert.equal(
    await mount.respond(new Request('https://patchpit.test/not-sandbox/index.html', { method: 'POST' })),
    undefined,
  );
});

void test('sandbox URL mounts 404 in-scope invalid paths', async () => {
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{ path: ['index.html'], read: () => ({ body: '', contentType: 'text/html' }) }],
    mountId: 'mount-1',
  });

  assert.equal((await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/')))?.status, 404);
  assert.equal((await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/%zz')))?.status, 404);
  assert.equal((await mount.respond(new Request('https://patchpit.test/__patchpit/sandbox/mount-1/%2e')))?.status, 404);
  assert.equal(await mount.respond(new Request('https://patchpit.test/not-sandbox/%zz')), undefined);
});

void test('sandbox URL mounts return undefined for unrelated requests', async () => {
  const mount = createSandboxUrlMount({
    baseUrl: 'https://patchpit.test/',
    entry: ['index.html'],
    files: [{ path: ['index.html'], read: () => ({ body: '', contentType: 'text/html' }) }],
    mountId: 'mount-1',
  });

  assert.equal(await mount.respond(new Request('https://patchpit.test/index.html')), undefined);
});
