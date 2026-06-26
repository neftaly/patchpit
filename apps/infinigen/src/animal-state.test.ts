import { describe, expect, it } from 'vitest';
import { AnimalPoseRelationState, latestAnimalPoseRows } from './animal-state';
import type { InfinigenAnimalPoseRow } from './protocol';

describe('Infinigen animal Tarstate relation state', () => {
  it('selects the latest pose per animal from relation rows', async () => {
    const result = await latestAnimalPoseRows([
      pose({ entityId: 'animal-b', tick: 1, x: 1 }),
      pose({ activity: 'graze', entityId: 'animal-a', tick: 4, x: 4 }),
      pose({ entityId: 'animal-a', tick: 2, x: 2 })
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({ activity: 'graze', entityId: 'animal-a', tick: 4, x: 4 }),
      expect.objectContaining({ entityId: 'animal-b', tick: 1, x: 1 })
    ]);
  });

  it('omits invalid ephemeral pose rows through Tarstate diagnostics', async () => {
    const result = await latestAnimalPoseRows([
      pose({ entityId: 'animal-a', tick: 1 }),
      { ...pose({ entityId: 'animal-b', tick: 2 }), speed: 'fast' } as unknown as InfinigenAnimalPoseRow
    ]);

    expect(result.rows).toEqual([
      expect.objectContaining({ entityId: 'animal-a', tick: 1 })
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['invalid_row']);
  });

  it('keeps compact latest-state rows across patches', async () => {
    const state = new AnimalPoseRelationState();
    await state.patch([pose({ entityId: 'animal-a', tick: 1, x: 1 })]);
    const result = await state.patch([
      pose({ entityId: 'animal-a', tick: 2, x: 2 }),
      pose({ entityId: 'animal-b', tick: 1, x: 3 })
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({ entityId: 'animal-a', tick: 2, x: 2 }),
      expect.objectContaining({ entityId: 'animal-b', tick: 1, x: 3 })
    ]);
  });
});

function pose(overrides: Partial<InfinigenAnimalPoseRow>): InfinigenAnimalPoseRow {
  return {
    entityId: 'animal-a',
    gaitPhase: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    source: 'test',
    speed: 1,
    tick: 0,
    x: 0,
    y: 0,
    z: 0,
    ...overrides
  };
}
