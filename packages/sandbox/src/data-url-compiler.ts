import type { SandboxBootstrapPayload } from './iframe-bootstrap';

export type SandboxFileBytes = {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly path: string;
};

type DataUrlForPath = (path: string) => string | undefined;

const sourceMapUrlPrefix = '//# sourceMappingURL=';
const absoluteUrlPattern = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export const compileSandboxBootstrapPayload = (
  entryPath: string,
  files: readonly SandboxFileBytes[],
): SandboxBootstrapPayload => {
  const entryFile = files.find((file) => file.path === entryPath);
  if (entryFile === undefined) throw new Error(`Sandbox entry file is missing: ${entryPath}`);
  const dataUrlsByPath = sandboxFileDataUrls(files);
  return {
    entryHtml: new TextDecoder().decode(entryFile.body),
    entryPath,
    fileDataUrls: files.map((file) => [file.path, dataUrlsByPath.get(file.path) as string]),
  };
};

const sandboxFileDataUrls = (files: readonly SandboxFileBytes[]): ReadonlyMap<string, string> => {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const dataUrlsByPath = new Map<string, string>();
  const resolving = new Set<string>();

  const dataUrlForPath = (path: string): string | undefined => {
    const cached = dataUrlsByPath.get(path);
    if (cached !== undefined) return cached;

    const file = filesByPath.get(path);
    if (file === undefined) return undefined;
    if (resolving.has(path)) throw new Error(`Cyclic sandbox file reference involving ${path}`);

    resolving.add(path);
    try {
      const body = sandboxFileBody(file, dataUrlForPath);
      const url = dataUrl(file.contentType, body);
      dataUrlsByPath.set(path, url);
      return url;
    } finally {
      resolving.delete(path);
    }
  };

  for (const file of files) dataUrlForPath(file.path);
  return dataUrlsByPath;
};

const sandboxFileBody = (file: SandboxFileBytes, dataUrlForPath: DataUrlForPath): Uint8Array | string =>
  file.contentType.startsWith('text/javascript')
    ? rewriteJavaScriptFileReferences(rewriteSourceMapUrl(new TextDecoder().decode(file.body), file.path, dataUrlForPath), file.path, dataUrlForPath)
    : file.contentType.startsWith('text/css')
      ? rewriteCssFileReferences(new TextDecoder().decode(file.body), file.path, dataUrlForPath)
      : file.body;

const rewriteSourceMapUrl = (text: string, filePath: string, dataUrlForPath: DataUrlForPath): string =>
  text.split('\n').map((line) =>
    line.startsWith(sourceMapUrlPrefix)
      ? `${sourceMapUrlPrefix}${dataUrlForRelativeFileReference(line.slice(sourceMapUrlPrefix.length), filePath, dataUrlForPath)}`
      : line).join('\n');

const rewriteJavaScriptFileReferences = (text: string, filePath: string, dataUrlForPath: DataUrlForPath): string =>
  text
    .replaceAll(
      /\b(import\s+(?:[^'"]*?\s+from\s*)?)(['"])([^'"]+)\2/g,
      (_match, prefix: string, quote: string, value: string) =>
        `${prefix}${quote}${dataUrlForRelativeFileReference(value, filePath, dataUrlForPath, { jsSpecifier: true })}${quote}`,
    )
    .replaceAll(
      /\b(export\s+[^'"]*?\s+from\s*)(['"])([^'"]+)\2/g,
      (_match, prefix: string, quote: string, value: string) =>
        `${prefix}${quote}${dataUrlForRelativeFileReference(value, filePath, dataUrlForPath, { jsSpecifier: true })}${quote}`,
    )
    .replaceAll(
      /\b(import\s*\(\s*)(['"])([^'"]+)\2/g,
      (_match, prefix: string, quote: string, value: string) =>
        `${prefix}${quote}${dataUrlForRelativeFileReference(value, filePath, dataUrlForPath, { jsSpecifier: true })}${quote}`,
    );

const rewriteCssFileReferences = (text: string, filePath: string, dataUrlForPath: DataUrlForPath): string =>
  text
    .replaceAll(
      /(@import\s+)(url\(\s*)?(?:(['"])([^'"]+)\3|([^'"\s)]+))(\s*\)?)/g,
      (match, prefix: string, urlStart: string | undefined, quote: string | undefined, quotedValue: string | undefined, unquotedValue: string | undefined, suffix: string) => {
        const value = quotedValue ?? unquotedValue;
        if (value === undefined) return match;
        if (!isRelativeFileReference(value)) return match;
        const resolved = dataUrlForRelativeFileReference(value, filePath, dataUrlForPath);
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
        return `url(${quote ?? '"'}${dataUrlForRelativeFileReference(value, filePath, dataUrlForPath)}${quote ?? '"'})`;
      },
    );

const dataUrlForRelativeFileReference = (
  value: string,
  basePath: string,
  dataUrlForPath: DataUrlForPath,
  options?: { readonly jsSpecifier?: boolean },
): string => {
  if (!isRelativeFileReference(value, options)) return value;
  const url = new URL(value, new URL(basePath, 'https://sandbox.local/'));
  const resolved = dataUrlForPath(url.pathname.slice(1));
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
