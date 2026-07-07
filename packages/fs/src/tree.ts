import type { FsRow } from './schema';

export function fsRowsFromTree<Extra extends object = {}>(root: FsTree<Extra>): readonly FsRow[] {
  return treeNodeRows(root, { id: '/', name: '/', parentId: null, position: 0 });
}

function childFsPath(parentId: string, name: string): string {
  const segment = encodePathSegment(name);
  return parentId === '/' ? `/${segment}` : `${parentId}/${segment}`;
}

export type FsTree<Extra extends object = {}> =
  | FsDir<Extra>
  | FsFile<Extra>;

type FsDir<Extra extends object> = Readonly<Extra> & {
  readonly kind: 'dir';
  readonly entries: ReadonlyMap<string, FsTree<Extra>>;
};

type FsFile<Extra extends object> = Readonly<Extra> & {
  readonly kind: 'file';
  readonly src: string;
};

function treeNodeRows(
  node: FsTree,
  fsPosition: Pick<FsRow, 'id' | 'name' | 'parentId' | 'position'>,
): readonly FsRow[] {
  const row = node.kind === 'file'
    ? { ...fsPosition, kind: node.kind, src: node.src }
    : { ...fsPosition, kind: node.kind };
  const children = node.kind === 'dir' ? [...node.entries.entries()] : [];
  return [
    row,
    ...children.flatMap(([name, child], position) => treeNodeRows(child, {
      id: childFsPath(fsPosition.id, name),
      name,
      parentId: fsPosition.id,
      position,
    })),
  ];
}

function encodePathSegment(segment: string): string {
  return segment.length === 0 ? '%00' : encodeURIComponent(segment);
}
