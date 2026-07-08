import { fsTreeFromFiles, type FsTree } from '@patchpit/fs/tree';
import {
  createSandboxUrlMount,
  type SandboxDocumentBody,
  type SandboxDocumentPath,
  type SandboxUrlMount,
  sandboxDocumentPathKey,
} from '@patchpit/sandbox';

export type SandboxFsFile = {
  readonly path: SandboxDocumentPath;
  readonly src: string;
};

export type SandboxFsFileContent = {
  readonly body: SandboxDocumentBody;
  readonly contentType: string;
};

export type SandboxFsFileReader = (
  file: SandboxFsFile,
) => Promise<SandboxFsFileContent | undefined> | SandboxFsFileContent | undefined;

export type CreateSandboxUrlMountFromFsTreeOptions = {
  readonly baseUrl: string | URL;
  readonly entry: readonly string[];
  readonly mountId?: string;
  readonly readFile: SandboxFsFileReader;
  readonly route?: readonly string[];
};

export type CreateSandboxUrlMountFromFsFilesOptions =
  Omit<CreateSandboxUrlMountFromFsTreeOptions, 'readFile'>;

export type SandboxFsFileWithContent = SandboxFsFile & SandboxFsFileContent;

export const createSandboxUrlMountFromFsFiles = (
  files: readonly SandboxFsFileWithContent[],
  options: CreateSandboxUrlMountFromFsFilesOptions,
): SandboxUrlMount => {
  const fileByPath = new Map(files.map((file) => [sandboxDocumentPathKey(file.path), file]));
  return createSandboxUrlMountFromFsTree(fsTreeFromFiles(files), {
    ...options,
    readFile: (file) => fileByPath.get(sandboxDocumentPathKey(file.path)),
  });
};

export const createSandboxUrlMountFromFsTree = (
  tree: FsTree,
  options: CreateSandboxUrlMountFromFsTreeOptions,
): SandboxUrlMount => {
  const files = sandboxFsFilesFromTree(tree);

  return createSandboxUrlMount({
    baseUrl: options.baseUrl,
    entry: options.entry,
    files: files.map((file) => ({
      path: file.path,
      read: () => options.readFile(file),
    })),
    ...(options.mountId === undefined ? {} : { mountId: options.mountId }),
    ...(options.route === undefined ? {} : { route: options.route }),
  });
};

const sandboxFsFilesFromTree = (
  tree: FsTree,
  pathSegments: readonly string[] = [],
): readonly SandboxFsFile[] =>
  tree.kind === 'file'
    ? [{ path: pathSegments, src: tree.src }]
    : tree.entries.flatMap(([name, child]) => sandboxFsFilesFromTree(child, [...pathSegments, name]));
