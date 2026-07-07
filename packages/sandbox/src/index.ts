import {
  sandboxUrlMountEntryUrl,
  sandboxUrlMountProtocol,
  sandboxUrlMountScope,
  sandboxUrlMountWorkerUrl,
  type SandboxUrlMountPath,
  type SandboxUrlMountFile,
} from './url-mount';

export type { SandboxUrlMountFile, SandboxUrlMountPath } from './url-mount';

export type SandboxUrlMount = {
  readonly entryUrl: string;
  unmount(): void;
};

export async function createSandboxUrlMount({
  entryPath,
  files,
}: {
  readonly entryPath: SandboxUrlMountPath;
  readonly files: readonly SandboxUrlMountFile[];
}): Promise<SandboxUrlMount> {
  const serviceWorker = await activeSandboxUrlMountWorker();
  const mountId = crypto.randomUUID();
  await postUrlMountMessage(serviceWorker, {
    files,
    mountId,
    protocol: sandboxUrlMountProtocol,
    type: 'mount',
  });

  return {
    entryUrl: sandboxUrlMountEntryUrl(mountId, entryPath),
    unmount: () => {
      void postUrlMountMessage(serviceWorker, {
        mountId,
        protocol: sandboxUrlMountProtocol,
        type: 'unmount',
      });
    },
  };
}

async function activeSandboxUrlMountWorker(): Promise<ServiceWorker> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Sandbox service worker is unavailable.');
  }
  const registration = await navigator.serviceWorker.register(sandboxUrlMountWorkerUrl, { scope: sandboxUrlMountScope });
  if (registration.active !== null) return registration.active;
  const serviceWorker = registration.installing ?? registration.waiting;
  if (serviceWorker === null) {
    throw new Error('Sandbox service worker registration did not create a worker.');
  }
  return new Promise((resolve, reject) => {
    serviceWorker.addEventListener('statechange', () => {
      if (serviceWorker.state === 'activated') resolve(serviceWorker);
      if (serviceWorker.state === 'redundant') reject(new Error('Sandbox service worker became redundant.'));
    });
  });
}

function postUrlMountMessage(serviceWorker: ServiceWorker, message: unknown): Promise<void> {
  const channel = new MessageChannel();
  serviceWorker.postMessage(message, [channel.port2]);
  return new Promise((resolve) => {
    channel.port1.addEventListener('message', () => resolve(), { once: true });
    channel.port1.start();
  });
}
