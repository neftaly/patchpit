import { describe, expect, it } from 'vitest';
import { RenderGraphKind, RenderNodeKind } from '@royal/renderer-core';
import { createRoyalInfinigenScene, infinigenRoyalSceneSource } from './royal-scene';
import type { InfinigenStreamEvent } from './protocol';

describe('Infinigen Royal scene adapter', () => {
  it('declares the Infinigen stream coordinate source for Royal', () => {
    expect(infinigenRoyalSceneSource).toMatchObject({
      id: 'infinigen-stream',
      coordinateSystem: {
        handedness: 'right',
        unit: 'meter',
        up: { axis: 'y', sign: 1 }
      }
    });
  });

  it('turns stream rows into a Royal render scene', async () => {
    const scene = await createRoyalInfinigenScene([
      resetEvent,
      terrainEvent,
      animalEvent,
      posePatch(4, [8, 1.5, 9])
    ]);
    const renderPass = scene.children[0];

    expect(scene.kind).toBe(RenderGraphKind.Scene);
    expect(renderPass?.children).toHaveLength(2);
    expect(renderPass?.children.map((node) => node.kind)).toEqual([
      RenderNodeKind.Mesh,
      RenderNodeKind.Mesh
    ]);
    expect(renderPass?.children[1]).toMatchObject({
      transform: {
        position: [8, 1.5, 9]
      }
    });
  });
});

const resetEvent = {
  camera: {
    position: [12, 8, 16],
    target: [0, 0, 0]
  },
  seed: 'royal-test',
  type: 'reset'
} satisfies InfinigenStreamEvent;

const terrainEvent = {
  columns: 2,
  material: {
    color: [0.25, 0.5, 0.25, 1],
    roughness: 0.9
  },
  rows: 2,
  samples: [0, 1, 2, 3],
  size: 32,
  type: 'terrain'
} satisfies InfinigenStreamEvent;

const animalEvent = {
  id: 'animal-a',
  kind: 'animal',
  material: {
    color: [0.4, 0.3, 0.2, 1],
    roughness: 0.8
  },
  position: [1, 1, 1],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  type: 'instance'
} satisfies InfinigenStreamEvent;

function posePatch(tick: number, position: readonly [number, number, number]): InfinigenStreamEvent {
  return {
    relation: 'animalPose',
    rows: [
      {
        entityId: 'animal-a',
        gaitPhase: 0,
        rx: 0,
        ry: 0.4,
        rz: 0,
        source: 'test',
        speed: 1,
        tick,
        x: position[0],
        y: position[1],
        z: position[2]
      }
    ],
    type: 'relationPatch'
  };
}
