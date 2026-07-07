import { as, asc, env, eq, from, limit, pipe, sort, where } from '@tarstate/core/query';
import { fsRelations } from './schema';

export const fsNodes = as(fsRelations.nodes, 'node');

export const fsNodeById = pipe(
  from(fsNodes),
  where(eq(fsNodes.id, env<string>('id'))),
  limit(1),
);

export const fsChildrenOfId = pipe(
  from(fsNodes),
  where(eq(fsNodes.parentId, env<string>('id'))),
  sort(
    asc(fsNodes.position),
    asc(fsNodes.name),
    asc(fsNodes.id),
  ),
);
