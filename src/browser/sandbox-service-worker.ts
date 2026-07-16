import { respondToSandboxCacheFetch, type SandboxCacheFetchEvent } from '@patchpit/sandbox';

type WorkerScope = {
  readonly clients: { claim: () => Promise<void> };
  readonly registration: { readonly scope: string };
  readonly skipWaiting: () => Promise<void>;
  readonly addEventListener: (
    type: 'activate' | 'fetch' | 'install',
    listener: (event: SandboxCacheFetchEvent | { readonly waitUntil: (work: Promise<void>) => void }) => void,
  ) => void;
};

const worker = globalThis as unknown as WorkerScope;

worker.addEventListener('install', (event) => {
  if ('waitUntil' in event) event.waitUntil(worker.skipWaiting());
});
worker.addEventListener('activate', (event) => {
  if ('waitUntil' in event) event.waitUntil(worker.clients.claim());
});
worker.addEventListener('fetch', (event) => {
  if ('request' in event) respondToSandboxCacheFetch(event, worker.registration.scope);
});
