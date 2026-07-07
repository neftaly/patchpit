import type { FsRow } from './schema';

export function fsRowsFromTree(root: FsTree): readonly FsRow[] {
  return treeNodeRows(root, { key: [], name: '', parentKey: null, path: [], position: 0 });
}

export type FsTree =
  | { readonly kind: 'dir'; readonly entries: readonly (readonly [name: string, tree: FsTree])[] }
  | { readonly kind: 'file'; readonly src: string };

type FsTreePosition = Pick<FsRow, 'key' | 'name' | 'parentKey' | 'path' | 'position'>;

function treeNodeRows(
  node: FsTree,
  fsPosition: FsTreePosition,
): readonly FsRow[] {
  const row = node.kind === 'file'
    ? { ...fsPosition, kind: node.kind, src: node.src }
    : { ...fsPosition, kind: node.kind };
  return [
    row,
    ...(node.kind === 'dir'
      ? node.entries.flatMap(([name, child], position) =>
        treeNodeRows(child, {
          key: [...fsPosition.key, position],
          name,
          parentKey: fsPosition.key,
          path: [...fsPosition.path, name],
          position,
        }))
      : []),
  ];
}
