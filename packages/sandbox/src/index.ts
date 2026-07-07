import {
  sandboxDocumentPath,
  sandboxUrlMountEntryUrl,
  sandboxUrlMountDev,
  sandboxUrlMountProtocol,
  sandboxUrlMountScope,
  sandboxUrlMountWorkerUrl,
  type SandboxUrlMountMessage,
} from './url-mount';

const SERVICE_WORKER_ACK_TIMEOUT_MS = 5000;

export type SandboxDocument = {
  readonly url: string;
  dispose(): void;
};

export type SandboxDocumentFile = {
  readonly contentType: string;
  readonly path: string;
  readonly text: string;
};

export const createSandboxDocument = async ({
  entry,
  files,
}: {
  readonly entry: string;
  readonly files: readonly SandboxDocumentFile[];
}): Promise<SandboxDocument> => {
  const entryMountPath = sandboxDocumentPath(entry);
  const serviceWorker = await activeSandboxUrlMountWorker();
  const mountId = crypto.randomUUID();
  await postUrlMountMessage(serviceWorker, {
    files: files.map((file) => ({
      contentType: file.contentType,
      path: sandboxDocumentPath(file.path),
      text: file.text,
    })),
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
};

async function activeSandboxUrlMountWorker(): Promise<ServiceWorker> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Sandbox service worker is unavailable.');
  }
  const registration = await navigator.serviceWorker.register(sandboxUrlMountWorkerUrl, {
    scope: sandboxUrlMountScope,
    type: 'module',
  });
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

function postUrlMountMessage(serviceWorker: ServiceWorker, message: SandboxUrlMountMessage): Promise<void> {
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Sandbox service worker did not acknowledge the message.'));
    }, SERVICE_WORKER_ACK_TIMEOUT_MS);
    channel.port1.addEventListener('message', (event: MessageEvent<{ readonly error?: string }>) => {
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
