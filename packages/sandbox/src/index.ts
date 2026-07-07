import {
  sandboxUrlMountEntryUrl,
  sandboxUrlMountProtocol,
  sandboxUrlMountScope,
  sandboxUrlMountWorkerUrl,
  type SandboxUrlMountPath,
  type SandboxUrlMountFile,
} from './url-mount';

export type { SandboxUrlMountFile, SandboxUrlMountPath } from './url-mount';

const SERVICE_WORKER_ACK_TIMEOUT_MS = 5000;

export type SandboxUrlMount = {
  readonly entryUrl: string;
  unmount(): void;
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
      }).catch(() => undefined);
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

function postUrlMountMessage(serviceWorker: ServiceWorker, message: SandboxUrlMountMessage): Promise<void> {
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Sandbox service worker did not acknowledge the message.'));
    }, SERVICE_WORKER_ACK_TIMEOUT_MS);
    channel.port1.addEventListener('message', () => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve();
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
