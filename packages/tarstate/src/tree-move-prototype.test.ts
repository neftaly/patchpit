import { describe, expect, it } from 'vitest';
import { applyTreeMovePrototype, type TreeMoveOperation, type TreeSeedNode } from './tree-move-prototype.js';

const baseTree: readonly TreeSeedNode[] = [
  node('root', null, 'a'),
  node('a', 'root', 'a'),
  node('b', 'root', 'b'),
  node('lane', 'root', 'c')
];

describe('tree move CRDT prototype', () => {
  it('moves a node without changing its object identity', () => {
    const result = applyTreeMovePrototype(baseTree, [
      move('m1', 'alice', 1, 'a', 'b', 'a')
    ]);

    expect(treeNode(result, 'a')).toMatchObject({
      nodeId: 'a',
      parentId: 'b',
      path: 'root/b/a',
      visible: true
    });
    expect(result.rows.identity_preserved).toContainEqual({
      nodeId: 'a',
      beforeParentId: 'root',
      afterParentId: 'b',
      tombstone: false,
      identityPreserved: true
    });
  });

  it('converges for concurrent sibling moves regardless of delivery order', () => {
    const aToLane = move('m-a', 'alice', 1, 'a', 'lane', 'b');
    const bToLane = move('m-b', 'bob', 1, 'b', 'lane', 'a');

    const left = applyTreeMovePrototype(baseTree, [aToLane, bToLane]);
    const right = applyTreeMovePrototype(baseTree, [bToLane, aToLane]);

    expect(left.rows).toEqual(right.rows);
    expect(childrenOf(left.rows.tree_node, 'lane').map((row) => row.nodeId)).toEqual(['b', 'a']);
    expect(left.rows.tree_move).toEqual([
      expect.objectContaining({ moveId: 'm-a', accepted: true }),
      expect.objectContaining({ moveId: 'm-b', accepted: true })
    ]);
  });

  it('lets a moved child escape a concurrent parent delete while the deleted parent stays tombstoned', () => {
    const result = applyTreeMovePrototype([
      node('root', null, 'a'),
      node('section', 'root', 'a'),
      node('card', 'section', 'a')
    ], [
      { kind: 'delete', operationId: 'd-section', actorId: 'alice', sequence: 1, nodeId: 'section' },
      move('m-card', 'bob', 1, 'card', 'root', 'b')
    ]);

    expect(treeNode(result, 'section')).toMatchObject({
      tombstone: true,
      visible: false
    });
    expect(treeNode(result, 'card')).toMatchObject({
      parentId: 'root',
      path: 'root/card',
      visible: true
    });
    expect(identity(result, 'card')).toMatchObject({
      beforeParentId: 'section',
      afterParentId: 'root',
      identityPreserved: true
    });
  });

  it('rejects reparenting that would create a cycle', () => {
    const result = applyTreeMovePrototype([
      node('root', null, 'a'),
      node('a', 'root', 'a'),
      node('b', 'a', 'a')
    ], [
      move('m-cycle', 'alice', 1, 'a', 'b', 'a')
    ]);

    expect(treeNode(result, 'a')).toMatchObject({
      parentId: 'root',
      path: 'root/a'
    });
    expect(result.rows.tree_conflict).toContainEqual({
      conflictId: 'cycle_rejected:m-cycle',
      code: 'cycle_rejected',
      nodeId: 'a',
      operationId: 'm-cycle',
      message: 'move would make the node its own ancestor'
    });
    expect(result.rows.cycle_rejected).toEqual([
      {
        moveId: 'm-cycle',
        nodeId: 'a',
        parentId: 'b',
        ancestorPath: 'root/a/b',
        rejected: true
      }
    ]);
  });

  it('prevents duplicate subtrees when concurrent moves target the same object', () => {
    const result = applyTreeMovePrototype(baseTree, [
      move('m-a-left', 'alice', 1, 'a', 'b', 'a'),
      move('m-a-right', 'bob', 1, 'a', 'lane', 'a')
    ]);

    expect(treeNode(result, 'a')).toMatchObject({
      parentId: 'lane',
      path: 'root/lane/a'
    });
    expect(result.rows.tree_move).toEqual([
      expect.objectContaining({ moveId: 'm-a-left', accepted: false, reason: 'duplicate_subtree_prevented' }),
      expect.objectContaining({ moveId: 'm-a-right', accepted: true })
    ]);
    expect(result.rows.tree_conflict).toContainEqual({
      conflictId: 'duplicate:m-a-left',
      code: 'duplicate_subtree_prevented',
      nodeId: 'a',
      winnerOperationId: 'm-a-right',
      loserOperationId: 'm-a-left',
      message: 'move m-a-left lost to m-a-right; one object keeps one parent'
    });
    expect(result.rows.tree_node.filter((row) => row.nodeId === 'a')).toHaveLength(1);
  });

  it('resolves stale path references by stable object ID when possible', () => {
    const result = applyTreeMovePrototype(baseTree, [
      move('m1', 'alice', 1, 'a', 'b', 'a', ['root', 'a'])
    ]);

    expect(result.resolve({ nodeId: 'a', path: ['root', 'a'] })).toEqual({
      node: treeNode(result, 'a'),
      resolvedBy: 'object_id',
      stalePath: true
    });
    expect(result.resolve({ nodeId: 'missing', path: ['root', 'missing'] })).toEqual({
      node: undefined,
      resolvedBy: 'missing',
      stalePath: true
    });
  });
});

function node(nodeId: string, parentId: string | null, orderKey: string): TreeSeedNode {
  return { nodeId, parentId, orderKey };
}

function move(
  operationId: string,
  actorId: string,
  sequence: number,
  nodeId: string,
  parentId: string | null,
  orderKey: string,
  referencePath?: readonly string[]
): TreeMoveOperation {
  return {
    kind: 'move',
    operationId,
    actorId,
    sequence,
    nodeId,
    parentId,
    orderKey,
    ...(referencePath === undefined ? {} : { referencePath })
  };
}

function treeNode(result: ReturnType<typeof applyTreeMovePrototype>, nodeId: string) {
  const row = result.rows.tree_node.find((candidate) => candidate.nodeId === nodeId);
  expect(row).toBeDefined();
  return row;
}

function identity(result: ReturnType<typeof applyTreeMovePrototype>, nodeId: string) {
  const row = result.rows.identity_preserved.find((candidate) => candidate.nodeId === nodeId);
  expect(row).toBeDefined();
  return row;
}

function childrenOf(rows: ReturnType<typeof applyTreeMovePrototype>['rows']['tree_node'], parentId: string) {
  return rows
    .filter((row) => row.parentId === parentId)
    .sort((left, right) => left.orderKey.localeCompare(right.orderKey) || left.nodeId.localeCompare(right.nodeId));
}
