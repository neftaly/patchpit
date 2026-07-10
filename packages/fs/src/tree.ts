export const fsTreeFromFiles = (files: readonly FsTreeFile[]): FsTree => ({
  entries: treeEntriesFromFiles(files, 0),
  kind: 'dir',
});

export type FsTree =
  | { readonly kind: 'dir'; readonly entries: readonly (readonly [name: string, tree: FsTree])[] }
  | { readonly kind: 'file'; readonly src: string };

export type FsTreeFile = {
  readonly path: readonly string[];
  readonly src: string;
};

type FsTreeDirectory = Extract<FsTree, { readonly kind: 'dir' }>;
type FsTreeEntry = FsTreeDirectory['entries'][number];
type PendingTreeEntry = readonly [name: string, tree: FsTree | null];

const treeEntriesFromFiles = (
  files: readonly FsTreeFile[],
  depth: number,
): FsTreeDirectory['entries'] => {
  const directories = new Map<string, FsTreeFile[]>();
  const entries: PendingTreeEntry[] = [];

  for (const file of files) {
    if (file.path.length <= depth) continue;
    const name = file.path[depth] ?? '';
    if (file.path.length === depth + 1) entries.push([name, { kind: 'file', src: file.src }]);
    else {
      const directoryFiles = directories.get(name);
      if (directoryFiles === undefined) {
        directories.set(name, [file]);
        entries.push([name, null]);
      } else {
        directoryFiles.push(file);
      }
    }
  }

  return entries.map(([name, tree]): FsTreeEntry =>
    [name, tree ?? { entries: treeEntriesFromFiles(directories.get(name) ?? [], depth + 1), kind: 'dir' }]);
};
