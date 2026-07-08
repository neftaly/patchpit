import type { FsRow } from './schema';

export const fsRowsFromTree = (root: FsTree): readonly FsRow[] =>
  treeNodeRows(root, { key: [], name: '', parentKey: null, path: [], position: 0 });

export type FsTree =
  | { readonly kind: 'dir'; readonly entries: readonly (readonly [name: string, tree: FsTree])[] }
  | { readonly kind: 'file'; readonly src: string };

type FsTreePosition = Pick<FsRow, 'key' | 'name' | 'parentKey' | 'path' | 'position'>;

const treeNodeRows = (
  node: FsTree,
  fsPosition: FsTreePosition,
): readonly FsRow[] =>
  node.kind === 'file'
    ? [{ ...fsPosition, kind: 'file', src: node.src }]
    : [
      { ...fsPosition, kind: 'dir' },
      ...node.entries.flatMap(([name, child], position) =>
        treeNodeRows(child, {
          key: [...fsPosition.key, position],
          name,
          parentKey: [...fsPosition.key],
          path: [...fsPosition.path, name],
          position,
        })),
    ];
