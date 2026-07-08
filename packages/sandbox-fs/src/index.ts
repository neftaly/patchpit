import type { FsTree } from '@patchpit/fs';
import {
  createSandboxDocument,
  planSandboxDocument,
  type SandboxDocument,
  type SandboxDocumentBody,
  type SandboxDocumentPath,
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

export type CreateSandboxDocumentFromFsTreeOptions = {
  readonly entry: readonly string[];
  readonly readFile: SandboxFsFileReader;
};

export const createStaticSandboxDocumentFromFsTree = async (
  tree: FsTree,
  options: CreateSandboxDocumentFromFsTreeOptions,
): Promise<SandboxDocument> => {
  const files = sandboxFsFilesFromTree(tree);
  planSandboxDocument(options.entry, files);

  return createSandboxDocument({
    entry: options.entry,
    files: await Promise.all(files.map((file) => readSandboxFile(file, options.readFile))),
  });
};

const readSandboxFile = async (
  file: SandboxFsFile,
  readFile: SandboxFsFileReader,
) => {
  const content = await readFile(file);
  if (content === undefined) throw new Error(`Sandbox file body is unresolved: ${file.path.join('/')}`);
  return {
    body: content.body,
    contentType: content.contentType,
    path: file.path,
  };
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
