import type { FsRow } from './schema';

export function fsRowsFromTree<Node extends FsTreeInput>(root: Node): readonly FsTreeRow<Node>[] {
  return nodeToRows(root, { id: '/', parentId: null, position: 0 }) as readonly FsTreeRow<Node>[];
}

function joinPath(parent: string, name: string): string {
  return parent === '/' ? `/${name}` : `${parent}/${name}`;
}

type FsTreeInput = Omit<FsRow, 'id' | 'parentId' | 'position'> & {
  readonly entries?: readonly FsTreeInput[];
};

type FsTreeRow<Node extends FsTreeInput> = Omit<Node, 'entries'> & Pick<FsRow, 'id' | 'parentId' | 'position'>;

function nodeToRows(
  node: FsTreeInput & Readonly<Record<string, unknown>>,
  placement: Pick<FsRow, 'id' | 'parentId' | 'position'>,
): readonly (FsRow & Readonly<Record<string, unknown>>)[] {
  const { entries, ...row } = node;
  return [
    {
      ...placement,
      ...row,
    },
    ...(entries ?? []).flatMap((child, position) => nodeToRows(child as FsTreeInput & Readonly<Record<string, unknown>>, {
      id: joinPath(placement.id, child.name),
      parentId: placement.id,
      position,
    })),
  ];
}
