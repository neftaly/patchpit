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
  return `${sandboxUrlMountPrefix}${mountId}/${sandboxUrlMountPathKey(entryPath)}`;
}

export function sandboxUrlMountPathKey(path: readonly string[]): string {
  return path.map(encodeURIComponent).join('/');
}

export function sandboxUrlMountRequest(pathname: string): { readonly mountId: string; readonly pathKey: string } | undefined {
  const target = pathname.slice(sandboxUrlMountPrefix.length);
  const pathStart = target.indexOf('/');
  return pathStart === -1
    ? undefined
    : { mountId: target.slice(0, pathStart), pathKey: target.slice(pathStart + 1) };
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
