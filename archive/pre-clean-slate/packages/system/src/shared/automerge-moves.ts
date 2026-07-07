import { getObjectId, type Prop } from '@automerge/automerge';

export const automergeMovesKey = '__automergeMoves';

export type AutomergeMove = {
  readonly from: readonly Prop[];
  readonly to: readonly Prop[];
};

export type AutomergeMoveRoot = {
  [automergeMovesKey]?: Record<string, AutomergeMove>;
};

// Native Automerge moves are not public yet; this keeps move intent by object id when available.
export function recordAutomergeMove(
  root: AutomergeMoveRoot,
  object: object,
  move: AutomergeMove,
  fallbackObjectId?: string,
): string | undefined {
  const objectId = getObjectId(object) ?? fallbackObjectId;
  if (objectId === undefined) return undefined;

  if (root[automergeMovesKey] === undefined) root[automergeMovesKey] = {};
  root[automergeMovesKey]![objectId] = {
    from: [...move.from],
    to: [...move.to],
  };
  return objectId;
}
