export const sandboxUrlMountProtocol = 'sandbox.url-mount@1';
export const sandboxUrlMountPrefix = '/__sandbox__/mounts/';
export const sandboxUrlMountScope = '/__sandbox__/';
export const sandboxUrlMountDev = import.meta.env?.DEV === true;
export const sandboxUrlMountWorkerUrl = sandboxUrlMountDev ? '/dev-sw.js?dev-sw' : '/sandbox-url-mount-sw.mjs';
export const sandboxUrlMountCachePrefix = `${sandboxUrlMountProtocol}:`;

export type SandboxUrlMountPath = readonly [string, ...string[]];

export type SandboxUrlMountFile = {
  readonly contentType: string;
  readonly path: SandboxUrlMountPath;
  readonly text: string;
};

export type SandboxUrlMountMessage =
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

export type SandboxUrlMountStoredFile = {
  readonly headers: HeadersInit;
  readonly text: string;
  readonly url: string;
};

export function sandboxUrlMountEntryUrl(mountId: string, entry: SandboxUrlMountPath): string {
  return `${sandboxUrlMountPrefix}${mountId}/${sandboxUrlMountPathKey(entry)}`;
}

export function sandboxUrlMountFileUrl(origin: string, mountId: string, path: SandboxUrlMountPath): string {
  return `${sandboxUrlMountRootUrl(origin, mountId)}${sandboxUrlMountPathKey(path)}`;
}

export function sandboxUrlMountPathKey(path: readonly string[]): string {
  return path.map(encodeURIComponent).join('/');
}

export function sandboxUrlMountRequestUrl(
  origin: string,
  request: { readonly mountId: string; readonly pathKey: string },
): string {
  return `${sandboxUrlMountRootUrl(origin, request.mountId)}${request.pathKey}`;
}

export function sandboxUrlMountRootUrl(origin: string, mountId: string): string {
  return `${origin}${sandboxUrlMountPrefix}${mountId}/`;
}

export function sandboxUrlMountRequest(pathname: string): { readonly mountId: string; readonly pathKey: string } | undefined {
  if (!pathname.startsWith(sandboxUrlMountPrefix)) return undefined;
  const target = pathname.slice(sandboxUrlMountPrefix.length);
  const pathStart = target.indexOf('/');
  return pathStart === -1
    ? undefined
    : { mountId: target.slice(0, pathStart), pathKey: target.slice(pathStart + 1) };
}

export function sandboxUrlMountCacheName(mountId: string): string {
  return `${sandboxUrlMountCachePrefix}${mountId}`;
}

export function sandboxUrlMountStoredFiles(
  origin: string,
  mountId: string,
  files: readonly SandboxUrlMountFile[],
): readonly SandboxUrlMountStoredFile[] {
  return files.map((file) => ({
    headers: sandboxUrlMountHeaders(file.contentType, mountId, origin),
    text: file.text,
    url: sandboxUrlMountFileUrl(origin, mountId, file.path),
  }));
}

export function sandboxUrlMountHeaders(contentType: string, mountId: string, origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': 'null',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': sandboxUrlMountCsp(origin, mountId),
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sandboxUrlMountCsp(origin: string, mountId: string): string {
  const mountRoot = sandboxUrlMountRootUrl(origin, mountId);
  return [
    `default-src 'none'`,
    `base-uri 'none'`,
    `connect-src 'none'`,
    `font-src data:`,
    `form-action 'none'`,
    `frame-src 'none'`,
    `img-src ${mountRoot} data:`,
    `media-src data:`,
    `object-src 'none'`,
    `sandbox allow-scripts`,
    `script-src ${mountRoot} 'unsafe-inline'`,
    `style-src ${mountRoot} 'unsafe-inline'`,
    `worker-src 'none'`,
  ].join('; ');
}
