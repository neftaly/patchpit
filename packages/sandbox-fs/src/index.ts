import type { FsTree } from '@patchpit/fs';
import {
  createSandboxDocument,
  type SandboxDocument,
  type SandboxDocumentPath,
} from '@patchpit/sandbox';

export type SandboxFsFileBody = string | Blob | BufferSource;

export type SandboxFsFile = {
  readonly path: SandboxDocumentPath;
  readonly src: string;
};

export type SandboxFsFileContent = {
  readonly body: SandboxFsFileBody;
  readonly contentType: string;
};

export type SandboxFsFileReader = (
  file: SandboxFsFile,
) => Promise<SandboxFsFileContent | undefined> | SandboxFsFileContent | undefined;

export type CreateSandboxDocumentFromFsTreeOptions = {
  readonly entry: readonly string[];
  readonly readFile: SandboxFsFileReader;
};

export const createStaticSandboxDocumentFromFsTree = async (
  tree: FsTree,
  options: CreateSandboxDocumentFromFsTreeOptions,
): Promise<SandboxDocument> => {
  const files = sandboxFsFilesFromTree(tree);

  return createSandboxDocument({
    entry: options.entry,
    files,
  });
};

const sandboxFsFilesFromTree = (
  tree: FsTree,
  pathSegments: readonly string[] = [],
): readonly SandboxFsFile[] =>
  tree.kind === 'file'
    ? [sandboxFsFile(pathSegments, tree.src)]
    : tree.entries.flatMap(([name, child]) => sandboxFsFilesFromTree(child, [...pathSegments, name]));

const sandboxFsFile = (
  pathSegments: readonly string[],
  src: string,
): SandboxFsFile => ({ path: pathSegments, src });
