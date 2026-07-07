import {
  sandboxUrlMountHeaders,
  sandboxUrlMountPathKey,
  sandboxUrlMountPrefix,
  sandboxUrlMountProtocol,
  sandboxUrlMountRequest,
  type SandboxUrlMountFile,
} from './url-mount';

const worker = self as unknown as SandboxWorker;
const mountedFilesByMountId = new Map<string, Map<string, SandboxUrlMountFile>>();

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
worker.addEventListener('install', (event) => event.waitUntil(worker.skipWaiting()));
worker.addEventListener('activate', (event) => event.waitUntil(worker.clients.claim()));

worker.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.protocol !== sandboxUrlMountProtocol) return;

  if (message.type === 'mount') {
    mountedFilesByMountId.set(message.mountId, new Map(message.files.map((file) => [sandboxUrlMountPathKey(file.path), file])));
    event.ports[0]?.postMessage({ ok: true, protocol: sandboxUrlMountProtocol, type: 'mounted' });
  }

  if (message.type === 'unmount') {
    mountedFilesByMountId.delete(message.mountId);
    event.ports[0]?.postMessage({ ok: true, protocol: sandboxUrlMountProtocol, type: 'unmounted' });
  }
});

worker.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin || !url.pathname.startsWith(sandboxUrlMountPrefix)) return;
  event.respondWith(mountedFileResponse(event.request, url));
});

function mountedFileResponse(request: Request, url: URL): Response {
  const requestTarget = sandboxUrlMountRequest(url.pathname);
  if (requestTarget === undefined) return plainTextResponse(404, 'Invalid sandbox file path');
  const file = mountedFilesByMountId.get(requestTarget.mountId)?.get(sandboxUrlMountPathKey(requestTarget.path));
  if (file === undefined) return plainTextResponse(404, 'Sandbox file not found');

  return new Response(request.method === 'HEAD' ? null : file.text, {
    headers: sandboxUrlMountHeaders(file.mediaType, requestTarget.mountId, worker.location.origin),
  });
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
