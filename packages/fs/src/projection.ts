import type { FsRow } from './schema.ts';
import type { FsTree } from './tree.ts';

type FsTreeNodeLocation = Pick<FsRow, 'key' | 'name' | 'parentKey' | 'position'>;
type PendingTreeNode = { readonly location: FsTreeNodeLocation; readonly node: FsTree };

export const fsRowsFromTree = (root: FsTree): readonly FsRow[] => {
  const rows: FsRow[] = [];
  const pending: PendingTreeNode[] = [{
    location: { key: [], name: '', parentKey: null, position: 0 },
    node: root,
  }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    const { location, node } = current;
    if (node.kind === 'file') {
      rows.push({ ...location, kind: 'file', src: node.src });
      continue;
    }

    rows.push({ ...location, kind: 'dir' });
    for (let position = node.entries.length - 1; position >= 0; position -= 1) {
      const entry = node.entries[position];
      if (entry === undefined) continue;
      const [name, child] = entry;
      pending.push({
        location: {
          key: [...location.key, position],
          name,
          parentKey: [...location.key],
          position,
        },
        node: child,
      });
    }
  }

  return rows;
};
