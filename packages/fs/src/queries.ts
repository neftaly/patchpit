import { as, asc, env, eq, from, limit, pipe, sort, where } from '@tarstate/core/query';
import { fsRelations, type FsNodeKey } from './schema';

export const fsNodes = as(fsRelations.nodes, 'node');

export const fsNodeByKey = pipe(
  from(fsNodes),
  where(eq(fsNodes.row.key, env<FsNodeKey>('key'))),
  limit(1),
);

export const fsChildrenOfKey = pipe(
  from(fsNodes),
  where(eq(fsNodes.row.parentKey, env<FsNodeKey>('key'))),
  sort(
    asc(fsNodes.row.position),
    asc(fsNodes.row.name),
  ),
);
