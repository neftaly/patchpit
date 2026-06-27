import { describe, expect, it } from 'vitest';
import { fromColumnarSource } from './columnar-source.js';
import {
  as,
  eq,
  evaluate,
  from,
  fromObjectSource,
  leftJoin,
  maybe,
  pipe,
  project,
  where
} from './index.js';
import { royalLensSchema, type RoyalLayoutBoxRow, type RoyalPickTargetRow, type RoyalPointerSampleRow, type RoyalRenderFlagRow } from './royal-prototype.js';

const box = as(royalLensSchema.layoutBoxes, 'box');
const flag = as(royalLensSchema.renderFlags, 'flag');
const pointer = as(royalLensSchema.pointerSamples, 'pointer');
const target = as(royalLensSchema.pickTargets, 'target');

const renderRowsByBox = pipe(
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

const pointerProbeRowsByTarget = pipe(
  from(pointer),
  leftJoin(from(target), eq(pointer.targetId, target.targetId)),
  project({
    sampleId: pointer.sampleId,
    targetId: maybe(pointer.targetId),
    targetRole: maybe(target.role),
    targetLabel: maybe(target.label)
  })
);

const boxes: readonly RoyalLayoutBoxRow[] = [
  layoutBox('box-a', 'Alpha'),
  layoutBox('box-b', 'Beta'),
  layoutBox('box-c', 'Gamma')
];

const flags: readonly RoyalRenderFlagRow[] = [
  {
    scopeId: 'royal',
    boxId: 'box-a',
    active: true,
    focused: true,
    hovered: false
  },
  {
    scopeId: 'royal',
    boxId: 'box-c',
    active: false,
    focused: false,
    hovered: true
  }
];

const pickTargets: readonly RoyalPickTargetRow[] = [
  pickTarget('box-a', 'button', 'Alpha'),
  pickTarget('box-c', 'slider', 'Gamma')
];

const pointerSamples: readonly RoyalPointerSampleRow[] = [
  pointerSample('pointer-1', 'box-a'),
  pointerSample('pointer-2', undefined),
  pointerSample('pointer-3', 'box-c')
];

describe('columnar RelationSource prototype', () => {
  it('matches object source projections and joins for Royal-shaped rows', async () => {
    const data = {
      layoutBoxes: boxes,
      renderFlags: flags,
      pickTargets,
      pointerSamples
    };

    await expectEqualResults(data, renderRowsByBox);
    await expectEqualResults(data, pointerProbeRowsByTarget);
  });

  it('keeps evaluator diagnostics sensible for invalid rows and lookup duplicates', async () => {
    const data = {
      layoutBoxes: [layoutBox('dup', 'First'), layoutBox('dup', 'Second')],
      renderFlags: [],
      pickTargets: [],
      pointerSamples: []
    };
    const invalidData = {
      layoutBoxes: [],
      renderFlags: [
        {
          scopeId: 'royal',
          boxId: 'box-a',
          active: 'yes',
          focused: true,
          hovered: false
        }
      ] as unknown as readonly RoyalRenderFlagRow[],
      pickTargets: [],
      pointerSamples: []
    };

    const duplicateBoxes = pipe(
      from(box),
      where(eq(box.boxId, 'dup')),
      project({
        boxId: box.boxId,
        label: box.label
      })
    );
    const invalidFlags = pipe(
      from(flag),
      project({
        boxId: flag.boxId,
        active: flag.active
      })
    );

    await expectEqualResults(data, renderRowsByBox);
    await expectEqualResults(data, duplicateBoxes);
    await expectEqualResults(invalidData, invalidFlags);

    const duplicateResult = await evaluate(sourceFromColumnar(data), duplicateBoxes);
    expect(duplicateResult.diagnostics).toEqual([
      {
        code: 'duplicate_key',
        key: '["royal","dup"]',
        message: 'duplicate key ["royal","dup"] in relation layoutBoxes',
        relation: 'layoutBoxes'
      }
    ]);

    const invalidResult = await evaluate(sourceFromColumnar(invalidData), invalidFlags);
    expect(invalidResult).toEqual({
      rows: [],
      diagnostics: [
        {
          code: 'invalid_row',
          detail: 'yes',
          field: 'active',
          message: 'invalid field active in relation renderFlags',
          relation: 'renderFlags'
        }
      ]
    });
  });
});

async function expectEqualResults<Row>(
  data: RoyalColumnarTestData,
  query: Parameters<typeof evaluate<Row>>[1]
): Promise<void> {
  const objectResult = await evaluate(fromObjectSource(data), query);
  const columnarResult = await evaluate(sourceFromColumnar(data), query);

  expect(columnarResult).toEqual(objectResult);
  expect(Array.from(await sourceFromColumnar(data).diagnostics?.() ?? [])).toEqual([]);
}

function sourceFromColumnar(data: RoyalColumnarTestData) {
  return fromColumnarSource([
    { relation: royalLensSchema.layoutBoxes, rows: data.layoutBoxes },
    { relation: royalLensSchema.renderFlags, rows: data.renderFlags },
    { relation: royalLensSchema.pickTargets, rows: data.pickTargets },
    { relation: royalLensSchema.pointerSamples, rows: data.pointerSamples }
  ]);
}

type RoyalColumnarTestData = {
  readonly layoutBoxes: readonly RoyalLayoutBoxRow[];
  readonly renderFlags: readonly RoyalRenderFlagRow[];
  readonly pickTargets: readonly RoyalPickTargetRow[];
  readonly pointerSamples: readonly RoyalPointerSampleRow[];
};

function layoutBox(boxId: string, label: string): RoyalLayoutBoxRow {
  return {
    scopeId: 'royal',
    boxId,
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    label,
    primitive: 'button',
    tone: 'neutral',
    hasInteraction: true
  };
}

function pickTarget(targetId: string, role: string, label: string): RoyalPickTargetRow {
  return {
    scopeId: 'royal',
    targetId,
    boxId: targetId,
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    role,
    label,
    layer: 1,
    disabled: false
  };
}

function pointerSample(sampleId: string, targetId: string | undefined): RoyalPointerSampleRow {
  return {
    scopeId: 'royal',
    sampleId,
    sequence: Number(sampleId.at(-1) ?? 0),
    kind: 'move',
    x: 5,
    y: 6,
    ...(targetId === undefined ? {} : { targetId })
  };
}
