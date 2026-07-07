import { as, asc, env, eq, from, limit, pipe, sort, where } from '@tarstate/core/query';
import { fsRelations } from './schema';

export const fsNodes = as(fsRelations.nodes, 'node');

export const fsNodeByPath = pipe(
  from(fsNodes),
  where(eq(fsNodes.id, env<string>('path'))),
  limit(1),
);

export const fsChildrenOfPath = pipe(
  from(fsNodes),
  where(eq(fsNodes.parentId, env<string>('path'))),
  sort(
    asc(fsNodes.position),
    asc(fsNodes.name),
    asc(fsNodes.id),
  ),
);
