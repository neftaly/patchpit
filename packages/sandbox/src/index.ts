import {
  sandboxUrlMountEntryUrl,
  sandboxUrlMountDev,
  sandboxUrlMountProtocol,
  sandboxUrlMountScope,
  sandboxUrlMountWorkerUrl,
  type SandboxUrlMountFile,
  type SandboxUrlMountPath,
} from './url-mount';

const SERVICE_WORKER_ACK_TIMEOUT_MS = 5000;
const SANDBOX_DOCUMENT_PATH_BASE = new URL('https://sandbox.local/');

export type SandboxDocument = {
  readonly url: string;
  dispose(): void;
};

export type SandboxDocumentFile = {
  readonly contentType: string;
  readonly path: string;
  readonly text: string;
};

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

type SandboxUrlMountAck = {
  readonly error?: string;
};

export async function createSandboxDocument({
  entry,
  files,
}: {
  readonly entry: string;
  readonly files: readonly SandboxDocumentFile[];
}): Promise<SandboxDocument> {
  const entryMountPath = sandboxDocumentPath(entry);
  const mountedFiles = files.map(sandboxDocumentMountFile);
  const serviceWorker = await activeSandboxUrlMountWorker();
  const mountId = crypto.randomUUID();
  await postUrlMountMessage(serviceWorker, {
    files: mountedFiles,
    mountId,
    protocol: sandboxUrlMountProtocol,
    type: 'mount',
  });

  return {
    url: sandboxUrlMountEntryUrl(mountId, entryMountPath),
    dispose: () => {
      void postUrlMountMessage(serviceWorker, {
        mountId,
        protocol: sandboxUrlMountProtocol,
        type: 'unmount',
      }).catch(() => undefined);
    },
  };
}

function sandboxDocumentMountFile(file: SandboxDocumentFile): SandboxUrlMountFile {
  return {
    contentType: file.contentType,
    path: sandboxDocumentPath(file.path),
    text: file.text,
  };
}

function sandboxDocumentPath(path: string): SandboxUrlMountPath {
  if (path.length === 0) throw new Error('Sandbox document paths must not be empty.');
  if (path.startsWith('/') || path.startsWith('\\')) {
    throw new Error(`Sandbox document paths must be relative: ${path}`);
  }

  const url = new URL(path, SANDBOX_DOCUMENT_PATH_BASE);
  if (url.origin !== SANDBOX_DOCUMENT_PATH_BASE.origin) {
    throw new Error(`Sandbox document paths must be relative: ${path}`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error(`Sandbox document paths must not include a query or fragment: ${path}`);
  }

  const pathKey = url.pathname.slice(1);
  if (pathKey === '') throw new Error(`Sandbox document paths must name a file: ${path}`);

  const pathSegments = pathKey.split('/').map((segment) => decodeURIComponent(segment));
  const [firstSegment, ...remainingSegments] = pathSegments;
  if (firstSegment === undefined) throw new Error(`Sandbox document paths must name a file: ${path}`);

  return [firstSegment, ...remainingSegments];
}

async function activeSandboxUrlMountWorker(): Promise<ServiceWorker> {
  const registration = await sandboxUrlMountWorkerRegistration();
  if (sandboxUrlMountDev) await registration.update();
  const serviceWorker = sandboxUrlMountDev
    ? registration.installing ?? registration.waiting ?? registration.active
    : registration.active ?? registration.installing ?? registration.waiting;
  if (serviceWorker === null) {
    throw new Error('Sandbox service worker registration did not create a worker.');
  }
  if (serviceWorker.state === 'activated') return serviceWorker;
  if (serviceWorker.state === 'redundant') throw new Error('Sandbox service worker became redundant.');
  return new Promise((resolve, reject) => {
    serviceWorker.addEventListener('statechange', () => {
      if (serviceWorker.state === 'activated') resolve(serviceWorker);
      if (serviceWorker.state === 'redundant') reject(new Error('Sandbox service worker became redundant.'));
    });
  });
}

async function sandboxUrlMountWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Sandbox service worker is unavailable.');
  }
  return navigator.serviceWorker.register(sandboxUrlMountWorkerUrl, {
    scope: sandboxUrlMountScope,
    type: 'module',
  });
}

function postUrlMountMessage(serviceWorker: ServiceWorker, message: SandboxUrlMountMessage): Promise<void> {
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Sandbox service worker did not acknowledge the message.'));
    }, SERVICE_WORKER_ACK_TIMEOUT_MS);
    channel.port1.addEventListener('message', (event: MessageEvent<SandboxUrlMountAck>) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (event.data?.error !== undefined) reject(new Error(event.data.error));
      else resolve();
    }, { once: true });
    channel.port1.start();
    try {
      serviceWorker.postMessage(message, [channel.port2]);
    } catch (error) {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      reject(error);
    }
  });
}
