import type { OpaqueSandboxPayload } from './opaque-runtime';

export type NormalizedSandboxFile = {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly path: string;
};

type RelativeFileUrl = (path: string) => string | undefined;

const sourceMapUrlPrefix = '//# sourceMappingURL=';
const absoluteUrlPattern = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export const compileOpaqueSandboxPayload = (
  entry: string,
  files: readonly NormalizedSandboxFile[],
): OpaqueSandboxPayload => {
  const entryFile = files.find((file) => file.path === entry);
  if (entryFile === undefined) throw new Error(`Sandbox entry file is missing: ${entry}`);
  const urls = transformedDataUrls(files);
  return {
    entry,
    files: files.map((file) => [file.path, urls.get(file.path) as string]),
    html: new TextDecoder().decode(entryFile.body),
  };
};

const transformedDataUrls = (files: readonly NormalizedSandboxFile[]): ReadonlyMap<string, string> => {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const urls = new Map<string, string>();
  const resolving = new Set<string>();

  const fileUrl = (path: string): string | undefined => {
    const cached = urls.get(path);
    if (cached !== undefined) return cached;

    const file = filesByPath.get(path);
    if (file === undefined) return undefined;
    if (resolving.has(path)) throw new Error(`Cyclic sandbox file reference involving ${path}`);

    resolving.add(path);
    try {
      const body = transformedBody(file, fileUrl);
      const url = dataUrl(file.contentType, body);
      urls.set(path, url);
      return url;
    } finally {
      resolving.delete(path);
    }
  };

  for (const file of files) fileUrl(file.path);
  return urls;
};

const transformedBody = (file: NormalizedSandboxFile, fileUrl: RelativeFileUrl): Uint8Array | string =>
  file.contentType.startsWith('text/javascript')
    ? javascriptUrls(sourceMapUrls(new TextDecoder().decode(file.body), file.path, fileUrl), file.path, fileUrl)
    : file.contentType.startsWith('text/css')
      ? cssUrls(new TextDecoder().decode(file.body), file.path, fileUrl)
      : file.body;

const sourceMapUrls = (text: string, filePath: string, fileUrl: RelativeFileUrl): string =>
  text.split('\n').map((line) =>
    line.startsWith(sourceMapUrlPrefix)
      ? `${sourceMapUrlPrefix}${sandboxRelativeFileUrl(line.slice(sourceMapUrlPrefix.length), filePath, fileUrl)}`
      : line).join('\n');

const javascriptUrls = (text: string, filePath: string, fileUrl: RelativeFileUrl): string =>
  text
    .replaceAll(
      /\b(import\s+(?:[^'"]*?\s+from\s*)?)(['"])([^'"]+)\2/g,
      (_match, prefix: string, quote: string, value: string) =>
        `${prefix}${quote}${sandboxRelativeFileUrl(value, filePath, fileUrl, { jsSpecifier: true })}${quote}`,
    )
    .replaceAll(
      /\b(export\s+[^'"]*?\s+from\s*)(['"])([^'"]+)\2/g,
      (_match, prefix: string, quote: string, value: string) =>
        `${prefix}${quote}${sandboxRelativeFileUrl(value, filePath, fileUrl, { jsSpecifier: true })}${quote}`,
    )
    .replaceAll(
      /\b(import\s*\(\s*)(['"])([^'"]+)\2/g,
      (_match, prefix: string, quote: string, value: string) =>
        `${prefix}${quote}${sandboxRelativeFileUrl(value, filePath, fileUrl, { jsSpecifier: true })}${quote}`,
    );

const cssUrls = (text: string, filePath: string, fileUrl: RelativeFileUrl): string =>
  text
    .replaceAll(
      /(@import\s+)(url\(\s*)?(?:(['"])([^'"]+)\3|([^'"\s)]+))(\s*\)?)/g,
      (match, prefix: string, urlStart: string | undefined, quote: string | undefined, quotedValue: string | undefined, unquotedValue: string | undefined, suffix: string) => {
        const value = quotedValue ?? unquotedValue;
        if (value === undefined) return match;
        if (!isRelativeFileReference(value)) return match;
        const resolved = sandboxRelativeFileUrl(value, filePath, fileUrl);
        return urlStart === undefined
          ? `${prefix}${quote ?? '"'}${resolved}${quote ?? '"'}${suffix}`
          : `${prefix}${urlStart}${quote ?? '"'}${resolved}${quote ?? '"'}${suffix}`;
      },
    )
    .replaceAll(
      /url\(\s*(?:(['"])([^'"]*)\1|([^'")(\s]+))\s*\)/g,
      (match, quote: string | undefined, quotedValue: string | undefined, unquotedValue: string | undefined) => {
        const value = quotedValue ?? unquotedValue;
        if (value === undefined) return match;
        if (!isRelativeFileReference(value)) return match;
        return `url(${quote ?? '"'}${sandboxRelativeFileUrl(value, filePath, fileUrl)}${quote ?? '"'})`;
      },
    );

const sandboxRelativeFileUrl = (
  value: string,
  basePath: string,
  fileUrl: RelativeFileUrl,
  options?: { readonly jsSpecifier?: boolean },
): string => {
  if (!isRelativeFileReference(value, options)) return value;
  const url = new URL(value, new URL(basePath, 'https://sandbox.local/'));
  const resolved = fileUrl(url.pathname.slice(1));
  if (resolved === undefined) throw new Error(`Missing sandbox file referenced from ${basePath}: ${value}`);
  return `${resolved}${url.hash}`;
};

const isRelativeFileReference = (value: string, { jsSpecifier = false }: { readonly jsSpecifier?: boolean } = {}): boolean => {
  const trimmed = value.trim();
  if (
    trimmed === ''
    || trimmed.startsWith('#')
    || trimmed.startsWith('/')
    || trimmed.startsWith('\\')
    || absoluteUrlPattern.test(trimmed)
  ) return false;
  return !jsSpecifier || trimmed.startsWith('./') || trimmed.startsWith('../');
};

const dataUrl = (contentType: string, body: string | Uint8Array): string =>
  `data:${dataUrlContentType(contentType)};base64,${bytesBase64(typeof body === 'string' ? new TextEncoder().encode(body) : body)}`;

const dataUrlContentType = (contentType: string): string =>
  contentType.split(';').map((part) => part.trim()).join(';');

const bytesBase64 = (bytes: Uint8Array): string => {
  let base64 = '';
  for (let index = 0; index < bytes.length; index += 0x6000) {
    base64 += btoa(String.fromCharCode(...bytes.subarray(index, index + 0x6000)));
  }
  return base64;
};
