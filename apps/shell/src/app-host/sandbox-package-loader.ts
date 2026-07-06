import type { AppManifestDoc, FilesystemNode } from '@patchpit/system';

type FilesystemFile = Extract<FilesystemNode, { readonly kind: 'file' }>;
type FilesystemFolder = Extract<FilesystemNode, { readonly kind: 'folder' }>;

export type SandboxFilesystemAppResource = {
  readonly mediaType: string;
  readonly path: string;
  readonly text: string;
  readonly url: string;
};

export type SandboxFilesystemAppEntry = SandboxFilesystemAppResource & {
  readonly entryKind: AppManifestDoc['entryKind'];
  readonly resources: readonly SandboxFilesystemAppResource[];
};

export type SandboxPackageLoadPlan =
  | {
      readonly kind: 'html';
      readonly html: string;
    }
  | {
      readonly entryModuleUrl: string;
      readonly kind: 'module';
    }
  | {
      readonly error: string;
      readonly kind: 'error';
    };

export function sandboxFilesystemAppEntry({
  entry,
  entryKind,
  entryPath,
  packageRoot,
}: {
  readonly entry: FilesystemFile;
  readonly entryKind: AppManifestDoc['entryKind'];
  readonly entryPath: string;
  readonly packageRoot: FilesystemFolder;
}): SandboxFilesystemAppEntry {
  return {
    entryKind,
    mediaType: entry.mediaType,
    path: entryPath,
    resources: sandboxPackageResources(packageRoot),
    text: entry.text,
    url: entry.url,
  };
}

export function createSandboxPackageLoadPlan(entry: SandboxFilesystemAppEntry): SandboxPackageLoadPlan {
  try {
    const entryPath = normalizePackagePath(entry.path);
    if (entryPath === undefined) {
      return { error: `Invalid sandbox app entry path "${entry.path}".`, kind: 'error' };
    }

    const resources = new Map(entry.resources.map((resource) => [resource.path, resource]));
    const entryResource = { ...entry, path: entryPath };
    resources.set(entryPath, entryResource);
    const modules = moduleUrlFactory(resources);
    const resourceUrl = (fromPath: string, specifier: string, options?: {
      readonly javaScriptOnly?: boolean;
    }): string => {
      const path = resolveRelativePackagePath(fromPath, specifier);
      if (path === undefined) {
        throw new Error(`Sandbox package-relative resource "${specifier}" from "${fromPath}" is not a resolvable package path.`);
      }
      const resource = resources.get(path);
      if (resource === undefined) {
        throw new Error(`Sandbox package-relative resource "${specifier}" from "${fromPath}" is not available in the package.`);
      }
      if (options?.javaScriptOnly === true && !isJavaScriptResource(resource)) {
        throw new Error(`Sandbox package-relative module "${specifier}" from "${fromPath}" is not a JavaScript resource.`);
      }
      return isJavaScriptResource(resource) ? modules.moduleUrl(path) : textDataUrl(resource.mediaType, resource.text);
    };

    if (entry.entryKind === 'html' && !isHtmlResource(entryResource)) {
      return { error: `Sandbox app entryKind "html" requires an HTML entry, got "${entry.path}".`, kind: 'error' };
    }
    if (entry.entryKind === 'module' && !isJavaScriptResource(entryResource)) {
      return { error: `Sandbox app entryKind "module" requires a JavaScript entry, got "${entry.path}".`, kind: 'error' };
    }

    if (entry.entryKind === 'html') {
      return {
        html: rewriteSandboxHtmlEntry({
          entryPath,
          html: entryResource.text,
          resourceUrl,
        }),
        kind: 'html',
      };
    }

    return { entryModuleUrl: modules.moduleUrl(entryPath), kind: 'module' };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      kind: 'error',
    };
  }
}

export function rewriteRelativeModuleSpecifiers(
  source: string,
  fromPath: string,
  resolve: (specifier: string) => string,
): string {
  return source.replaceAll(moduleSpecifierPattern, (_match, prefix: string, quote: string, specifier: string) => {
    if (resolveRelativePackagePath(fromPath, specifier) === undefined) {
      throw new Error(`Sandbox package-relative module "${specifier}" from "${fromPath}" is not a resolvable package path.`);
    }
    return `${prefix}${quote}${resolve(specifier)}${quote}`;
  });
}

function sandboxPackageResources(packageRoot: FilesystemFolder): readonly SandboxFilesystemAppResource[] {
  const resources: SandboxFilesystemAppResource[] = [];

  function visit(node: FilesystemNode, parentPath: string): void {
    const path = parentPath === '' ? node.name : `${parentPath}/${node.name}`;
    if (node.kind === 'folder') {
      node.entries.forEach((child) => visit(child, path));
      return;
    }

    resources.push({
      mediaType: node.mediaType,
      path,
      text: node.text,
      url: node.url,
    });
  }

  packageRoot.entries.forEach((child) => visit(child, ''));
  return resources;
}

function moduleUrlFactory(resources: ReadonlyMap<string, SandboxFilesystemAppResource>) {
  const cache = new Map<string, string>();
  const stack: string[] = [];

  function moduleUrl(path: string): string {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;

    const resource = resources.get(path);
    if (resource === undefined) {
      throw new Error(`Sandbox module "${path}" is not available in the package.`);
    }
    if (!isJavaScriptResource(resource)) {
      throw new Error(`Sandbox module "${path}" is not a JavaScript resource.`);
    }
    if (stack.includes(path)) {
      throw new Error(`Cyclic sandbox module imports are not supported yet: ${[...stack, path].join(' -> ')}.`);
    }

    stack.push(path);
    const rewritten = rewriteRelativeModuleSpecifiers(resource.text, path, (specifier) => {
      const resolvedPath = resolveRelativePackagePath(path, specifier);
      if (resolvedPath === undefined) return specifier;
      return moduleUrl(resolvedPath);
    });
    stack.pop();

    const url = textDataUrl('text/javascript', rewritten);
    cache.set(path, url);
    return url;
  }

  return { moduleUrl };
}

function rewriteSandboxHtmlEntry({
  entryPath,
  html,
  resourceUrl,
}: {
  readonly entryPath: string;
  readonly html: string;
  readonly resourceUrl: (fromPath: string, specifier: string, options?: {
    readonly javaScriptOnly?: boolean;
  }) => string;
}): string {
  return html
    .replaceAll(scriptSrcPattern, (tag: string, beforeSrc: string, quote: string, specifier: string, afterSrc: string) => {
      if (!isModuleScript(`${beforeSrc} ${afterSrc}`)) {
        const url = resourceUrl(entryPath, specifier);
        return tag.replace(`${quote}${specifier}${quote}`, `${quote}${url}${quote}`);
      }
      const url = resourceUrl(entryPath, specifier, { javaScriptOnly: true });
      return `<script type="module">
try {
  const appModule = await import(${JSON.stringify(url)});
  const app = appModule.default ?? appModule.main;
  if (typeof app === 'function') await app(window.patchpit);
} catch (error) {
  window.patchpitReportError(error);
  throw error;
}
</script>`;
    })
    .replaceAll(assetAttributePattern, (_match: string, prefix: string, quote: string, specifier: string) => {
      const url = resourceUrl(entryPath, specifier);
      return `${prefix}${quote}${url}${quote}`;
    });
}

function normalizePackagePath(path: string): string | undefined {
  if (path.trim() !== path || path === '' || hasUrlScheme(path)) return undefined;
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length === 0 ? undefined : parts.join('/');
}

function resolveRelativePackagePath(fromPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return undefined;
  if (hasUrlScheme(specifier) || specifier.includes('?') || specifier.includes('#')) return undefined;
  const fromParts = fromPath.split('/').slice(0, -1);
  return normalizePackagePath([...fromParts, specifier].join('/'));
}

function isHtmlResource(resource: SandboxFilesystemAppResource): boolean {
  return resource.mediaType === 'text/html' || resource.path.endsWith('.html') || resource.path.endsWith('.htm');
}

function isJavaScriptResource(resource: SandboxFilesystemAppResource): boolean {
  return javaScriptMediaTypes.has(resource.mediaType) || javaScriptExtensions.some((extension) => resource.path.endsWith(extension));
}

function isModuleScript(attrs: string): boolean {
  return /\stype\s*=\s*["']module["']/i.test(attrs);
}

function textDataUrl(mediaType: string, text: string): string {
  return `data:${safeMediaType(mediaType)};charset=utf-8,${encodeDataUrlText(text)}`;
}

function safeMediaType(mediaType: string): string {
  return /^[a-z]+\/[a-z0-9.+-]+$/i.test(mediaType) ? mediaType : 'text/plain';
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function encodeDataUrlText(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

const javaScriptExtensions = ['.js', '.mjs'] as const;
const javaScriptMediaTypes = new Set([
  'application/javascript',
  'application/ecmascript',
  'text/ecmascript',
  'text/javascript',
]);

const moduleSpecifierPattern = /\b(import\s+(?:(?:[^'"]|\n)*?\s+from\s*)?|import\s*\(\s*|export\s+(?:(?:[^'"]|\n)*?\s+from\s*))(['"])(\.{1,2}\/[^'"]+)\2/g;
const scriptSrcPattern = /<script\b([^>]*)\ssrc\s*=\s*(["'])(\.{1,2}\/[^"']+)\2([^>]*)>\s*<\/script>/gi;
const assetAttributePattern = /(<(?:link|img|source|audio|video|track)\b[^>]*\s(?:href|src)\s*=\s*)(["'])(\.{1,2}\/[^"']+)\2/gi;
