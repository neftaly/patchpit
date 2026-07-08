import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxDocument, planSandboxDocument } from './index';

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

void test('sandbox document creation is reserved for URL mounts', async () => {
  await assert.rejects(
    createSandboxDocument({
      entry: ['index.html'],
      files: [{ path: ['index.html'] }],
    }),
    /Sandbox URL mounts are not implemented yet/,
  );
});
