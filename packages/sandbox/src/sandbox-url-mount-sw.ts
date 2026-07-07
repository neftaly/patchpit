import {
  sandboxUrlMountCacheName,
  sandboxUrlMountCacheNamePrefix,
  sandboxUrlMountDev,
  sandboxUrlMountPrefix,
  sandboxUrlMountProtocol,
  sandboxUrlMountRequestUrl,
  sandboxUrlMountRequest,
  sandboxUrlMountStoredFiles,
  type SandboxUrlMountFile,
} from './url-mount';

const worker = self as unknown as SandboxWorker;

type SandboxUrlMountMessage =
  | {
      readonly files: readonly SandboxUrlMountFile[];
      readonly mountId: string;
      readonly protocol: typeof sandboxUrlMountProtocol;
      readonly type: 'mount';
    }
  | {
      readonly mountId: string;
      readonly protocol: typeof sandboxUrlMountProtocol;
      readonly type: 'unmount';
    };

type SandboxWorker = {
  readonly clients: { claim(): Promise<void> };
  readonly location: { readonly origin: string };
  addEventListener(type: string, listener: (event: SandboxWorkerEvent) => void): void;
  skipWaiting(): Promise<void>;
};

type SandboxWorkerEvent = {
  readonly data: SandboxUrlMountMessage;
  readonly ports: readonly MessagePort[];
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
};

// URL mount server only; runtime owns policy, resolution, and bytes.
worker.addEventListener('install', (event) => {
  if (sandboxUrlMountDev) event.waitUntil(worker.skipWaiting());
});
worker.addEventListener('activate', (event) => {
  event.waitUntil(sandboxUrlMountDev
    ? Promise.all([worker.clients.claim(), deleteSandboxUrlMountCaches()])
    : worker.clients.claim());
});

worker.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.protocol !== sandboxUrlMountProtocol) return;

  if (message.type === 'mount') {
    event.waitUntil(ack(event, mountFiles(message.mountId, message.files)));
  }

  if (message.type === 'unmount') {
    event.waitUntil(ack(event, unmountFiles(message.mountId)));
  }
});

worker.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin || !url.pathname.startsWith(sandboxUrlMountPrefix)) return;
  event.respondWith(mountedFileResponse(event.request, url));
});

async function mountFiles(mountId: string, files: readonly SandboxUrlMountFile[]): Promise<void> {
  const cache = await caches.open(sandboxUrlMountCacheName(mountId));
  await Promise.all(sandboxUrlMountStoredFiles(worker.location.origin, mountId, files)
    .map((file) => cache.put(file.url, new Response(file.text, { headers: file.headers }))));
}

async function unmountFiles(mountId: string): Promise<void> {
  await caches.delete(sandboxUrlMountCacheName(mountId));
}

async function mountedFileResponse(request: Request, url: URL): Promise<Response> {
  const requestTarget = sandboxUrlMountRequest(url.pathname);
  if (requestTarget === undefined) return plainTextResponse(404, 'Invalid sandbox file path');
  const cache = await caches.open(sandboxUrlMountCacheName(requestTarget.mountId));
  const response = await cache.match(sandboxUrlMountRequestUrl(worker.location.origin, requestTarget));
  if (response === undefined) return plainTextResponse(404, 'Sandbox file not found');

  return new Response(request.method === 'HEAD' ? null : response.body, {
    headers: response.headers,
  });
}

async function deleteSandboxUrlMountCaches(): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames
    .filter((cacheName) => cacheName.startsWith(sandboxUrlMountCacheNamePrefix()))
    .map((cacheName) => caches.delete(cacheName)));
}

async function ack(event: SandboxWorkerEvent, action: Promise<void>): Promise<void> {
  try {
    await action;
    event.ports[0]?.postMessage({});
  } catch (error) {
    event.ports[0]?.postMessage({ error: String(error) });
  }
}

function plainTextResponse(status: number, text: string): Response {
  return new Response(text, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
    status,
  });
}
