import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installSandboxCacheMount,
  respondFromSandboxCache,
  respondToSandboxCacheFetch,
  sandboxCacheName,
  sandboxCacheServiceWorkerUrls,
  type SandboxCacheStorage,
} from '@patchpit/sandbox';

const firstId = '123e4567-e89b-42d3-a456-426614174000' as const;
const secondId = '123e4567-e89b-42d3-b456-426614174001' as const;

void test('materializes an immutable UUID mount under a Pages base path', async () => {
  const storage = memoryCacheStorage();
  const bytes = new Uint8Array([1, 2, 3]);
  const mount = await installSandboxCacheMount({
    entry: ['index.html'],
    files: [{
      path: ['index.html'],
      read: () => ({ body: '<script type="module" src="./assets/app.js"></script>', contentType: 'text/html' }),
    }, {
      path: ['assets', 'app.js'],
      read: () => ({ body: bytes, contentType: 'text/javascript' }),
    }],
  }, {
    baseUrl: 'https://patchpit.test/patchpit/',
    cacheStorage: storage,
    randomUUID: () => firstId,
  });
  bytes.fill(9);

  assert.equal(mount.frameAttributes.src, `https://patchpit.test/patchpit/__patchpit/sandbox/${firstId}/index.html`);
  assert.equal(mount.scopePath, `/patchpit/__patchpit/sandbox/${firstId}/`);
  const scriptUrl = `https://patchpit.test/patchpit/__patchpit/sandbox/${firstId}/assets/app.js?ignored=1`;
  const script = await respondFromSandboxCache(
    new Request(scriptUrl),
    'https://patchpit.test/patchpit/__patchpit/sandbox/',
    storage,
  );
  assert.equal(script.status, 200);
  assert.deepEqual(new Uint8Array(await script.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal(script.headers.get('Content-Type'), 'text/javascript');

  const head = await respondFromSandboxCache(
    new Request(scriptUrl, { method: 'HEAD' }),
    'https://patchpit.test/patchpit/__patchpit/sandbox/',
    storage,
  );
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Content-Type'), 'text/javascript');
  assert.equal(await head.text(), '');
});

void test('cleanup is idempotent and requests fail closed', async () => {
  const storage = memoryCacheStorage();
  const mount = await installSandboxCacheMount({
    entry: ['index.html'],
    files: [{ path: ['index.html'], read: () => ({ body: 'ok', contentType: 'text/html' }) }],
  }, {
    baseUrl: 'https://patchpit.test/',
    cacheStorage: storage,
    randomUUID: () => firstId,
  });
  const scope = 'https://patchpit.test/__patchpit/sandbox/';

  for (const request of [
    new Request('https://patchpit.test/outside'),
    new Request(`${scope}not-a-uuid/index.html`),
    new Request(`${scope}${secondId}/index.html`),
    new Request(`${scope}${firstId}/missing.txt`),
  ]) {
    assert.equal((await respondFromSandboxCache(request, scope, storage)).status, 404);
  }
  const missingHead = await respondFromSandboxCache(
    new Request(`${scope}${firstId}/missing.txt`, { method: 'HEAD' }),
    scope,
    storage,
  );
  assert.equal(missingHead.status, 404);
  assert.equal(await missingHead.text(), '');
  assert.deepEqual(await storage.keys(), [sandboxCacheName(firstId)]);
  const denied = await respondFromSandboxCache(
    new Request(mount.frameAttributes.src, { method: 'POST' }),
    scope,
    storage,
  );
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get('Allow'), 'GET, HEAD');
  assert.equal(denied.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(denied.headers.get('Content-Security-Policy') ?? '', /sandbox/);

  await mount.close();
  await mount.close();
  assert.equal((await respondFromSandboxCache(new Request(mount.frameAttributes.src), scope, storage)).status, 404);
});

void test('service worker fetch adapter claims requests synchronously', async () => {
  const storage = memoryCacheStorage();
  let response: Promise<Response> | undefined;
  respondToSandboxCacheFetch({
    request: new Request('https://patchpit.test/__patchpit/sandbox/not-a-mount'),
    respondWith: (nextResponse) => { response = nextResponse; },
  }, 'https://patchpit.test/__patchpit/sandbox/', storage);
  assert.equal((await response)?.status, 404);
});

void test('UUID allocation rejects colliding caches', async () => {
  const storage = memoryCacheStorage();
  await storage.open(sandboxCacheName(firstId));
  const candidates = [firstId, firstId, firstId, firstId];
  await assert.rejects(() => installSandboxCacheMount({
    entry: ['index.html'],
    files: [{ path: ['index.html'], read: () => ({ body: 'ok' }) }],
  }, {
    baseUrl: 'https://patchpit.test/',
    cacheStorage: storage,
    randomUUID: () => candidates.shift() ?? firstId,
  }), /allocate a unique sandbox mount UUID/);

});

void test('service worker locations preserve root and GitHub Pages bases', () => {
  assert.deepEqual(sandboxCacheServiceWorkerUrls('https://patchpit.test/'), {
    scope: 'https://patchpit.test/__patchpit/sandbox/',
    script: 'https://patchpit.test/__patchpit/sandbox/service-worker.js',
  });
  assert.deepEqual(sandboxCacheServiceWorkerUrls('https://patchpit.test/patchpit/'), {
    scope: 'https://patchpit.test/patchpit/__patchpit/sandbox/',
    script: 'https://patchpit.test/patchpit/__patchpit/sandbox/service-worker.js',
  });
});

const memoryCacheStorage = (): SandboxCacheStorage => {
  const stores = new Map<string, Map<string, Response>>();
  return {
    delete: async (name) => stores.delete(name),
    keys: async () => [...stores.keys()],
    match: async (request, options) => {
      if (options?.cacheName !== undefined) {
        return stores.get(options.cacheName)?.get(requestUrl(request))?.clone();
      }
      for (const store of stores.values()) {
        const response = store.get(requestUrl(request));
        if (response !== undefined) return response.clone();
      }
      return undefined;
    },
    open: async (name) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (request: RequestInfo | URL) => store.get(requestUrl(request))?.clone(),
        put: async (request: RequestInfo | URL, response: Response) => {
          store.set(requestUrl(request), response.clone());
        },
      } as Cache;
    },
  };
};

const requestUrl = (request: RequestInfo | URL) => request instanceof Request
  ? request.url
  : request instanceof URL ? request.toString() : new Request(request).url;
