import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxFrameAttributes } from '@patchpit/sandbox';
import { indexSandboxFiles } from '../../packages/sandbox/src/document.ts';

void test('rejects invalid sandbox documents', () => {
  assert.throws(
    () => indexSandboxFiles(['index.html'], [{ path: ['app.html'] }]),
    /Sandbox entry file is missing: index\.html/,
  );
  assert.throws(
    () => indexSandboxFiles(['index.html'], [{ path: ['index.html'] }, { path: ['index.html'] }]),
    /Duplicate sandbox document path: index\.html/,
  );
  assert.throws(() => indexSandboxFiles([], []), /non-empty relative/);
  assert.throws(() => indexSandboxFiles(['index.html'], [{ path: ['.'] }]), /non-empty relative/);
});

void test('creates sandbox frame attributes and validates mount segments', () => {
  assert.deepEqual(createSandboxFrameAttributes({
    baseUrl: 'https://patchpit.test/base/',
    entry: ['assets', 'a/b.html'],
    mountId: 'mount-1',
  }), {
    referrerPolicy: 'no-referrer',
    sandbox: 'allow-scripts allow-same-origin',
    src: 'https://patchpit.test/__patchpit/sandbox/mount-1/assets/a%2Fb.html',
  });
  assert.throws(
    () => createSandboxFrameAttributes({ baseUrl: 'https://patchpit.test/', entry: [], mountId: 'mount-1' }),
    /non-empty relative/,
  );
  for (const segment of ['', '.', '..']) {
    assert.throws(() => createSandboxFrameAttributes({
      baseUrl: 'https://patchpit.test/',
      entry: ['index.html'],
      mountId: segment,
    }), /non-empty, non-dot segments/);
  }
});
