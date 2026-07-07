import assert from 'node:assert/strict';
import test from 'node:test';
import { sandboxUrlMountProtocol } from './url-mount';

type Listener = (event: never) => void;

void test('sandbox URL mount worker materializes, serves, and unmounts files', async () => {
  const listeners = new Map<string, Listener[]>();
  const cacheStores = new Map<string, FakeCache>();

  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    value: {
      clients: { claim: async () => undefined },
      location: { origin: 'https://patchpit.test' },
      skipWaiting: async () => undefined,
      addEventListener(type: string, listener: Listener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    },
  });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      delete: async (name: string) => cacheStores.delete(name),
      keys: async () => [...cacheStores.keys()],
      open: async (name: string) => {
        const cache = cacheStores.get(name) ?? new FakeCache();
        cacheStores.set(name, cache);
        return cache;
      },
    },
  });

  await import('./sandbox-url-mount-sw');

  const mountAcks: unknown[] = [];
  await dispatch('message', {
    data: {
      files: [{ contentType: 'text/html', path: ['index.html'], text: '<p>mounted</p>' }],
      mountId: 'mount-1',
      protocol: sandboxUrlMountProtocol,
      type: 'mount',
    },
    ports: [{ postMessage(message: unknown) { mountAcks.push(message); } }],
  });
  assert.deepEqual(mountAcks, [{}]);

  const response = await fetchResponse('https://patchpit.test/__sandbox__/mounts/mount-1/index.html');
  assert.equal(response?.status, 200);
  assert.equal(await response?.text(), '<p>mounted</p>');

  const unmountAcks: unknown[] = [];
  await dispatch('message', {
    data: { mountId: 'mount-1', protocol: sandboxUrlMountProtocol, type: 'unmount' },
    ports: [{ postMessage(message: unknown) { unmountAcks.push(message); } }],
  });

  assert.deepEqual(unmountAcks, [{}]);
  assert.deepEqual(await (globalThis.caches as CacheStorage).keys(), []);
  assert.equal(await fetchResponse('https://patchpit.test/__sandbox__/other/index.html'), undefined);

  async function fetchResponse(url: string): Promise<Response | undefined> {
    let response: Promise<Response> | undefined;
    await dispatch('fetch', {
      request: new Request(url),
      respondWith(nextResponse: Response | Promise<Response>) {
        response = Promise.resolve(nextResponse);
      },
    });
    return response;
  }

  async function dispatch(type: string, event: object): Promise<void> {
    await Promise.all((listeners.get(type) ?? []).map((listener) => {
      const waits: Promise<unknown>[] = [];
      listener({ ...event, waitUntil: (promise: Promise<unknown>) => waits.push(promise) } as never);
      return Promise.all(waits);
    }));
  }
});

class FakeCache {
  readonly responses = new Map<string, Response>();

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.responses.set(requestUrl(request), response);
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.responses.get(requestUrl(request))?.clone();
  }
}

function requestUrl(request: RequestInfo | URL): string {
  return typeof request === 'string' || request instanceof URL ? request.toString() : request.url;
}
