export const sandboxUrlMountProtocol = 'sandbox.url-mount@1';
export const sandboxUrlMountPrefix = '/__sandbox__/mounts/';
export const sandboxUrlMountScope = '/__sandbox__/';
export const sandboxUrlMountDev = import.meta.env?.DEV === true;
export const sandboxUrlMountWorkerUrl = sandboxUrlMountDev ? '/dev-sw.js?dev-sw' : '/sandbox-url-mount-sw.mjs';
export const sandboxUrlMountCachePrefix = `${sandboxUrlMountProtocol}:`;
const sandboxDocumentPathBase = new URL('https://sandbox.local/');

export type SandboxUrlMountPath = readonly string[];

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

export const sandboxDocumentPath = (path: string): SandboxUrlMountPath => {
  const url = new URL(path, sandboxDocumentPathBase);
  const segments = url.pathname.slice(1).split('/').map((segment) => decodeURIComponent(segment));
  if (
    path === ''
    || path.startsWith('/')
    || path.startsWith('\\')
    || url.origin !== sandboxDocumentPathBase.origin
    || url.search !== ''
    || url.hash !== ''
    || segments[0] === ''
  ) {
    throw new Error(`Sandbox document paths must be relative file paths: ${path}`);
  }
  return segments;
};

export const sandboxUrlMountEntryUrl = (mountId: string, entry: SandboxUrlMountPath): string =>
  `${sandboxUrlMountPrefix}${mountId}/${sandboxUrlMountPathKey(entry)}`;

export const sandboxUrlMountFileUrl = (origin: string, mountId: string, path: SandboxUrlMountPath): string =>
  `${sandboxUrlMountRootUrl(origin, mountId)}${sandboxUrlMountPathKey(path)}`;

export const sandboxUrlMountPathKey = (path: readonly string[]): string => path.map(encodeURIComponent).join('/');

export const sandboxUrlMountRequestUrl = (
  origin: string,
  request: { readonly mountId: string; readonly pathKey: string },
): string => `${sandboxUrlMountRootUrl(origin, request.mountId)}${request.pathKey}`;

export const sandboxUrlMountRootUrl = (origin: string, mountId: string): string =>
  `${origin}${sandboxUrlMountPrefix}${mountId}/`;

export const sandboxUrlMountRequest = (pathname: string): { readonly mountId: string; readonly pathKey: string } | undefined => {
  if (!pathname.startsWith(sandboxUrlMountPrefix)) return undefined;
  const target = pathname.slice(sandboxUrlMountPrefix.length);
  const pathStart = target.indexOf('/');
  return pathStart === -1
    ? undefined
    : { mountId: target.slice(0, pathStart), pathKey: target.slice(pathStart + 1) };
};

export const sandboxUrlMountCacheName = (mountId: string): string => `${sandboxUrlMountCachePrefix}${mountId}`;

export const sandboxUrlMountStoredFiles = (
  origin: string,
  mountId: string,
  files: readonly SandboxUrlMountFile[],
) =>
  files.map((file) => ({
    headers: sandboxUrlMountHeaders(file.contentType, mountId, origin),
    text: file.text,
    url: sandboxUrlMountFileUrl(origin, mountId, file.path),
  }));

export const sandboxUrlMountHeaders = (contentType: string, mountId: string, origin: string): HeadersInit => ({
  'Access-Control-Allow-Origin': 'null',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': sandboxUrlMountCsp(origin, mountId),
  'Content-Type': contentType,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

const sandboxUrlMountCsp = (origin: string, mountId: string): string => {
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
};
