import { appContentUrl, resourceBrowserUrl } from '../content/invocation.ts';
import type { RootSeedFile, RootSeedFolder } from '../root/runtime.ts';

type DemoFilesManifest = {
  readonly files: readonly {
    readonly contentType?: string;
    readonly name: string;
    readonly order: number;
    readonly url: string;
  }[];
  readonly rootEntryId: string;
  readonly type: 'patchpit.demo-files@1';
};

export const loadBrowserDemoSeed = async (
  baseUrl: string | URL,
  signal?: AbortSignal,
) => {
  const artifactUrl = new URL('__patchpit/apps/sandbox-compat/', baseUrl);
  const response = await fetch(
    new URL('files.json', artifactUrl),
    signal === undefined ? undefined : { signal },
  );
  if (!response.ok) throw new Error(`Demo app index is unavailable: ${response.status}`);
  const manifest = parseDemoFilesManifest(await response.json());
  const files = await Promise.all(manifest.files.map(async (file): Promise<RootSeedFile> => {
    signal?.throwIfAborted();
    const fileUrl = new URL(file.url, artifactUrl);
    if (fileUrl.origin !== artifactUrl.origin || !fileUrl.pathname.startsWith(artifactUrl.pathname)) {
      throw new Error(`Demo app file URL escapes its artifact: ${file.url}`);
    }
    const fileResponse = await fetch(fileUrl, signal === undefined ? undefined : { signal });
    if (!fileResponse.ok) throw new Error(`Demo app file is unavailable: ${file.name}`);
    return {
      bytes: new Uint8Array(await fileResponse.arrayBuffer()),
      ...(file.contentType === undefined ? {} : { contentType: file.contentType }),
      entryId: file.name,
      name: file.name,
      order: file.order,
    };
  }));
  return {
    documentContext: appContentUrl(manifest.rootEntryId),
    folders: [{
      entryId: manifest.rootEntryId,
      files,
      name: manifest.rootEntryId,
      order: 1,
    }, {
      entryId: 'external-resources',
      files: [{
        entryId: 'unresolved.svg',
        name: 'unresolved.svg',
        order: 0,
        resourceUrl: 'https://example.com/unresolved.svg',
      }],
      name: 'external',
      order: 2,
    }] satisfies readonly RootSeedFolder[],
    initialContext: resourceBrowserUrl,
  };
};

const parseDemoFilesManifest = (candidate: unknown): DemoFilesManifest => {
  if (!isRecord(candidate)
    || candidate.type !== 'patchpit.demo-files@1'
    || typeof candidate.rootEntryId !== 'string'
    || candidate.rootEntryId === ''
    || !Array.isArray(candidate.files)) {
    throw new TypeError('Demo app index is invalid');
  }
  const files = candidate.files.map((file) => {
    if (!isRecord(file)
      || typeof file.name !== 'string'
      || file.name === ''
      || typeof file.order !== 'number'
      || !Number.isInteger(file.order)
      || typeof file.url !== 'string'
      || file.url === ''
      || (file.contentType !== undefined && typeof file.contentType !== 'string')) {
      throw new TypeError('Demo app file index is invalid');
    }
    return {
      ...(file.contentType === undefined ? {} : { contentType: file.contentType }),
      name: file.name,
      order: file.order,
      url: file.url,
    };
  });
  if (new Set(files.map(({ name }) => name)).size !== files.length
    || new Set(files.map(({ order }) => order)).size !== files.length
    || !files.some(({ name }) => name === 'index.html')) {
    throw new TypeError('Demo app file index is inconsistent');
  }
  return {
    files,
    rootEntryId: candidate.rootEntryId,
    type: candidate.type,
  };
};

const isRecord = (candidate: unknown): candidate is Readonly<Record<string, unknown>> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
