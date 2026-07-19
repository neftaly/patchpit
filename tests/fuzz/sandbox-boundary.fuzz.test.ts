import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  createSandboxFrameAttributes,
  parseEditorAppMessage,
  parseEditorHostMessage,
  respondFromSandboxCache,
  sandboxCacheName,
  type SandboxCacheStorage,
} from '@patchpit/sandbox';
import { indexSandboxFiles } from '../../packages/sandbox/src/document.ts';

const pathSegment = fc.string({ minLength: 1, maxLength: 30 })
  .filter((segment) => segment !== '.' && segment !== '..');
const textValue = fc.array(
  fc.integer({ min: 0, max: 0x10FFFF })
    .filter((value) => value < 0xD800 || value > 0xDFFF)
    .map(String.fromCodePoint),
  { maxLength: 30 },
).map((characters) => characters.join(''));

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

void test('editor port parsing is total and retains only bounded protocol messages', () => {
  fc.assert(fc.property(fc.anything({ maxDepth: 5 }), (candidate) => {
    assert.doesNotThrow(() => parseEditorAppMessage(candidate));
    assert.doesNotThrow(() => parseEditorHostMessage(candidate));
  }), { numRuns: 1_000 });

  fc.assert(fc.property(
    fc.uuid({ version: 4 }),
    fc.nat({ max: 1_000_000 }),
    fc.nat({ max: 1_000_000 }),
    textValue,
    (requestId, index, deleteCount, insert) => {
      assert.deepEqual(parseEditorAppMessage({
        type: 'splice',
        requestId,
        revision: requestId,
        index,
        deleteCount,
        insert,
      }), {
        type: 'splice',
        requestId,
        revision: requestId,
        index,
        deleteCount,
        insert,
      });
    },
  ), { numRuns: 200 });

  fc.assert(fc.property(fc.uuid({ version: 4 }), textValue, (sessionId, text) => {
    const message = {
      type: 'snapshot',
      snapshot: {
        state: 'ready',
        revision: sessionId,
        text,
        participants: [{
          color: 0,
          label: 'You',
          local: true,
          selection: { anchor: 0, focus: text.length },
          sessionId,
        }],
      },
    };
    assert.deepEqual(parseEditorHostMessage(message), message);
  }), { numRuns: 200 });
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
