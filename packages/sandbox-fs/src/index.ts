import type { FsTree } from '@patchpit/fs';
import {
  createSandboxDocument,
  type SandboxDocument,
  type SandboxDocumentBody,
  type SandboxDocumentFile,
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
  readonly resolveFile?: SandboxFsFileResolver;
};

const DEFAULT_ENTRY = ['index.html'] as const;

type SandboxFsPlan = {
  readonly entry: readonly string[];
  readonly files: readonly SandboxFsFile[];
};

export const createSandboxDocumentFromFsTree = async (
  tree: FsTree,
  options: CreateSandboxDocumentFromFsTreeOptions = {},
): Promise<SandboxDocument> =>
  createSandboxDocumentFromFsPlan(sandboxFsPlanFromTree(tree, options.entry), options.resolveFile);

const sandboxFsPlanFromTree = (
  tree: FsTree,
  entry: readonly string[] = DEFAULT_ENTRY,
): SandboxFsPlan => {
  const files = sandboxFsFilesFromTree(tree);
  const seenPaths = new Set<string>();
  const filePaths = files.map((file) => sandboxDocumentPathKey(file.path));
  const directoryPaths = new Set<string>();
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
  for (const file of files) {
    file.path.slice(0, -1).forEach((_, index) => directoryPaths.add(sandboxDocumentPathKey(file.path.slice(0, index + 1))));
  }
  const collision = filePaths.find((path) => directoryPaths.has(path));
  if (collision !== undefined) throw new Error(`Sandbox file path is both file and directory: ${collision}`);

  return { entry, files };
};

const createSandboxDocumentFromFsPlan = async (
  plan: SandboxFsPlan,
  resolveFile?: SandboxFsFileResolver,
): Promise<SandboxDocument> => {
  return createSandboxDocument({
    entry: plan.entry,
    files: await Promise.all(plan.files.map(async (file): Promise<SandboxDocumentFile> => {
      const resolution = await resolveFile?.(file);
      if (resolution === undefined) throw new Error(`Sandbox file body is unresolved: ${sandboxDocumentPathKey(file.path)}`);
      return {
        body: resolution.body,
        contentType: resolution.contentType,
        path: file.path,
      };
    })),
  });
};

const sandboxFsFilesFromTree = (
  tree: FsTree,
  pathSegments: readonly string[] = [],
): readonly SandboxFsFile[] =>
  tree.kind === 'file'
    ? [sandboxFsFile(tree, pathSegments)]
    : tree.entries.flatMap(([name, child]) => sandboxFsFilesFromTree(child, [...pathSegments, name]));

const sandboxFsFile = (
  tree: Extract<FsTree, { readonly kind: 'file' }>,
  pathSegments: readonly string[],
): SandboxFsFile => {
  sandboxDocumentPathKey(pathSegments);
  return {
    path: pathSegments,
    src: tree.src,
  };
};
