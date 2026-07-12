import {
  installSandboxCacheMount,
  sandboxCacheServiceWorkerUrls,
  type InstalledSandboxCacheMount,
  type SandboxCacheSnapshot,
} from '@patchpit/sandbox';

export type BrowserSandboxHost = ReturnType<typeof openBrowserSandboxHost>;

export const openBrowserSandboxHost = (baseUrl: string | URL) => {
  const base = new URL(baseUrl, window.location.origin);
  if (base.origin !== window.location.origin) {
    throw new Error('Cross-origin sandbox runners are not wired yet');
  }
  const mounts = new Set<InstalledSandboxCacheMount>();
  let registration: Promise<ServiceWorkerRegistration> | undefined;
  let closed = false;
  const ensureWorker = () => registration ??= registerSandboxWorker(base);

  return {
    install: async (snapshot: SandboxCacheSnapshot, signal?: AbortSignal) => {
      if (closed) throw new Error('Sandbox host is closed');
      signal?.throwIfAborted();
      await ensureWorker();
      signal?.throwIfAborted();
      const mount = await installSandboxCacheMount(snapshot, { baseUrl: base });
      if (closed || signal?.aborted === true) {
        await mount.close();
        signal?.throwIfAborted();
        throw new Error('Sandbox host is closed');
      }
      mounts.add(mount);
      return {
        frameAttributes: mount.frameAttributes,
        close: async () => {
          mounts.delete(mount);
          await mount.close();
        },
      };
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await Promise.all([...mounts].map((mount) => mount.close()));
      mounts.clear();
    },
  };
};

const registerSandboxWorker = async (baseUrl: URL) => {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
  const { scope, script } = sandboxCacheServiceWorkerUrls(baseUrl);
  const registration = await navigator.serviceWorker.register(script, {
    scope,
    type: 'module',
    updateViaCache: 'none',
  });
  const worker = registration.installing ?? registration.waiting;
  if (worker === null) {
    if (registration.active !== null) return registration;
    throw new Error('Sandbox service worker did not install');
  }
  if (worker.state === 'activated') return registration;
  await new Promise<void>((resolve, reject) => {
    const changed = () => {
      if (worker.state === 'activated') resolve();
      if (worker.state === 'redundant') reject(new Error('Sandbox service worker became redundant'));
    };
    worker.addEventListener('statechange', changed);
    changed();
  });
  return registration;
};
