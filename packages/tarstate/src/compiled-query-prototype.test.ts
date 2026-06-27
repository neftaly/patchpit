import { describe, expect, it } from 'vitest';
import { compileQueryPrototype, runCompiledQueryPrototype } from './compiled-query-prototype.js';
import {
  as,
  boolean as booleanField,
  defineSchema,
  eq,
  evaluate,
  from,
  fromIndexedObjectSource,
  fromObjectSource,
  id,
  leftJoin,
  maybe,
  number as numberField,
  optional,
  pipe,
  project,
  ref,
  relation,
  string,
  where
} from './index.js';

type RenderBoxRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly primitive: string;
  readonly tone: string;
  readonly hasInteraction: boolean;
};

type RenderFlagRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly active: boolean;
  readonly focused: boolean;
  readonly hovered: boolean;
};

type PointerSampleRow = {
  readonly scopeId: string;
  readonly sampleId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly targetId?: string;
};

type PickTargetRow = {
  readonly scopeId: string;
  readonly targetId: string;
  readonly boxId: string;
  readonly role: string;
  readonly label: string;
  readonly disabled: boolean;
};

type RoyalLikeData = {
  readonly render_box: readonly RenderBoxRow[];
  readonly render_flag: readonly RenderFlagRow[];
  readonly pointer_sample: readonly PointerSampleRow[];
  readonly pick_target: readonly PickTargetRow[];
};

const royalLikeSchema = defineSchema({
  render_box: relation<RenderBoxRow>({
    key: ['scopeId', 'boxId'],
    fields: {
      scopeId: id('scope'),
      boxId: id('box'),
      x: numberField(),
      y: numberField(),
      width: numberField(),
      height: numberField(),
      label: string(),
      primitive: string(),
      tone: string(),
      hasInteraction: booleanField()
    }
  }),
  render_flag: relation<RenderFlagRow>({
    key: ['scopeId', 'boxId'],
    fields: {
      scopeId: id('scope'),
      boxId: ref('render_box.boxId'),
      active: booleanField(),
      focused: booleanField(),
      hovered: booleanField()
    }
  }),
  pointer_sample: relation<PointerSampleRow>({
    ephemeral: true,
    key: ['scopeId', 'sampleId'],
    fields: {
      scopeId: id('scope'),
      sampleId: id('pointer_sample'),
      sequence: numberField(),
      kind: string(),
      x: numberField(),
      y: numberField(),
      targetId: optional(ref('pick_target.targetId'))
    }
  }),
  pick_target: relation<PickTargetRow>({
    key: ['scopeId', 'targetId'],
    fields: {
      scopeId: id('scope'),
      targetId: id('pick_target'),
      boxId: ref('render_box.boxId'),
      role: string(),
      label: string(),
      disabled: booleanField()
    }
  })
});

const box = as(royalLikeSchema.render_box, 'box');
const flag = as(royalLikeSchema.render_flag, 'flag');
const pointer = as(royalLikeSchema.pointer_sample, 'pointer');
const target = as(royalLikeSchema.pick_target, 'target');

const renderRowsQuery = pipe(
  from(box),
  leftJoin(from(flag), eq(box.boxId, flag.boxId)),
  project({
    scopeId: box.scopeId,
    boxId: box.boxId,
    label: box.label,
    active: maybe(flag.active),
    focused: maybe(flag.focused),
    hovered: maybe(flag.hovered)
  })
);

const pointerProbeQuery = pipe(
  from(pointer),
  leftJoin(from(target), eq(pointer.targetId, target.targetId)),
  project({
    sampleId: pointer.sampleId,
    targetId: maybe(pointer.targetId),
    targetRole: maybe(target.role),
    targetLabel: maybe(target.label)
  })
);

const renderRowsWithPointersQuery = pipe(
  from(box),
  leftJoin(from(flag), eq(box.boxId, flag.boxId)),
  leftJoin(from(pointer), eq(box.boxId, pointer.targetId)),
  project({
    boxId: box.boxId,
    label: box.label,
    active: maybe(flag.active),
    sampleId: maybe(pointer.sampleId)
  })
);

const oneBoxQuery = pipe(
  from(box),
  where(eq(box.boxId, 'box-042')),
  project({
    boxId: box.boxId,
    label: box.label
  })
);

describe('compiled query prototype', () => {
  it('matches the evaluator for Royal-like render and pointer joins', async () => {
    const data = royalLikeData();

    await expectCompiledRows(data, renderRowsQuery);
    await expectCompiledRows(data, pointerProbeQuery);
    await expectCompiledRows(data, renderRowsWithPointersQuery);

    expect(compileQueryPrototype(renderRowsWithPointersQuery).steps).toEqual([
      { kind: 'scan', relation: 'render_box', alias: 'box' },
      {
        kind: 'join',
        joinKind: 'left',
        strategy: 'rightIndexLookup',
        relation: 'render_flag',
        alias: 'flag',
        field: 'boxId',
        residualPredicates: 0
      },
      {
        kind: 'join',
        joinKind: 'left',
        strategy: 'rightIndexLookup',
        relation: 'pointer_sample',
        alias: 'pointer',
        field: 'targetId',
        residualPredicates: 0
      },
      { kind: 'project', fields: ['boxId', 'label', 'active', 'sampleId'] }
    ]);
  });

  it('uses equality index scans when a literal predicate is selective', async () => {
    const data = royalLikeData();
    const compiled = compileQueryPrototype(oneBoxQuery);
    const indexed = await runCompiledQueryPrototype(fromIndexedObjectSource(data), compiled);
    const scanned = await runCompiledQueryPrototype(fromIndexedObjectSource(data), compiled, { useIndexes: false });
    const reference = await evaluate(fromObjectSource(data), oneBoxQuery);

    expect(indexed.rows).toEqual(reference.rows);
    expect(scanned.rows).toEqual(reference.rows);
    expect(compiled.steps).toEqual([
      {
        kind: 'where',
        strategy: 'indexLookup',
        relation: 'render_box',
        alias: 'box',
        field: 'boxId',
        residualPredicates: 0
      },
      { kind: 'project', fields: ['boxId', 'label'] }
    ]);
    expect(indexed.counters).toMatchObject({
      relationScans: 0,
      rowsScanned: 0,
      lookupCalls: 1,
      lookupRows: 1,
      predicateChecks: 0,
      projectedRows: 1,
      outputRows: 1
    });
    expect(scanned.counters).toMatchObject({
      relationScans: 1,
      rowsScanned: data.render_box.length,
      lookupCalls: 0,
      predicateChecks: data.render_box.length,
      projectedRows: 1,
      outputRows: 1
    });
  });

  it('cuts nested join comparisons when the right side has lookup support', async () => {
    const data = royalLikeData();
    const compiled = compileQueryPrototype(renderRowsQuery);
    const indexed = await runCompiledQueryPrototype(fromIndexedObjectSource(data), compiled);
    const nested = await runCompiledQueryPrototype(fromIndexedObjectSource(data), compiled, { useIndexes: false });

    expect(indexed.rows).toEqual(nested.rows);
    expect(indexed.counters).toMatchObject({
      relationScans: 1,
      rowsScanned: data.render_box.length,
      lookupCalls: data.render_box.length,
      lookupRows: data.render_flag.length,
      joinLookupIterations: data.render_box.length,
      joinComparisons: 0,
      leftJoinMisses: data.render_box.length - data.render_flag.length,
      projectedRows: data.render_box.length,
      outputRows: data.render_box.length
    });
    expect(nested.counters).toMatchObject({
      relationScans: 2,
      rowsScanned: data.render_box.length + data.render_flag.length,
      lookupCalls: 0,
      joinLookupIterations: 0,
      joinComparisons: data.render_box.length * data.render_flag.length,
      predicateChecks: data.render_box.length * data.render_flag.length,
      projectedRows: data.render_box.length,
      outputRows: data.render_box.length
    });
  });

  it('falls back to nested scans when a planned lookup has no source index', async () => {
    const data = royalLikeData();
    const compiled = compileQueryPrototype(pointerProbeQuery);
    const noIndex = await runCompiledQueryPrototype(fromObjectSource(data), compiled);
    const reference = await evaluate(fromObjectSource(data), pointerProbeQuery);

    expect(noIndex.rows).toEqual(reference.rows);
    expect(noIndex.counters).toMatchObject({
      relationScans: 2,
      rowsScanned: data.pointer_sample.length + data.pick_target.length,
      lookupCalls: 0,
      lookupUnsupported: 1,
      joinComparisons: data.pointer_sample.length * data.pick_target.length,
      projectedRows: data.pointer_sample.length,
      outputRows: data.pointer_sample.length
    });
  });
});

async function expectCompiledRows<Row>(data: RoyalLikeData, query: Parameters<typeof evaluate<Row>>[1]): Promise<void> {
  const compiled = compileQueryPrototype(query);
  const compiledResult = await runCompiledQueryPrototype(fromIndexedObjectSource(data), compiled);
  const reference = await evaluate(fromObjectSource(data), query);

  expect(compiledResult.rows).toEqual(reference.rows);
}

function royalLikeData(): RoyalLikeData {
  const renderBoxRows = Array.from({ length: 120 }, (_value, index) => renderBox(index));

  return {
    render_box: renderBoxRows,
    render_flag: renderBoxRows.filter((_row, index) => index % 6 === 0).map((_row, index) => renderFlag(index * 6)),
    pointer_sample: Array.from({ length: 96 }, (_value, index) => pointerSample(index)),
    pick_target: renderBoxRows.filter((_row, index) => index % 3 === 0).map((_row, index) => pickTarget(index * 3))
  };
}

function renderBox(index: number): RenderBoxRow {
  return {
    scopeId: 'royal',
    boxId: boxId(index),
    x: index % 12,
    y: Math.floor(index / 12),
    width: 4,
    height: 2,
    label: `Control ${index}`,
    primitive: index % 2 === 0 ? 'button' : 'field',
    tone: index % 5 === 0 ? 'accent' : 'neutral',
    hasInteraction: index % 4 !== 0
  };
}

function renderFlag(index: number): RenderFlagRow {
  return {
    scopeId: 'royal',
    boxId: boxId(index),
    active: index % 12 === 0,
    focused: index === 42,
    hovered: index % 18 === 0
  };
}

function pointerSample(index: number): PointerSampleRow {
  return {
    scopeId: 'royal',
    sampleId: `pointer-${index.toString().padStart(3, '0')}`,
    sequence: index,
    kind: 'move',
    x: index % 12,
    y: Math.floor(index / 12),
    ...(index % 4 === 0 ? {} : { targetId: boxId((index * 3) % 120) })
  };
}

function pickTarget(index: number): PickTargetRow {
  return {
    scopeId: 'royal',
    targetId: boxId(index),
    boxId: boxId(index),
    role: index % 2 === 0 ? 'button' : 'input',
    label: `Target ${index}`,
    disabled: index % 15 === 0
  };
}

function boxId(index: number): string {
  return `box-${index.toString().padStart(3, '0')}`;
}
