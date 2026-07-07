import type { FsRow } from './schema';

export function fsRowsFromTree<Node extends FsTreeInput>(root: Node): readonly FsTreeRow<Node>[] {
  return nodeToRows(root, { id: '/', name: '/', parentId: null, position: 0 }) as readonly FsTreeRow<Node>[];
}

function joinPath(parentId: string, name: string): string {
  return parentId === '/' ? `/${name}` : `${parentId}/${name}`;
}

type FsTreeInput =
  | FsTreeDirInput
  | FsTreeFileInput;

type FsTreeDirInput = Omit<FsRow, 'id' | 'parentId' | 'position' | 'name' | 'src'> & {
  readonly entries?: FsTreeEntries;
};

type FsTreeFileInput = Omit<FsRow, 'id' | 'parentId' | 'position' | 'name'> & {
  readonly src: string;
};

type FsTreeEntries =
  | Readonly<Record<string, FsTreeInput>>
  | ReadonlyMap<string, FsTreeInput>;

type FsTreeRow<Node extends FsTreeInput> = Omit<Node, 'entries'> & Pick<FsRow, 'id' | 'parentId' | 'position'>;

function nodeToRows(
  node: FsTreeInput & Readonly<Record<string, unknown>>,
  placement: Pick<FsRow, 'id' | 'name' | 'parentId' | 'position'>,
): readonly (FsRow & Readonly<Record<string, unknown>>)[] {
  const { entries, ...row } = node;
  const children = treeEntries((node as FsTreeDirInput).entries);
  return [
    {
      ...placement,
      ...row,
    },
    ...children.flatMap(([name, child], position) => nodeToRows(child as FsTreeInput & Readonly<Record<string, unknown>>, {
      id: joinPath(placement.id, name),
      name,
      parentId: placement.id,
      position,
    })),
  ];
}

function treeEntries(entries: FsTreeEntries | undefined): readonly (readonly [string, FsTreeInput])[] {
  return entries instanceof Map
    ? [...entries.entries()]
    : Object.entries(entries ?? {});
}
