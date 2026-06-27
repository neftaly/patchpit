import { describe, expect, it } from 'vitest';
import { evaluate } from '@tarstate/core';
import { buildPickTargets, layoutWithYoga } from './royalChargridPrimitives';
import {
  createRoyalTarstateLensSnapshot,
  royalTarstateQueries,
  royalTarstateSchema
} from './royalTarstateLens';
import { createKitchenSinkSpec, desktopGrid } from './yogaRoyal';

describe('Royal chargrid tarstate lens', () => {
  it('projects layout, pick, and render flag rows without exposing renderer state', async () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const pickTargets = buildPickTargets(boxes);
    const snapshot = createRoyalTarstateLensSnapshot({
      layoutBoxes: boxes,
      pickTargets,
      sceneState: {
        activeIds: new Set(['button-primary']),
        focusIds: new Set(['button-primary', 'helmet'])
      }
    });

    const result = await evaluate(snapshot.source, royalTarstateQueries.renderRows);
    const button = result.rows.find((row) => row.boxId === 'button-primary');
    const helmet = result.rows.find((row) => row.boxId === 'helmet');
    const log = result.rows.find((row) => row.boxId === 'log');

    expect(Object.hasOwn(snapshot, 'renderer')).toBe(false);
    expect(snapshot.probe.rowCount(royalTarstateSchema.layoutBoxes)).toBe(boxes.length);
    expect(snapshot.probe.rowCount(royalTarstateSchema.pickTargets)).toBe(pickTargets.length);
    expect(snapshot.probe.rows(royalTarstateSchema.renderFlags)).toEqual([
      {
        scopeId: 'royal',
        boxId: 'button-primary',
        active: true,
        focused: true,
        hovered: false
      },
      {
        scopeId: 'royal',
        boxId: 'helmet',
        active: false,
        focused: true,
        hovered: false
      }
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(button).toMatchObject({ active: true, focused: true, label: 'apply' });
    expect(helmet).toMatchObject({ active: false, focused: true, primitive: 'gltfPreview' });
    expect(log).toMatchObject({ active: undefined, focused: undefined });
  });

  it('derives pick probe rows by joining pointer samples to projected targets', async () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const pickTargets = buildPickTargets(boxes);
    const helmet = pickTargets.find((target) => target.id === 'helmet');
    expect(helmet).toBeDefined();

    const snapshot = createRoyalTarstateLensSnapshot({
      layoutBoxes: boxes,
      pickTargets,
      pointerSamples: [
        {
          sampleId: 'pointer-helmet',
          sequence: 1,
          kind: 'move',
          x: helmet!.bounds.rect.x + helmet!.bounds.rect.width / 2,
          y: helmet!.bounds.rect.y + helmet!.bounds.rect.height / 2,
          targetId: 'helmet'
        }
      ]
    });

    await expect(evaluate(snapshot.source, royalTarstateQueries.pickProbeRows)).resolves.toEqual({
      rows: [
        {
          scopeId: 'royal',
          sampleId: 'pointer-helmet',
          sequence: 1,
          kind: 'move',
          x: helmet!.bounds.rect.x + helmet!.bounds.rect.width / 2,
          y: helmet!.bounds.rect.y + helmet!.bounds.rect.height / 2,
          targetId: 'helmet',
          targetRole: 'media',
          targetLabel: 'Helmet geometry'
        }
      ],
      diagnostics: []
    });
  });

  it('diagnoses stale pick, render, and pointer references', async () => {
    const boxes = layoutWithYoga(createKitchenSinkSpec(false), desktopGrid);
    const pickTargets = buildPickTargets(boxes);
    const boxesWithoutHelmet = boxes.filter((box) => box.id !== 'helmet');
    const snapshot = createRoyalTarstateLensSnapshot({
      layoutBoxes: boxesWithoutHelmet,
      pickTargets,
      sceneState: {
        focusIds: new Set(['helmet'])
      },
      pointerSamples: [
        {
          sampleId: 'pointer-missing',
          sequence: 2,
          kind: 'move',
          x: 0,
          y: 0,
          targetId: 'missing-target'
        }
      ]
    });
    const diagnostics = snapshot.probe.diagnostics.map((diagnostic) => [
      diagnostic.code,
      diagnostic.relation,
      diagnostic.field,
      diagnostic.key
    ]);
    const result = await evaluate(snapshot.source, royalTarstateQueries.renderRows);

    expect(diagnostics).toContainEqual(['missing_ref', 'pickTargets', 'boxId', 'helmet']);
    expect(diagnostics).toContainEqual(['missing_ref', 'renderFlags', 'boxId', 'helmet']);
    expect(diagnostics).toContainEqual(['missing_ref', 'pointerSamples', 'targetId', 'pointer-missing']);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'missing_ref',
      'missing_ref',
      'missing_ref'
    ]);
  });
});
