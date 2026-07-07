import assert from 'node:assert/strict';
import test from 'node:test';
import { createSandboxDocument } from './index';

void test('sandbox document API maps app-facing files to URL mount messages', async () => {
  const messages: unknown[] = [];
  const serviceWorker = {
    state: 'activated',
    addEventListener() {},
    postMessage(message: unknown, transfer: readonly Transferable[]) {
      messages.push(message);
      const [port] = transfer as readonly MessagePort[];
      port?.postMessage({});
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        register: async () => ({
          active: serviceWorker,
          installing: null,
          update: async () => undefined,
          waiting: null,
        }),
      },
    },
  });

  const sandboxDocument = await createSandboxDocument({
    entry: './index.html',
    files: [{
      contentType: 'image/svg+xml',
      path: 'assets/dir%20name/a%2Fb.svg',
      text: '<svg />',
    }],
  });

  assert.equal(Object.keys(await import('./index')).includes('sandboxUrlMountProtocol'), false);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], {
    files: [{
      contentType: 'image/svg+xml',
      path: ['assets', 'dir name', 'a/b.svg'],
      text: '<svg />',
    }],
    mountId: (messages[0] as { readonly mountId: string }).mountId,
    protocol: 'sandbox.url-mount@1',
    type: 'mount',
  });
  assert.equal(sandboxDocument.url, `/__sandbox__/mounts/${(messages[0] as { readonly mountId: string }).mountId}/index.html`);

  sandboxDocument.dispose();
  assert.deepEqual(messages[1], {
    mountId: (messages[0] as { readonly mountId: string }).mountId,
    protocol: 'sandbox.url-mount@1',
    type: 'unmount',
  });
});

void test('sandbox document API only accepts relative file paths', async () => {
  await assert.rejects(
    createSandboxDocument({
      entry: '/index.html',
      files: [],
    }),
    /relative/,
  );
});
