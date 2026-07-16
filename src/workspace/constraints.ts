import {
  type ArtifactRef,
} from '@tarstate/core';
import { sealConstraintSet } from '@tarstate/core/artifacts/constraint-set';
import {
  type Expr,
  type QueryNode,
  type RelationUse,
} from '@tarstate/core/query';
import {
  aggregate,
  compare,
  constantValues,
  field,
  from,
  join,
  literal,
  or,
  pipe,
  select,
  union,
  unionAll,
  where,
} from '@tarstate/core/query/authoring';

type WorkspaceConstraintRelations = Readonly<Record<
  'panes' | 'placements' | 'splits' | 'state',
  RelationUse
>>;

export const sealWorkspaceConstraintSet = (
  schemaView: ArtifactRef,
  relations: WorkspaceConstraintRelations,
) => {
  const queries = workspaceConstraintQueries(relations);
  return sealConstraintSet({
    id: 'patchpit.workspace.constraints@1',
    body: {
      schemaView,
      constraints: [
        constraint(
          'patchpit.workspace.state-shape',
          'patchpit.workspace.state-cardinality',
          [relations.state.relationId],
          queries.invalidState,
        ),
        constraint(
          'patchpit.workspace.node-identity',
          'patchpit.workspace.node-id-collision',
          [relations.panes.relationId, relations.splits.relationId],
          queries.nodeCollisions,
        ),
        constraint(
          'patchpit.workspace.placement-pane',
          'patchpit.workspace.context-unmounted',
          [relations.placements.relationId, relations.panes.relationId],
          queries.unmountedPlacements,
        ),
        constraint(
          'patchpit.workspace.split-children-exist',
          'patchpit.workspace.split-child-missing',
          [relations.panes.relationId, relations.splits.relationId],
          queries.missingSplitChildren,
        ),
        constraint(
          'patchpit.workspace.split-children-differ',
          'patchpit.workspace.split-child-duplicate',
          [relations.splits.relationId],
          queries.duplicateSplitChildren,
        ),
        constraint(
          'patchpit.workspace.split-ratio',
          'patchpit.workspace.split-ratio-invalid',
          [relations.splits.relationId],
          queries.invalidSplitRatios,
        ),
        constraint(
          'patchpit.workspace.root-exists',
          'patchpit.workspace.root-missing',
          [relations.state.relationId, relations.panes.relationId, relations.splits.relationId],
          queries.missingRoots,
        ),
        constraint(
          'patchpit.workspace.layout-reachable',
          'patchpit.workspace.layout-node-unreachable',
          [relations.state.relationId, relations.panes.relationId, relations.splits.relationId],
          queries.unreachableNodes,
        ),
        constraint(
          'patchpit.workspace.layout-unshared',
          'patchpit.workspace.layout-node-shared',
          [relations.panes.relationId, relations.splits.relationId],
          queries.sharedNodes,
        ),
        constraint(
          'patchpit.workspace.layout-acyclic-root',
          'patchpit.workspace.layout-cycle',
          [relations.state.relationId, relations.splits.relationId],
          queries.rootCycles,
        ),
      ],
      requiredCapabilities: [],
    },
  });
};

const workspaceConstraintQueries = (relations: WorkspaceConstraintRelations) => {
  const panes = from(portableRelation(relations.panes), 'pane');
  const placements = from(portableRelation(relations.placements), 'placement');
  const splits = from(portableRelation(relations.splits), 'split');
  const state = from(portableRelation(relations.state), 'state');
  const nodes = pipe(
    panes,
    select('node', { id: field('pane', 'id') }),
    union(pipe(splits, select('node', { id: field('split', 'id') }))),
  );
  const edges = pipe(
    splits,
    select('edge', {
      child: field('split', 'first'),
      parent: field('split', 'id'),
    }),
    unionAll(pipe(splits, select('edge', {
      child: field('split', 'second'), parent: field('split', 'id'),
    }))),
  );
  const reachable: QueryNode = {
    kind: 'recursive',
    name: 'reachable',
    seed: pipe(state, select('reachable', { id: field('state', 'rootNodeId') })),
    step: pipe(
      { kind: 'recursion-ref', name: 'reachable' },
      join(edges, 'inner', equal(field('reachable', 'id'), field('edge', 'parent'))),
      select('reachable', { id: field('edge', 'child') }),
    ),
    key: [field('reachable', 'id')],
  };
  const incoming = pipe(edges, aggregate(
    'incoming',
    { child: field('edge', 'child') },
    { count: { kind: 'aggregate', op: 'count' } },
  ));

  const missingState = violation(pipe(
    constantValues('expected', [{ id: 'workspace' }]),
    join(state, 'anti', equal(field('expected', 'id'), field('state', 'id'))),
  ), scopeSubject('patchpit.workspace'), 'missing');
  const unexpectedState = violation(pipe(
    state,
    where(notEqual(field('state', 'id'), literal('workspace'))),
  ), rowSubject(relations.state.relationId, field('state', 'id')), 'unexpected');

  const nodeCollisions = violation(pipe(
    panes,
    join(splits, 'inner', equal(field('pane', 'id'), field('split', 'id'))),
  ), rowSubject(relations.splits.relationId, field('split', 'id')), 'pane-and-split');

  const unmountedPlacements = violation(pipe(
    placements,
    join(panes, 'anti', equal(field('placement', 'paneId'), field('pane', 'id'))),
  ), rowSubject(relations.placements.relationId, field('placement', 'contextId')), 'pane-missing');

  const missingFirst = violation(pipe(
    splits,
    join(nodes, 'anti', equal(field('split', 'first'), field('node', 'id'))),
  ), rowSubject(relations.splits.relationId, field('split', 'id')), 'first');
  const missingSecond = violation(pipe(
    splits,
    join(nodes, 'anti', equal(field('split', 'second'), field('node', 'id'))),
  ), rowSubject(relations.splits.relationId, field('split', 'id')), 'second');

  const duplicateSplitChildren = violation(pipe(
    splits,
    where(equal(field('split', 'first'), field('split', 'second'))),
  ), rowSubject(relations.splits.relationId, field('split', 'id')), 'duplicate');

  const invalidSplitRatios = violation(pipe(splits, where(or(
    compare('lte', field('split', 'ratio'), literal(0)),
    compare('gte', field('split', 'ratio'), literal(1)),
  ))), rowSubject(relations.splits.relationId, field('split', 'id')), 'outside-open-unit-interval');

  const missingRoots = violation(pipe(
    state,
    join(nodes, 'anti', equal(field('state', 'rootNodeId'), field('node', 'id'))),
  ), rowSubject(relations.state.relationId, field('state', 'id')), 'node-missing');

  const unreachableNodes = violation(pipe(
    nodes,
    join(reachable, 'anti', equal(field('node', 'id'), field('reachable', 'id'))),
  ), rowSubject('patchpit.workspace.node', field('node', 'id')), 'unreachable');

  const sharedNodes = violation(pipe(incoming, where(compare(
    'gt',
    field('incoming', 'count'),
    literal(1),
  ))), rowSubject('patchpit.workspace.node', field('incoming', 'child')), 'multiple-parents');

  const rootCycles = violation(pipe(
    state,
    join(incoming, 'inner', equal(field('state', 'rootNodeId'), field('incoming', 'child'))),
  ), rowSubject('patchpit.workspace.node', field('state', 'rootNodeId')), 'root-has-parent');

  return {
    invalidState: pipe(missingState, unionAll(unexpectedState)),
    nodeCollisions,
    unmountedPlacements,
    missingSplitChildren: pipe(missingFirst, unionAll(missingSecond)),
    duplicateSplitChildren,
    invalidSplitRatios,
    missingRoots,
    unreachableNodes,
    sharedNodes,
    rootCycles,
  };
};

const constraint = (
  id: string,
  code: string,
  dependencyRelations: readonly string[],
  violationQuery: QueryNode,
) => ({
  id,
  code,
  dependencyRelations,
  violationQuery,
});

const portableRelation = ({ relationId, schemaView }: RelationUse): RelationUse => ({ relationId, schemaView });
const equal = (left: Expr, right: Expr) => compare('eq', left, right);
const notEqual = (left: Expr, right: Expr) => compare('ne', left, right);
const rowSubject = (relationId: string, key: Expr): Expr => ({
  kind: 'record',
  fields: { relationId: literal(relationId), key },
});
const scopeSubject = (scopeId: string): Expr => ({
  kind: 'record',
  fields: { scopeId: literal(scopeId) },
});
const violation = (input: QueryNode, subject: Expr, reason: string): QueryNode => pipe(input, select(
  'violation',
  {
    subject,
    details: { kind: 'record', fields: { reason: literal(reason) } },
  },
));
