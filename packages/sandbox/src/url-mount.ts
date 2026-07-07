export const sandboxUrlMountProtocol = 'sandbox.url-mount@1';
export const sandboxUrlMountPrefix = '/__sandbox__/mounts/';
export const sandboxUrlMountScope = '/__sandbox__/';
export const sandboxUrlMountWorkerUrl = '/sandbox-url-mount-sw.js';

export type SandboxUrlMountPath = readonly [string, ...string[]];

export type SandboxUrlMountFile = {
  readonly mediaType: string;
  readonly path: SandboxUrlMountPath;
  readonly text: string;
};

export function sandboxUrlMountEntryUrl(mountId: string, entryPath: SandboxUrlMountPath): string {
  const path = sandboxUrlPath(entryPath);
  return `${sandboxUrlMountPrefix}${mountId}/${path}`;
}

export function sandboxUrlMountRequest(pathname: string): { readonly mountId: string; readonly path: readonly string[] } | undefined {
  const [mountId, ...path] = pathname.slice(sandboxUrlMountPrefix.length).split('/');
  try {
    return { mountId, path: path.map(decodeURIComponent) };
  } catch {
    return undefined;
  }
}

export function sandboxUrlMountPathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

export function sandboxUrlMountHeaders(mediaType: string, mountId: string, origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': 'null',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': sandboxUrlMountCsp(origin, mountId),
    'Content-Type': mediaType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sandboxUrlPath(path: readonly string[]): string {
  return path.map(encodeURIComponent).join('/');
}

function sandboxUrlMountCsp(origin: string, mountId: string): string {
  const mountRoot = `${origin}${sandboxUrlMountPrefix}${mountId}/`;
  return `
    default-src 'none';
    base-uri 'none';
    connect-src 'none';
    font-src data:;
    form-action 'none';
    frame-src 'none';
    img-src ${mountRoot} data:;
    media-src data:;
    object-src 'none';
    script-src ${mountRoot} 'unsafe-inline';
    style-src ${mountRoot} 'unsafe-inline';
    worker-src 'none';
  `;
}
