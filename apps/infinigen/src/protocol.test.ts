import { describe, expect, it } from 'vitest';
import { parseInfinigenStreamEvent } from './protocol';

describe('Infinigen stream protocol', () => {
  it('accepts a complete instance event', () => {
    expect(parseInfinigenStreamEvent({
      id: 'crystal-1',
      kind: 'crystal',
      material: {
        color: [0.2, 0.7, 0.9, 1],
        roughness: 0.25
      },
      position: [1, 2, 3],
      rotation: [0, 1, 0],
      scale: [1, 2, 1],
      type: 'instance'
    })).toMatchObject({
      id: 'crystal-1',
      kind: 'crystal',
      type: 'instance'
    });
  });

  it('accepts LINZ building footprint instances', () => {
    expect(parseInfinigenStreamEvent({
      id: 'linz-building-1',
      kind: 'building',
      material: {
        color: [0.6, 0.55, 0.48, 1],
        roughness: 0.9
      },
      position: [1, 0.2, 3],
      rotation: [0, 0.4, 0],
      scale: [1.2, 0.3, 1],
      type: 'instance'
    })).toMatchObject({
      id: 'linz-building-1',
      kind: 'building',
      type: 'instance'
    });
  });

  it('accepts bounded terrain with an exact sample count', () => {
    expect(parseInfinigenStreamEvent({
      columns: 2,
      material: {
        color: [0.32, 0.42, 0.27, 1],
        roughness: 0.94
      },
      rows: 2,
      samples: [0, 0.1, 0.2, 0.3],
      size: 42,
      type: 'terrain'
    })).toMatchObject({
      columns: 2,
      rows: 2,
      type: 'terrain'
    });
  });

  it('accepts relation-shaped animal pose patches', () => {
    expect(parseInfinigenStreamEvent({
      relation: 'animalPose',
      rows: [
        {
          entityId: 'animal-1',
          gaitPhase: 1.25,
          rx: 0,
          ry: 0.5,
          rz: 0,
          source: 'dev-stream',
          speed: 1.2,
          tick: 12,
          x: 1,
          y: 2,
          z: 3
        }
      ],
      type: 'relationPatch'
    })).toMatchObject({
      relation: 'animalPose',
      rows: [
        {
          entityId: 'animal-1',
          tick: 12
        }
      ],
      type: 'relationPatch'
    });
  });

  it('rejects malformed fuzz payloads before rendering', () => {
    const payloads: readonly unknown[] = [
      null,
      [],
      { type: 'instance', kind: 'cedar' },
      { type: 'instance', id: 'x', kind: 'script', material: {}, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      { type: 'terrain', columns: 2.2, rows: 2, samples: [0, 1, 2, 3], size: 1, material: { color: [1, 1, 1, 1] } },
      { type: 'terrain', columns: 129, rows: 2, samples: [], size: 1, material: { color: [1, 1, 1, 1] } },
      { type: 'terrain', columns: 2, rows: 2, samples: [0, 1, 2], size: 1, material: { color: [1, 1, 1, 1] } },
      { type: 'water', color: [0, 1, 1], opacity: 0.5, radius: 1, y: 0 },
      { type: 'water', color: [0, 1, 1, 1], opacity: 1.2, radius: 1, y: 0 },
      { type: 'status', message: 'ok', progress: Number.NaN },
      { type: 'relationPatch', relation: 'pose', rows: [] },
      { type: 'relationPatch', relation: 'animalPose', rows: [{ entityId: 'animal-1' }] }
    ];

    for (const payload of payloads) {
      expect(() => parseInfinigenStreamEvent(payload)).toThrow();
    }
  });

  it('survives a deterministic malformed input corpus', () => {
    let state = 0xdecafbad;
    const values: readonly unknown[] = [
      null,
      true,
      '',
      [],
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      'cedar',
      [1, 2, 3],
      { type: 'status' },
      { color: [2, -1, 0, 1] }
    ];

    for (let index = 0; index < 128; index += 1) {
      state = Math.imul(state ^ (state >>> 15), 2246822507);
      const left = values[state % values.length];
      state = Math.imul(state ^ (state >>> 13), 3266489909);
      const right = values[state % values.length];
      const payload = {
        id: left,
        kind: right,
        material: { color: right },
        position: left,
        progress: right,
        rotation: right,
        scale: left,
        type: values[index % values.length]
      };

      expect(() => parseInfinigenStreamEvent(payload)).toThrow();
    }
  });
});
