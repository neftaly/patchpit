import { resourceBrowserUrl } from '../content/invocation.ts';
import type { RootSeedFile, RootSeedFolder } from '../root/runtime.ts';

type DemoFilesManifest = {
  readonly files: readonly {
    readonly contentType?: string;
    readonly name: string;
    readonly order: number;
    readonly url: string;
  }[];
  readonly rootFolderId: string;
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
      linkId: file.name,
      name: file.name,
      order: file.order,
    };
  }));
  const duplicateNameFiles = [
    copyDemoFile(files, 'relative-file.svg', 'duplicate-relative', 'duplicate.svg', 0),
    copyDemoFile(files, 'srcset-file.svg', 'duplicate-srcset', 'duplicate.svg', 1),
  ];
  return {
    documentContextFolderId: manifest.rootFolderId,
    folders: [{
      folderId: manifest.rootFolderId,
      files,
      name: manifest.rootFolderId,
      order: 1,
    }, {
      folderId: 'web-resources',
      files: [{
        linkId: 'ghostscript-tiger-web.svg',
        name: 'ghostscript-tiger-web.svg',
        order: 0,
        resourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
      }],
      name: 'web resources',
      order: 2,
    }, {
      folderId: 'duplicate-names',
      files: duplicateNameFiles,
      name: 'duplicate names',
      order: 3,
    }] satisfies readonly RootSeedFolder[],
    initialContext: resourceBrowserUrl,
  };
};

const copyDemoFile = (
  files: readonly RootSeedFile[],
  sourceName: string,
  linkId: string,
  name: string,
  order: number,
): RootSeedFile => {
  const source = files.find((file) => file.name === sourceName);
  if (source?.bytes === undefined) throw new Error(`Demo source file is unavailable: ${sourceName}`);
  return {
    bytes: source.bytes,
    ...(source.contentType === undefined ? {} : { contentType: source.contentType }),
    documentName: source.name,
    linkId,
    name,
    order,
  };
};

const parseDemoFilesManifest = (candidate: unknown): DemoFilesManifest => {
  if (!isRecord(candidate)
    || candidate.type !== 'patchpit.demo-files@1'
    || typeof candidate.rootFolderId !== 'string'
    || candidate.rootFolderId === ''
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
    rootFolderId: candidate.rootFolderId,
    type: candidate.type,
  };
};

const isRecord = (candidate: unknown): candidate is Readonly<Record<string, unknown>> =>
  typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
