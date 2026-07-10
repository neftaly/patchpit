import {
  createSandboxUrlMount,
  type SandboxDocumentBody,
  type SandboxDocumentPath,
  type SandboxUrlMount,
  type SandboxUrlMountFileContent,
} from '@patchpit/sandbox';
import type { FsEntry } from '@patchpit/fs';

export type SandboxFsFile = {
  readonly body: SandboxDocumentBody;
  readonly contentType?: string;
  readonly path: SandboxDocumentPath;
};

export type CreateSandboxUrlMountFromFsFilesOptions = {
  readonly baseUrl: string | URL;
  readonly entry: SandboxDocumentPath;
  readonly mountId?: string;
  readonly route?: readonly string[];
};

export const createSandboxUrlMountFromFsFiles = <const File extends SandboxFsFile>(
  files: readonly File[],
  options: CreateSandboxUrlMountFromFsFilesOptions,
): SandboxUrlMount =>
  createSandboxUrlMount({
    ...options,
    files: files.map((file) => ({
      path: file.path,
      read: () => file.contentType === undefined
        ? { body: file.body }
        : { body: file.body, contentType: file.contentType },
    })),
  });

export type SandboxFsResourceReader = (
  resourceRef: string,
) => Promise<SandboxUrlMountFileContent | undefined> | SandboxUrlMountFileContent | undefined;

export const sandboxFsFilesFromEntries = async (
  entries: readonly FsEntry[],
  readResource: SandboxFsResourceReader,
): Promise<readonly SandboxFsFile[]> => {
  const byId = new Map(entries.map((entry) => [entry.entryId, entry]));
  if (byId.size !== entries.length) throw new Error('Duplicate filesystem entry ID');
  const paths = new Map<string, SandboxDocumentPath>();
  const resolving = new Set<string>();
  const pathFor = (entry: FsEntry): SandboxDocumentPath => {
    const known = paths.get(entry.entryId);
    if (known !== undefined) return known;
    if (resolving.has(entry.entryId)) throw new Error(`Filesystem parent cycle at: ${entry.entryId}`);
    resolving.add(entry.entryId);
    let path: SandboxDocumentPath = [entry.name];
    if (entry.parentId !== null) {
      const parent = byId.get(entry.parentId);
      if (parent === undefined) throw new Error(`Filesystem parent not found: ${entry.parentId}`);
      if (parent.kind !== 'folder') throw new Error(`Filesystem parent is not a folder: ${entry.parentId}`);
      path = [...pathFor(parent), entry.name];
    }
    resolving.delete(entry.entryId);
    paths.set(entry.entryId, path);
    return path;
  };
  for (const entry of entries) pathFor(entry);
  const filePaths = new Set<string>();
  return Promise.all(entries.filter(({ kind }) => kind === 'file').map(async (entry) => {
    const path = pathFor(entry);
    const key = JSON.stringify(path);
    if (filePaths.has(key)) throw new Error(`Duplicate filesystem path: ${path.join('/')}`);
    filePaths.add(key);
    const content = await readResource(entry.resourceRef);
    if (content === undefined) throw new Error(`Filesystem resource not found: ${entry.resourceRef}`);
    return { ...content, path };
  }));
};
