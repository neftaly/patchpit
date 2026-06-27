import {
  anchoredPath,
  boolean,
  defineSchema,
  id,
  nullable,
  number,
  optional,
  ref,
  relation,
  string
} from './schema.js';

export type TreeNodeId = string;
export type TreeOperationId = string;

export type TreeOperationClock = {
  readonly actorId: string;
  readonly sequence: number;
};

export type TreeSeedNode = {
  readonly nodeId: TreeNodeId;
  readonly parentId: TreeNodeId | null;
  readonly orderKey: string;
  readonly label?: string;
};

export type TreeMoveOperation = TreeOperationClock & {
  readonly kind: 'move';
  readonly operationId: TreeOperationId;
  readonly nodeId: TreeNodeId;
  readonly parentId: TreeNodeId | null;
  readonly orderKey: string;
  readonly referencePath?: readonly TreeNodeId[];
};

export type TreeDeleteOperation = TreeOperationClock & {
  readonly kind: 'delete';
  readonly operationId: TreeOperationId;
  readonly nodeId: TreeNodeId;
};

export type TreeOperation = TreeMoveOperation | TreeDeleteOperation;

export type TreeNodeRow = {
  readonly nodeId: string;
  readonly parentId: string | null;
  readonly orderKey: string;
  readonly label?: string;
  readonly tombstone: boolean;
  readonly visible: boolean;
  readonly depth: number;
  readonly path: string;
};

export type TreeMoveRow = {
  readonly moveId: string;
  readonly actorId: string;
  readonly sequence: number;
  readonly nodeId: string;
  readonly fromParentId: string | null;
  readonly toParentId: string | null;
  readonly orderKey: string;
  readonly accepted: boolean;
  readonly reason?: string;
};

export type TreeConflictRow = {
  readonly conflictId: string;
  readonly code: TreeConflictCode;
  readonly nodeId: string;
  readonly operationId?: string;
  readonly winnerOperationId?: string;
  readonly loserOperationId?: string;
  readonly message: string;
};

export type IdentityPreservedRow = {
  readonly nodeId: string;
  readonly beforeParentId: string | null;
  readonly afterParentId: string | null;
  readonly tombstone: boolean;
  readonly identityPreserved: boolean;
};

export type CycleRejectedRow = {
  readonly moveId: string;
  readonly nodeId: string;
  readonly parentId: string | null;
  readonly ancestorPath: string;
  readonly rejected: boolean;
};

export type TreeConflictCode =
  | 'cycle_rejected'
  | 'deleted_node'
  | 'deleted_parent'
  | 'duplicate_subtree_prevented'
  | 'missing_node'
  | 'missing_parent';

export type TreeMovePrototypeRows = {
  readonly tree_node: readonly TreeNodeRow[];
  readonly tree_move: readonly TreeMoveRow[];
  readonly tree_conflict: readonly TreeConflictRow[];
  readonly identity_preserved: readonly IdentityPreservedRow[];
  readonly cycle_rejected: readonly CycleRejectedRow[];
};

export type TreeReference = {
  readonly nodeId: TreeNodeId;
  readonly path?: readonly TreeNodeId[];
};

export type TreeReferenceResolution = {
  readonly node: TreeNodeRow | undefined;
  readonly resolvedBy: 'object_id' | 'missing';
  readonly stalePath: boolean;
};

export type TreeMovePrototypeResult = {
  readonly rows: TreeMovePrototypeRows;
  readonly resolve: (reference: TreeReference) => TreeReferenceResolution;
};

export const treeMovePrototypeSchema = defineSchema({
  tree_node: relation<TreeNodeRow>({
    key: 'nodeId',
    fields: {
      nodeId: id('tree_node'),
      parentId: nullable(ref('tree_node.nodeId')),
      orderKey: string(),
      label: optional(string()),
      tombstone: boolean(),
      visible: boolean(),
      depth: number(),
      path: anchoredPath()
    }
  }),
  tree_move: relation<TreeMoveRow>({
    key: 'moveId',
    fields: {
      moveId: id('tree_move'),
      actorId: string(),
      sequence: number(),
      nodeId: ref('tree_node.nodeId'),
      fromParentId: nullable(ref('tree_node.nodeId')),
      toParentId: nullable(ref('tree_node.nodeId')),
      orderKey: string(),
      accepted: boolean(),
      reason: optional(string())
    }
  }),
  tree_conflict: relation<TreeConflictRow>({
    key: 'conflictId',
    fields: {
      conflictId: id('tree_conflict'),
      code: string(),
      nodeId: ref('tree_node.nodeId'),
      operationId: optional(string()),
      winnerOperationId: optional(string()),
      loserOperationId: optional(string()),
      message: string()
    }
  }),
  identity_preserved: relation<IdentityPreservedRow>({
    key: 'nodeId',
    fields: {
      nodeId: ref('tree_node.nodeId'),
      beforeParentId: nullable(ref('tree_node.nodeId')),
      afterParentId: nullable(ref('tree_node.nodeId')),
      tombstone: boolean(),
      identityPreserved: boolean()
    }
  }),
  cycle_rejected: relation<CycleRejectedRow>({
    key: 'moveId',
    fields: {
      moveId: ref('tree_move.moveId'),
      nodeId: ref('tree_node.nodeId'),
      parentId: nullable(ref('tree_node.nodeId')),
      ancestorPath: anchoredPath(),
      rejected: boolean()
    }
  })
});

type MutableTreeNode = {
  nodeId: TreeNodeId;
  parentId: TreeNodeId | null;
  orderKey: string;
  label?: string;
  tombstone: boolean;
};

type MoveOutcome = {
  readonly operation: TreeMoveOperation;
  readonly fromParentId: TreeNodeId | null;
  readonly accepted: boolean;
  readonly reason?: TreeConflictCode;
};

/**
 * Reference reducer for Patchpit/Royal document identity experiments.
 *
 * Automerge mapping: `nodeId` is the stand-in for an Automerge object ID, while
 * `parentId`/`orderKey` model list membership. The operation clock is only a
 * deterministic prototype tiebreaker; it is not an Automerge op ID or sync rule.
 */
export function applyTreeMovePrototype(
  seedNodes: readonly TreeSeedNode[],
  operations: readonly TreeOperation[]
): TreeMovePrototypeResult {
  const nodes = seedTree(seedNodes);
  const conflicts: TreeConflictRow[] = [];
  const cycleRejected: CycleRejectedRow[] = [];
  const acceptedMoveByNode = new Map<TreeNodeId, TreeMoveOperation>();

  for (const operation of sortedOperations(operations).filter(isDeleteOperation)) {
    const node = nodes.get(operation.nodeId);

    if (node === undefined) {
      conflicts.push(conflict('missing_node', operation.nodeId, operation.operationId, 'delete target is missing'));
      continue;
    }

    node.tombstone = true;
  }

  const moveOutcomes: MoveOutcome[] = [];

  for (const operation of sortedOperations(operations).filter(isMoveOperation)) {
    const node = nodes.get(operation.nodeId);
    const fromParentId = node?.parentId ?? null;
    const acceptedMove = acceptedMoveByNode.get(operation.nodeId);

    if (acceptedMove !== undefined) {
      moveOutcomes.push({
        operation,
        fromParentId,
        accepted: false,
        reason: 'duplicate_subtree_prevented'
      });
      conflicts.push({
        conflictId: `duplicate:${operation.operationId}`,
        code: 'duplicate_subtree_prevented',
        nodeId: operation.nodeId,
        winnerOperationId: acceptedMove.operationId,
        loserOperationId: operation.operationId,
        message: `move ${operation.operationId} lost to ${acceptedMove.operationId}; one object keeps one parent`
      });
      continue;
    }

    const rejection = rejectReason(nodes, operation);

    if (rejection !== undefined) {
      moveOutcomes.push({
        operation,
        fromParentId,
        accepted: false,
        reason: rejection.code
      });
      conflicts.push(conflict(rejection.code, operation.nodeId, operation.operationId, rejection.message));

      if (rejection.code === 'cycle_rejected') {
        cycleRejected.push({
          moveId: operation.operationId,
          nodeId: operation.nodeId,
          parentId: operation.parentId,
          ancestorPath: pathFor(nodes, operation.parentId).join('/'),
          rejected: true
        });
      }

      continue;
    }

    const targetNode = nodes.get(operation.nodeId);

    if (targetNode === undefined) {
      continue;
    }

    moveOutcomes.push({
      operation,
      fromParentId,
      accepted: true
    });
    targetNode.parentId = operation.parentId;
    targetNode.orderKey = operation.orderKey;
    acceptedMoveByNode.set(operation.nodeId, operation);
  }

  const treeNodeRows = treeRows(nodes);
  const treeNodeRowsById = new Map(treeNodeRows.map((node) => [node.nodeId, node]));

  return {
    rows: {
      tree_node: treeNodeRows,
      tree_move: moveRows(moveOutcomes),
      tree_conflict: sortedConflicts(conflicts),
      identity_preserved: identityRows(seedNodes, nodes),
      cycle_rejected: cycleRejected.sort((left, right) => left.moveId.localeCompare(right.moveId))
    },
    resolve: (reference) => resolveTreeReference(treeNodeRowsById, reference)
  };
}

function seedTree(seedNodes: readonly TreeSeedNode[]): Map<TreeNodeId, MutableTreeNode> {
  const nodes = new Map<TreeNodeId, MutableTreeNode>();

  for (const seedNode of seedNodes) {
    if (nodes.has(seedNode.nodeId)) {
      throw new Error(`duplicate seed node id ${seedNode.nodeId}`);
    }

    nodes.set(seedNode.nodeId, {
      nodeId: seedNode.nodeId,
      parentId: seedNode.parentId,
      orderKey: seedNode.orderKey,
      ...(seedNode.label === undefined ? {} : { label: seedNode.label }),
      tombstone: false
    });
  }

  return nodes;
}

function sortedOperations<const Operation extends TreeOperation>(operations: readonly Operation[]): Operation[] {
  return [...operations].sort((left, right) => -compareOperation(left, right));
}

function compareOperation(left: TreeOperation, right: TreeOperation): number {
  return (
    left.sequence - right.sequence ||
    left.actorId.localeCompare(right.actorId) ||
    left.operationId.localeCompare(right.operationId)
  );
}

function isMoveOperation(operation: TreeOperation): operation is TreeMoveOperation {
  return operation.kind === 'move';
}

function isDeleteOperation(operation: TreeOperation): operation is TreeDeleteOperation {
  return operation.kind === 'delete';
}

function rejectReason(
  nodes: ReadonlyMap<TreeNodeId, MutableTreeNode>,
  operation: TreeMoveOperation
): { readonly code: TreeConflictCode; readonly message: string } | undefined {
  const node = nodes.get(operation.nodeId);

  if (node === undefined) {
    return { code: 'missing_node', message: 'move target is missing' };
  }

  if (node.tombstone) {
    return { code: 'deleted_node', message: 'delete wins over a move of the same object' };
  }

  if (operation.parentId !== null) {
    const parent = nodes.get(operation.parentId);

    if (parent === undefined) {
      return { code: 'missing_parent', message: 'move parent is missing' };
    }

    if (parent.tombstone || hasTombstoneAncestor(nodes, parent.nodeId)) {
      return { code: 'deleted_parent', message: 'move parent is deleted or hidden by a deleted ancestor' };
    }
  }

  if (wouldCreateCycle(nodes, operation.nodeId, operation.parentId)) {
    return { code: 'cycle_rejected', message: 'move would make the node its own ancestor' };
  }

  return undefined;
}

function hasTombstoneAncestor(nodes: ReadonlyMap<TreeNodeId, MutableTreeNode>, nodeId: TreeNodeId): boolean {
  let parentId = nodes.get(nodeId)?.parentId ?? null;
  const seen = new Set<TreeNodeId>();

  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = nodes.get(parentId);

    if (parent === undefined) {
      return false;
    }

    if (parent.tombstone) {
      return true;
    }

    parentId = parent.parentId;
  }

  return false;
}

function wouldCreateCycle(
  nodes: ReadonlyMap<TreeNodeId, MutableTreeNode>,
  nodeId: TreeNodeId,
  parentId: TreeNodeId | null
): boolean {
  let currentParentId = parentId;
  const seen = new Set<TreeNodeId>();

  while (currentParentId !== null) {
    if (currentParentId === nodeId) {
      return true;
    }

    if (seen.has(currentParentId)) {
      return true;
    }

    seen.add(currentParentId);
    currentParentId = nodes.get(currentParentId)?.parentId ?? null;
  }

  return false;
}

function treeRows(nodes: ReadonlyMap<TreeNodeId, MutableTreeNode>): TreeNodeRow[] {
  return [...nodes.values()]
    .sort(compareNodesForRows)
    .map((node) => {
      const path = pathFor(nodes, node.nodeId);

      return {
        nodeId: node.nodeId,
        parentId: node.parentId,
        orderKey: node.orderKey,
        ...(node.label === undefined ? {} : { label: node.label }),
        tombstone: node.tombstone,
        visible: !node.tombstone && !hasTombstoneAncestor(nodes, node.nodeId),
        depth: Math.max(0, path.length - 1),
        path: path.join('/')
      };
    });
}

function compareNodesForRows(left: MutableTreeNode, right: MutableTreeNode): number {
  return (
    compareNullableStrings(left.parentId, right.parentId) ||
    left.orderKey.localeCompare(right.orderKey) ||
    left.nodeId.localeCompare(right.nodeId)
  );
}

function moveRows(outcomes: readonly MoveOutcome[]): TreeMoveRow[] {
  return [...outcomes]
    .sort((left, right) => left.operation.operationId.localeCompare(right.operation.operationId))
    .map(({ operation, fromParentId, accepted, reason }) => ({
      moveId: operation.operationId,
      actorId: operation.actorId,
      sequence: operation.sequence,
      nodeId: operation.nodeId,
      fromParentId,
      toParentId: operation.parentId,
      orderKey: operation.orderKey,
      accepted,
      ...(reason === undefined ? {} : { reason })
    }));
}

function identityRows(
  seedNodes: readonly TreeSeedNode[],
  nodes: ReadonlyMap<TreeNodeId, MutableTreeNode>
): IdentityPreservedRow[] {
  return [...seedNodes]
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    .map((seedNode) => {
      const node = nodes.get(seedNode.nodeId);

      return {
        nodeId: seedNode.nodeId,
        beforeParentId: seedNode.parentId,
        afterParentId: node?.parentId ?? null,
        tombstone: node?.tombstone ?? true,
        identityPreserved: node !== undefined
      };
    });
}

function sortedConflicts(conflicts: readonly TreeConflictRow[]): TreeConflictRow[] {
  return [...conflicts].sort((left, right) => left.conflictId.localeCompare(right.conflictId));
}

function conflict(
  code: TreeConflictCode,
  nodeId: TreeNodeId,
  operationId: TreeOperationId,
  message: string
): TreeConflictRow {
  return {
    conflictId: `${code}:${operationId}`,
    code,
    nodeId,
    operationId,
    message
  };
}

function pathFor(nodes: ReadonlyMap<TreeNodeId, MutableTreeNode>, nodeId: TreeNodeId | null): TreeNodeId[] {
  if (nodeId === null) {
    return [];
  }

  const path: TreeNodeId[] = [];
  const seen = new Set<TreeNodeId>();
  let currentId: TreeNodeId | null = nodeId;

  while (currentId !== null && !seen.has(currentId)) {
    seen.add(currentId);
    path.unshift(currentId);
    currentId = nodes.get(currentId)?.parentId ?? null;
  }

  return path;
}

function resolveTreeReference(
  rowsById: ReadonlyMap<TreeNodeId, TreeNodeRow>,
  reference: TreeReference
): TreeReferenceResolution {
  const node = rowsById.get(reference.nodeId);

  if (node === undefined) {
    return {
      node: undefined,
      resolvedBy: 'missing',
      stalePath: reference.path !== undefined
    };
  }

  return {
    node,
    resolvedBy: 'object_id',
    stalePath: reference.path !== undefined && reference.path.join('/') !== node.path
  };
}

function compareNullableStrings(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return -1;
  }

  if (right === null) {
    return 1;
  }

  return left.localeCompare(right);
}
