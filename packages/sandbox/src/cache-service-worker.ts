const SANDBOX_CACHE_PREFIX = '@patchpit/sandbox-cache/v1/';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type SandboxCacheStorage = Pick<CacheStorage, 'delete' | 'keys' | 'match' | 'open'>;

export type SandboxCacheFetchEvent = {
  readonly request: Request;
  readonly respondWith: (response: Promise<Response>) => void;
};

export const sandboxCacheName = (mountId: string): string => {
  if (!UUID_PATTERN.test(mountId)) throw new Error(`Invalid sandbox mount UUID: ${mountId}`);
  return `${SANDBOX_CACHE_PREFIX}${mountId}`;
};

export const respondFromSandboxCache = async (
  request: Request,
  scopeUrl: string | URL,
  cacheStorage: SandboxCacheStorage = caches,
): Promise<Response> => {
  const scope = new URL(scopeUrl);
  const url = new URL(request.url);
  const relativePath = scope.pathname.endsWith('/')
    && url.origin === scope.origin
    && url.pathname.startsWith(scope.pathname)
    ? url.pathname.slice(scope.pathname.length)
    : undefined;
  const separator = relativePath?.indexOf('/') ?? -1;
  const mountId = separator < 0 ? undefined : relativePath?.slice(0, separator);
  const head = request.method === 'HEAD';
  if (mountId === undefined || !UUID_PATTERN.test(mountId)) return notFound(head);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return failedResponse('Method not allowed', 405, { Allow: 'GET, HEAD' });
  }

  const cached = await cacheStorage.match(`${url.origin}${url.pathname}`, {
    cacheName: sandboxCacheName(mountId),
  });
  if (cached === undefined) return notFound(head);
  return head
    ? new Response(null, { headers: cached.headers, status: cached.status, statusText: cached.statusText })
    : cached;
};

export const respondToSandboxCacheFetch = (
  event: SandboxCacheFetchEvent,
  scopeUrl: string | URL,
  cacheStorage: SandboxCacheStorage = caches,
): void => {
  event.respondWith(respondFromSandboxCache(event.request, scopeUrl, cacheStorage));
};

const notFound = (head = false) => failedResponse(head ? null : 'Not found', 404);

const failedResponse = (
  body: string | null,
  status: number,
  headers: Record<string, string> = {},
) => new Response(body, {
  headers: {
    'Content-Security-Policy': `default-src 'none'; sandbox`,
    'Content-Type': 'text/plain',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  },
  status,
});
