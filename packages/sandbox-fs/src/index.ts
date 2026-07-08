import type { FsTree } from '@patchpit/fs';
import {
  createSandboxDocument,
  type SandboxDocument,
  type SandboxDocumentBody,
  type SandboxDocumentPath,
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

export type CreateSandboxDocumentFromFsTreeOptions = {
  readonly entry: readonly string[];
  readonly readFile: SandboxFsFileReader;
};

export const createStaticSandboxDocumentFromFsTree = async (
  tree: FsTree,
  options: CreateSandboxDocumentFromFsTreeOptions,
): Promise<SandboxDocument> => {
  const files = sandboxFsFilesFromTree(tree);
  assertSandboxFsMount(files, options.entry);

  return createSandboxDocument({
    entry: options.entry,
    files: await Promise.all(files.map((file) => readSandboxFile(file, options.readFile))),
  });
};

const assertSandboxFsMount = (
  files: readonly SandboxFsFile[],
  entry: readonly string[],
) => {
  const filePaths = files.map((file) => sandboxDocumentPathKey(file.path));
  const duplicatePath = firstDuplicate(filePaths);
  if (duplicatePath !== undefined) {
    throw new Error(`Duplicate sandbox file path: ${duplicatePath}`);
  }

  const entryPath = sandboxDocumentPathKey(entry);
  if (!filePaths.includes(entryPath)) {
    throw new Error(`Sandbox entry file is missing: ${entryPath}`);
  }

  const directoryPaths = new Set(files.flatMap((file) =>
    file.path.slice(0, -1).map((_, index) => sandboxDocumentPathKey(file.path.slice(0, index + 1)))));
  const collision = filePaths.find((path) => directoryPaths.has(path));
  if (collision !== undefined) throw new Error(`Sandbox file path is both file and directory: ${collision}`);
};

const firstDuplicate = (values: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
};

const readSandboxFile = async (
  file: SandboxFsFile,
  readFile: SandboxFsFileReader,
) => {
  const content = await readFile(file);
  if (content === undefined) throw new Error(`Sandbox file body is unresolved: ${sandboxDocumentPathKey(file.path)}`);
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
): SandboxFsFile => {
  sandboxDocumentPathKey(pathSegments);
  return { path: pathSegments, src };
};
