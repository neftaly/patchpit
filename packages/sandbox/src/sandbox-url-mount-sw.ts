const urlMountProtocol = 'sandbox.url-mount@1';
const urlMountPrefix = '/__sandbox__/mounts/';
const worker = self as unknown as SandboxWorker;
const mountedFilesByMountId = new Map<string, Map<string, SandboxMountedFile>>();

type SandboxMountedFile = {
  readonly mediaType: string;
  readonly path: string;
  readonly text: string;
};

type SandboxWorker = {
  readonly clients: { claim(): Promise<void> };
  readonly location: { readonly origin: string };
  addEventListener(type: string, listener: (event: SandboxWorkerEvent) => void): void;
  skipWaiting(): Promise<void>;
};

type SandboxWorkerEvent = {
  readonly data: {
    readonly files?: readonly SandboxMountedFile[];
    readonly mountId: string;
    readonly protocol?: string;
    readonly type?: string;
  };
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
  if (message?.protocol !== urlMountProtocol) return;

  if (message.type === 'mount') {
    mountedFilesByMountId.set(message.mountId, new Map(message.files!.map((file) => [file.path, file])));
    event.ports[0]?.postMessage({ ok: true, protocol: urlMountProtocol, type: 'mounted' });
  }

  if (message.type === 'unmount') {
    mountedFilesByMountId.delete(message.mountId);
    event.ports[0]?.postMessage({ ok: true, protocol: urlMountProtocol, type: 'unmounted' });
  }
});

worker.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin || !url.pathname.startsWith(urlMountPrefix)) return;
  event.respondWith(mountedFileResponse(event.request, url));
});

function mountedFileResponse(request: Request, url: URL): Response {
  const requestTarget = mountedFileRequest(url);
  if (requestTarget === undefined) return plainTextResponse(404, 'Invalid sandbox file path');
  const file = mountedFilesByMountId.get(requestTarget.mountId)?.get(requestTarget.path);
  if (file === undefined) return plainTextResponse(404, 'Sandbox file not found');

  return new Response(request.method === 'HEAD' ? null : file.text, {
    headers: mountedFileHeaders(file.mediaType, requestTarget.mountId),
  });
}

function mountedFileRequest(url: URL): { readonly mountId: string; readonly path: string } | undefined {
  const [mountId, ...path] = url.pathname.slice(urlMountPrefix.length).split('/');
  try {
    return { mountId, path: decodeURIComponent(path.join('/')) };
  } catch {
    return undefined;
  }
}

function mountedFileHeaders(mediaType: string, mountId: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': 'null',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': sandboxUrlMountCsp(mountId),
    'Content-Type': mediaType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sandboxUrlMountCsp(mountId: string): string {
  const mountRoot = `${worker.location.origin}${urlMountPrefix}${mountId}/`;
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "font-src data:",
    "form-action 'none'",
    "frame-src 'none'",
    `img-src ${mountRoot} data:`,
    "media-src data:",
    "object-src 'none'",
    `script-src ${mountRoot} 'unsafe-inline'`,
    `style-src ${mountRoot} 'unsafe-inline'`,
    "worker-src 'none'",
  ].join('; ');
}

function plainTextResponse(status: number, text: string): Response {
  return new Response(text, {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    status,
  });
}
