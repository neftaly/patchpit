import type { FsRow } from './schema';

export function fsRowsFromTree(root: FsTree): readonly FsRow[] {
  return treeNodeRows(root, { address: [], id: '[]', name: '', parentId: null, path: [], position: 0 });
}

export type FsTree =
  | FsDir
  | FsFile;

type FsDir = {
  readonly kind: 'dir';
  readonly entries: readonly (readonly [name: string, tree: FsTree])[];
};

type FsFile = {
  readonly kind: 'file';
  readonly src: string;
};

type FsTreePosition = Pick<FsRow, 'id' | 'name' | 'parentId' | 'path' | 'position'> & {
  readonly address: readonly number[];
};

function treeNodeRows(
  node: FsTree,
  fsPosition: FsTreePosition,
): readonly FsRow[] {
  const { address, ...rowPosition } = fsPosition;
  const row = node.kind === 'file'
    ? { ...rowPosition, kind: node.kind, src: node.src }
    : { ...rowPosition, kind: node.kind };
  const children = node.kind === 'dir' ? node.entries : [];
  return [
    row,
    ...children.flatMap(([name, child], position) => {
      const childAddress = [...address, position];
      return treeNodeRows(child, {
        address: childAddress,
        id: JSON.stringify(childAddress),
        name,
        parentId: fsPosition.id,
        path: [...fsPosition.path, name],
        position,
      });
    }),
  ];
}
