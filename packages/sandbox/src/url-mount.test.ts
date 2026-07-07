import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sandboxUrlMountDev,
  sandboxUrlMountFileUrl,
  sandboxUrlMountHeaders,
  sandboxUrlMountRequest,
  sandboxUrlMountRequestUrl,
  sandboxUrlMountStoredFiles,
  sandboxUrlMountWorkerUrl,
} from './url-mount';

void test('sandbox URL mount helpers preserve path segments as encoded URL data', () => {
  const origin = 'https://patchpit.test';
  const request = sandboxUrlMountRequest('/__sandbox__/mounts/mount-1/dir%20name/a%2Fb/100%25/');

  assert.deepEqual(request, {
    mountId: 'mount-1',
    pathKey: 'dir%20name/a%2Fb/100%25/',
  });
  assert.equal(
    sandboxUrlMountFileUrl(origin, 'mount-1', ['dir name', 'a/b', '100%', '']),
    'https://patchpit.test/__sandbox__/mounts/mount-1/dir%20name/a%2Fb/100%25/',
  );
  assert.equal(request && sandboxUrlMountRequestUrl(origin, request), 'https://patchpit.test/__sandbox__/mounts/mount-1/dir%20name/a%2Fb/100%25/');
});

void test('sandbox URL mount request parser owns the sandbox prefix parse', () => {
  assert.equal(sandboxUrlMountRequest('/not-sandbox/mounts/a/b'), undefined);
  assert.equal(sandboxUrlMountRequest('/__sandbox__/mounts/mount-without-path'), undefined);
});

void test('sandbox URL mount stored file records are pure cache inputs', () => {
  assert.deepEqual(sandboxUrlMountStoredFiles('https://patchpit.test', 'mount-1', [{
    contentType: 'image/svg+xml',
    path: ['dir', 'tiger.svg'],
    text: '<svg />',
  }]), [{
    headers: sandboxUrlMountHeaders('image/svg+xml', 'mount-1', 'https://patchpit.test'),
    text: '<svg />',
    url: 'https://patchpit.test/__sandbox__/mounts/mount-1/dir/tiger.svg',
  }]);
});

void test('sandbox URL mount headers construct valid opaque-origin document policy', () => {
  const headers = sandboxUrlMountHeaders('text/html', 'mount-1', 'https://patchpit.test');
  const csp = new Headers(headers).get('content-security-policy');

  assert.doesNotThrow(() => new Response('<!doctype html>', { headers }));
  assert.equal(new Headers(headers).get('access-control-allow-origin'), 'null');
  assert.equal(csp?.startsWith("default-src 'none'; "), true);
  assert.equal(csp?.includes('\n'), false);
  assert.equal(csp?.includes('sandbox allow-scripts'), true);
  assert.equal(csp?.includes('https://patchpit.test/__sandbox__/mounts/mount-1/'), true);
});

void test('sandbox URL mount worker defaults are production-safe outside Vite', () => {
  assert.equal(sandboxUrlMountDev, false);
  assert.equal(sandboxUrlMountWorkerUrl, '/sandbox-url-mount-sw.mjs');
});
