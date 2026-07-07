import type { FsRow } from './schema';

export function fsRowsFromTree<Extra extends object = {}>(root: FsTree<Extra>): readonly FsRow[] {
  return nodeToRows(root, { id: '/', name: '/', parentId: null, position: 0 });
}

function joinPath(parentId: string, name: string): string {
  const segment = encodePathSegment(name);
  return parentId === '/' ? `/${segment}` : `${parentId}/${segment}`;
}

export type FsTree<Extra extends object = {}> =
  | FsTreeDir<Extra>
  | FsTreeFile<Extra>;

type FsTreeDir<Extra extends object> = Readonly<Extra> & {
  readonly kind: 'dir';
  readonly entries: ReadonlyMap<string, FsTree<Extra>>;
};

type FsTreeFile<Extra extends object> = Readonly<Extra> & {
  readonly kind: 'file';
  readonly src: string;
};

function nodeToRows(
  node: FsTree,
  placement: Pick<FsRow, 'id' | 'name' | 'parentId' | 'position'>,
): readonly FsRow[] {
  const row = node.kind === 'file'
    ? { ...placement, kind: node.kind, src: node.src }
    : { ...placement, kind: node.kind };
  const children = node.kind === 'dir' ? [...node.entries.entries()] : [];
  return [
    row,
    ...children.flatMap(([name, child], position) => nodeToRows(child, {
      id: joinPath(placement.id, name),
      name,
      parentId: placement.id,
      position,
    })),
  ];
}

function encodePathSegment(segment: string): string {
  return segment.length === 0 ? '%00' : encodeURIComponent(segment);
}
