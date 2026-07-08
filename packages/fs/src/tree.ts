import type { FsRow } from './schema';

export const fsRowsFromTree = (root: FsTree): readonly FsRow[] =>
  treeNodeRows(root, { key: [], name: '', parentKey: null, path: [], position: 0 });

export type FsTree =
  | { readonly kind: 'dir'; readonly entries: readonly (readonly [name: string, tree: FsTree])[] }
  | { readonly kind: 'file'; readonly src: string };

type FsTreeNodeLocation = Pick<FsRow, 'key' | 'name' | 'parentKey' | 'path' | 'position'>;

const treeNodeRows = (
  node: FsTree,
  location: FsTreeNodeLocation,
): readonly FsRow[] =>
  node.kind === 'file'
    ? [{ ...location, kind: 'file', src: node.src }]
    : [
      { ...location, kind: 'dir' },
      ...node.entries.flatMap(([name, child], position) =>
        treeNodeRows(child, {
          key: [...location.key, position],
          name,
          parentKey: [...location.key],
          path: [...location.path, name],
          position,
        })),
    ];
