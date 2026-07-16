import { sandboxDocumentPathKey, type SandboxDocumentPath } from './path.ts';

export type SandboxDocumentBody = string | Blob | BufferSource;

export type SandboxFileContent = {
  readonly body: SandboxDocumentBody;
  readonly contentType?: string;
};

export type SandboxFile = {
  readonly path: SandboxDocumentPath;
  readonly read: () => Promise<SandboxFileContent | undefined> | SandboxFileContent | undefined;
};

export type SandboxFrameAttributes = {
  readonly referrerPolicy: 'no-referrer';
  readonly sandbox: 'allow-scripts allow-same-origin';
  readonly src: string;
};

export type SandboxFrameAttributesOptions = {
  readonly baseUrl: string | URL;
  readonly entry: SandboxDocumentPath;
  readonly mountId: string;
  readonly route?: readonly string[];
};

const DEFAULT_SANDBOX_ROUTE = ['__patchpit', 'sandbox'] as const;

export const createSandboxFrameAttributes = ({
  baseUrl,
  entry,
  mountId,
  route = DEFAULT_SANDBOX_ROUTE,
}: SandboxFrameAttributesOptions): SandboxFrameAttributes => ({
  referrerPolicy: 'no-referrer',
  // TODO: Serve mounts from an authority-free runner origin before accepting untrusted apps.
  sandbox: 'allow-scripts allow-same-origin',
  src: new URL(
    `${sandboxMountScopePath(route, mountId)}${sandboxDocumentPathKey(entry)}`,
    baseUrl,
  ).toString(),
});

export const indexSandboxFiles = <File extends { readonly path: SandboxDocumentPath }>(
  entry: SandboxDocumentPath,
  files: readonly File[],
): ReadonlyMap<string, File> => {
  const entryPath = sandboxDocumentPathKey(entry);
  const indexed = files.reduce((byPath, file) => {
    const path = sandboxDocumentPathKey(file.path);
    if (byPath.has(path)) throw new Error(`Duplicate sandbox document path: ${path}`);
    byPath.set(path, file);
    return byPath;
  }, new Map<string, File>());
  if (!indexed.has(entryPath)) throw new Error(`Sandbox entry file is missing: ${entryPath}`);
  return indexed;
};

export const sandboxMountScopePath = (
  route: readonly string[],
  mountId: string,
): string => {
  const segments = [...route, mountId];
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Sandbox mount routes must use non-empty, non-dot segments: ${segments.join('/')}`);
  }
  return `/${segments.map(encodeURIComponent).join('/')}/`;
};

export const sandboxFileResponse = (content: SandboxFileContent): Response => new Response(content.body, {
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Security-Policy': SANDBOX_CONTENT_SECURITY_POLICY,
    'Content-Type': content.contentType ?? 'application/octet-stream',
    'Timing-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  },
  status: 200,
});

const SANDBOX_CONTENT_SECURITY_POLICY = [
  `default-src 'none'`,
  `sandbox allow-scripts allow-same-origin`,
  `base-uri 'none'`,
  `connect-src 'self'`,
  `font-src 'self' data:`,
  `form-action 'none'`,
  `frame-src 'self'`,
  `img-src 'self' data:`,
  `media-src 'self'`,
  `object-src 'none'`,
  `script-src 'unsafe-inline' 'self'`,
  `style-src 'unsafe-inline' 'self'`,
  `worker-src 'none'`,
].join('; ');
