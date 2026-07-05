import { getObjectId, type ObjID, type Prop } from '@automerge/automerge';

export const automergeMovesKey = '__automergeMoves';

export type AutomergeMove = {
  readonly from: readonly Prop[];
  readonly to: readonly Prop[];
};

export type AutomergeMoveRoot = {
  [automergeMovesKey]?: Record<ObjID, AutomergeMove>;
};

// Native Automerge moves are not public yet; this keeps move intent by object id.
export function recordAutomergeMove(
  root: AutomergeMoveRoot,
  object: object,
  move: AutomergeMove,
): ObjID | undefined {
  const objectId = getObjectId(object) ?? undefined;
  if (objectId === undefined) return undefined;

  const moves = root[automergeMovesKey] ??= {};
  moves[objectId] = {
    from: [...move.from],
    to: [...move.to],
  };
  return objectId;
}
