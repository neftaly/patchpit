import { describe, expect, it } from 'vitest';
import {
  and,
  as,
  boolean,
  defineSchema,
  eq,
  evaluate,
  from,
  fromObjectSource,
  id,
  join,
  leftJoin,
  maybe,
  pipe,
  project,
  ref,
  relation as tarstateRelation,
  string
} from './index.js';
import {
  atom,
  evaluateReference,
  factsFromRows,
  not as notAtom,
  program,
  referenceRelation,
  rowsForRelation,
  rule,
  v,
  wildcard
} from './datalog-reference-prototype.js';

type BoxRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly label: string;
};

type FlagRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly active: boolean;
  readonly focused: boolean;
};

type RenderRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly label: string;
  readonly active: boolean | undefined;
  readonly focused: boolean | undefined;
};

type EdgeRow = {
  readonly parentId: string;
  readonly childId: string;
};

type AncestorRow = {
  readonly ancestor: string;
  readonly descendant: string;
};

const renderSchema = defineSchema({
  layoutBoxes: tarstateRelation<BoxRow>({
    key: ['scopeId', 'boxId'],
    fields: {
      scopeId: id('scope'),
      boxId: id('box'),
      label: string()
    }
  }),
  renderFlags: tarstateRelation<FlagRow>({
    key: ['scopeId', 'boxId'],
    fields: {
      scopeId: id('scope'),
      boxId: ref('layoutBoxes.boxId'),
      active: boolean(),
      focused: boolean()
    }
  })
});

const treeSchema = defineSchema({
  edges: tarstateRelation<EdgeRow>({
    key: ['parentId', 'childId'],
    fields: {
      parentId: id('node'),
      childId: ref('edges.parentId')
    }
  })
});

const boxFact = referenceRelation('layoutBox', ['scopeId', 'boxId', 'label'] as const);
const flagFact = referenceRelation('renderFlag', ['scopeId', 'boxId', 'active', 'focused'] as const);
const renderFact = referenceRelation('renderRow', ['scopeId', 'boxId', 'label', 'active', 'focused'] as const);
const edgeFact = referenceRelation('edge', ['parentId', 'childId'] as const);
const ancestorFact = referenceRelation('ancestor', ['ancestor', 'descendant'] as const);

describe('Datalog reference prototype', () => {
  it('derives join and anti-join rows that match tarstate left join projection', async () => {
    const boxes: readonly BoxRow[] = [
      { scopeId: 'royal', boxId: 'box-a', label: 'Alpha' },
      { scopeId: 'royal', boxId: 'box-b', label: 'Beta' },
      { scopeId: 'royal', boxId: 'box-c', label: 'Gamma' }
    ];
    const flags: readonly FlagRow[] = [
      { scopeId: 'royal', boxId: 'box-a', active: true, focused: true },
      { scopeId: 'royal', boxId: 'box-c', active: false, focused: true }
    ];
    const referenceRows = sortRows(
      rowsForRelation(
        evaluateReference(
          program([
            ...factsFromRows(boxFact, boxes),
            ...factsFromRows(flagFact, flags),
            rule(
              atom(renderFact, [v('scope'), v('box'), v('label'), v('active'), v('focused')]),
              [
                atom(boxFact, [v('scope'), v('box'), v('label')]),
                atom(flagFact, [v('scope'), v('box'), v('active'), v('focused')])
              ]
            ),
            rule(
              atom(renderFact, [v('scope'), v('box'), v('label'), undefined, undefined]),
              [
                atom(boxFact, [v('scope'), v('box'), v('label')]),
                notAtom(atom(flagFact, [v('scope'), v('box'), wildcard(), wildcard()]))
              ]
            )
          ])
        ),
        renderFact
      )
    );
    const tarstateRows = sortRows((await evaluate(fromObjectSource({ layoutBoxes: boxes, renderFlags: flags }), renderRowsQuery())).rows);
    const expectedRows: readonly RenderRow[] = [
      { scopeId: 'royal', boxId: 'box-a', label: 'Alpha', active: true, focused: true },
      { scopeId: 'royal', boxId: 'box-b', label: 'Beta', active: undefined, focused: undefined },
      { scopeId: 'royal', boxId: 'box-c', label: 'Gamma', active: false, focused: true }
    ];

    expect(referenceRows).toEqual(sortRows(expectedRows));
    expect(tarstateRows).toEqual(referenceRows);
  });

  it('computes recursive closure and contains the tarstate two-hop query slice', async () => {
    const edges: readonly EdgeRow[] = [
      { parentId: 'root', childId: 'branch-a' },
      { parentId: 'root', childId: 'branch-b' },
      { parentId: 'branch-a', childId: 'leaf-a' },
      { parentId: 'branch-a', childId: 'leaf-b' },
      { parentId: 'leaf-a', childId: 'tip' }
    ];
    const evaluation = evaluateReference(
      program([
        ...factsFromRows(edgeFact, edges),
        rule(atom(ancestorFact, [v('parent'), v('child')]), [atom(edgeFact, [v('parent'), v('child')])]),
        rule(atom(ancestorFact, [v('ancestor'), v('descendant')]), [
          atom(edgeFact, [v('ancestor'), v('middle')]),
          atom(ancestorFact, [v('middle'), v('descendant')])
        ])
      ])
    );
    const closureRows = sortRows(rowsForRelation(evaluation, ancestorFact));
    const tarstateTwoHopRows = sortRows(
      (await evaluate(fromObjectSource({ edges }), twoHopAncestorQuery())).rows
    );
    const expectedClosure: readonly AncestorRow[] = [
      { ancestor: 'branch-a', descendant: 'leaf-a' },
      { ancestor: 'branch-a', descendant: 'leaf-b' },
      { ancestor: 'branch-a', descendant: 'tip' },
      { ancestor: 'leaf-a', descendant: 'tip' },
      { ancestor: 'root', descendant: 'branch-a' },
      { ancestor: 'root', descendant: 'branch-b' },
      { ancestor: 'root', descendant: 'leaf-a' },
      { ancestor: 'root', descendant: 'leaf-b' },
      { ancestor: 'root', descendant: 'tip' }
    ];
    const expectedTwoHop: readonly AncestorRow[] = [
      { ancestor: 'branch-a', descendant: 'tip' },
      { ancestor: 'root', descendant: 'leaf-a' },
      { ancestor: 'root', descendant: 'leaf-b' }
    ];

    expect(closureRows).toEqual(sortRows(expectedClosure));
    expect(tarstateTwoHopRows).toEqual(sortRows(expectedTwoHop));
    for (const row of tarstateTwoHopRows) {
      expect(closureRows).toContainEqual(row);
    }
    expect(evaluation.metrics).toMatchObject({
      initialFactCount: edges.length,
      factCount: edges.length + expectedClosure.length,
      derivedFactCount: expectedClosure.length,
      ruleCount: 2
    });
    expect(evaluation.metrics.iterations).toBeGreaterThan(1);
    expect(evaluation.metrics.candidateChecks).toBeGreaterThan(0);
    expect(evaluation.metrics.peakJoinRows).toBeGreaterThan(0);
    expect(Number.isFinite(evaluation.metrics.elapsedMs)).toBe(true);
  });
});

function renderRowsQuery() {
  const box = as(renderSchema.layoutBoxes, 'box');
  const flag = as(renderSchema.renderFlags, 'flag');

  return pipe(
    from(box),
    leftJoin(from(flag), and(eq(box.scopeId, flag.scopeId), eq(box.boxId, flag.boxId))),
    project({
      scopeId: box.scopeId,
      boxId: box.boxId,
      label: box.label,
      active: maybe(flag.active),
      focused: maybe(flag.focused)
    })
  );
}

function twoHopAncestorQuery() {
  const parent = as(treeSchema.edges, 'parent');
  const child = as(treeSchema.edges, 'child');

  return pipe(
    from(parent),
    join(from(child), eq(parent.childId, child.parentId)),
    project({
      ancestor: parent.parentId,
      descendant: child.childId
    })
  );
}

function sortRows<Row extends Record<string, unknown>>(rows: readonly Row[]): Row[] {
  return [...rows].sort((left, right) => stableRowKey(left).localeCompare(stableRowKey(right)));
}

function stableRowKey(row: Record<string, unknown>): string {
  return Object.keys(row)
    .sort()
    .map((key) => `${key}:${valueKey(row[key])}`)
    .join('|');
}

function valueKey(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}
