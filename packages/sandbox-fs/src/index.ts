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

export type SandboxFsFileResolution = {
  readonly body: SandboxDocumentBody;
  readonly contentType: string;
};

export type SandboxFsFileResolver = (
  file: SandboxFsFile,
) => Promise<SandboxFsFileResolution | undefined> | SandboxFsFileResolution | undefined;

export type CreateSandboxDocumentFromFsTreeOptions = {
  readonly entry?: readonly string[];
  readonly resolveFile: SandboxFsFileResolver;
};

const DEFAULT_ENTRY = ['index.html'] as const;

export const createSandboxDocumentFromFsTree = async (
  tree: FsTree,
  options: CreateSandboxDocumentFromFsTreeOptions,
): Promise<SandboxDocument> => {
  const entry = options.entry ?? DEFAULT_ENTRY;
  const files = sandboxFsFilesFromTree(tree);
  assertSandboxFsMount(files, entry);

  return createSandboxDocument({
    entry,
    files: await Promise.all(files.map((file) => resolvedSandboxFile(file, options.resolveFile))),
  });
};

const assertSandboxFsMount = (
  files: readonly SandboxFsFile[],
  entry: readonly string[],
) => {
  const seenPaths = new Set<string>();
  const filePaths = files.map((file) => sandboxDocumentPathKey(file.path));
  const duplicatePath = filePaths.find((path) => {
    if (seenPaths.has(path)) return true;
    seenPaths.add(path);
    return false;
  });
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

const resolvedSandboxFile = async (
  file: SandboxFsFile,
  resolveFile: SandboxFsFileResolver,
) => {
  const resolution = await resolveFile(file);
  if (resolution === undefined) throw new Error(`Sandbox file body is unresolved: ${sandboxDocumentPathKey(file.path)}`);
  return {
    body: resolution.body,
    contentType: resolution.contentType,
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
