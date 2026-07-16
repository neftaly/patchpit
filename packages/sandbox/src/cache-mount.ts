import {
  createSandboxFrameAttributes,
  indexSandboxFiles,
  sandboxFileResponse,
  sandboxMountScopePath,
  type SandboxFile,
  type SandboxFrameAttributes,
} from './document.ts';
import type { SandboxDocumentPath } from './path.ts';
import { sandboxCacheName, type SandboxCacheStorage } from './cache-service-worker.ts';

export type SandboxCacheSnapshot = {
  readonly entry: SandboxDocumentPath;
  readonly files: readonly SandboxFile[];
};

export type InstalledSandboxCacheMount = {
  readonly close: () => Promise<void>;
  readonly frameAttributes: SandboxFrameAttributes;
  readonly mountId: string;
  readonly scopePath: string;
};

export type InstallSandboxCacheMountOptions = {
  readonly baseUrl: string | URL;
  readonly cacheStorage?: SandboxCacheStorage;
  readonly randomUUID?: () => `${string}-${string}-${string}-${string}-${string}`;
};

export const installSandboxCacheMount = async (
  snapshot: SandboxCacheSnapshot,
  {
    baseUrl,
    cacheStorage = caches,
    randomUUID = () => crypto.randomUUID(),
  }: InstallSandboxCacheMountOptions,
): Promise<InstalledSandboxCacheMount> => {
  const base = directoryUrl(baseUrl);
  const route = [...base.pathname.split('/').filter(Boolean).map(decodeURIComponent), '__patchpit', 'sandbox'];
  const existingCaches = new Set(await cacheStorage.keys());
  let mountId: string | undefined;
  for (let attempts = 0; attempts < 4 && mountId === undefined; attempts += 1) {
    const candidate = randomUUID();
    const name = sandboxCacheName(candidate);
    if (!existingCaches.has(name)) mountId = candidate;
  }
  if (mountId === undefined) throw new Error('Could not allocate a unique sandbox mount UUID');

  const files = indexSandboxFiles(snapshot.entry, snapshot.files);
  const scopePath = sandboxMountScopePath(route, mountId);
  const cacheName = sandboxCacheName(mountId);
  try {
    const cache = await cacheStorage.open(cacheName);
    for (const [path, file] of files) {
      const content = await file.read();
      if (content === undefined) throw new Error(`Could not read sandbox snapshot file: ${path}`);
      const url = new URL(path, `${base.origin}${scopePath}`);
      await cache.put(url.toString(), sandboxFileResponse(content));
    }
  } catch (error) {
    await cacheStorage.delete(cacheName);
    throw error;
  }

  let closed = false;
  return {
    close: async () => {
      if (closed) return;
      await cacheStorage.delete(cacheName);
      closed = true;
    },
    frameAttributes: createSandboxFrameAttributes({ baseUrl: base, entry: snapshot.entry, mountId, route }),
    mountId,
    scopePath,
  };
};

export const sandboxCacheServiceWorkerUrls = (baseUrl: string | URL) => {
  const base = directoryUrl(baseUrl);
  const scope = new URL('__patchpit/sandbox/', base);
  return {
    scope: scope.toString(),
    script: new URL('service-worker.js', scope).toString(),
  };
};

const directoryUrl = (baseUrl: string | URL): URL => {
  const url = new URL(baseUrl);
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url;
};
