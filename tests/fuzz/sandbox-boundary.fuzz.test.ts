import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  createSandboxFrameAttributes,
  respondFromSandboxCache,
  sandboxCacheName,
  type SandboxCacheStorage,
} from '@patchpit/sandbox';
import { indexSandboxFiles } from '../../packages/sandbox/src/document.ts';

const pathSegment = fc.string({ minLength: 1, maxLength: 30 })
  .filter((segment) => segment !== '.' && segment !== '..');

void test('sandbox paths and unknown cache requests remain encoded, bounded, and allocation-free', async () => {
  await fc.assert(fc.asyncProperty(
    fc.uuid({ version: 4 }),
    fc.array(pathSegment, { minLength: 1, maxLength: 5 }),
    fc.constantFrom('GET', 'HEAD', 'POST', 'DELETE'),
    async (mountId, path, method) => {
      const file = { path };
      const pathKey = path.map(encodeURIComponent).join('/');
      assert.equal(indexSandboxFiles(path, [file]).get(pathKey), file);
      assert.equal(createSandboxFrameAttributes({
        baseUrl: 'https://patchpit.test/patchpit/',
        entry: path,
        mountId,
      }).src, `https://patchpit.test/__patchpit/sandbox/${mountId}/${pathKey}`);

      const storage = emptyCacheStorage();
      const response = await respondFromSandboxCache(new Request(
        `https://patchpit.test/patchpit/__patchpit/sandbox/${mountId}/${pathKey}`,
        { method },
      ), 'https://patchpit.test/patchpit/__patchpit/sandbox/', storage);
      assert.equal(response.status, method === 'GET' || method === 'HEAD' ? 404 : 405);
      assert.equal(storage.opened(), false);

      const wrongVersion = `${mountId.slice(0, 14)}1${mountId.slice(15)}`;
      assert.throws(() => sandboxCacheName(wrongVersion), /Invalid sandbox mount UUID/);
    },
  ), { numRuns: 100 });
});

const emptyCacheStorage = (): SandboxCacheStorage & { readonly opened: () => boolean } => {
  let opened = false;
  return {
    delete: async () => false,
    keys: async () => [],
    match: async () => undefined,
    open: async () => {
      opened = true;
      throw new Error('Unknown sandbox requests must not open caches');
    },
    opened: () => opened,
  };
};
