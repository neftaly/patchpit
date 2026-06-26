import {
  boxGeometry,
  mesh,
  pass,
  perspectiveCamera,
  scene,
  sceneSource,
  standardMaterial,
  yUpRightHanded,
  type RenderRoot
} from '@royal/renderer-core';
import { latestAnimalPoseRows } from './animal-state';
import type {
  InfinigenAnimalPoseRow,
  InfinigenInstanceEvent,
  InfinigenResetEvent,
  InfinigenStreamEvent,
  InfinigenTerrainEvent
} from './protocol';

export const infinigenRoyalSceneSource = sceneSource({
  coordinateSystem: yUpRightHanded,
  id: 'infinigen-stream'
});

export async function createRoyalInfinigenScene(events: readonly InfinigenStreamEvent[]): Promise<RenderRoot> {
  const reset = events.find((event): event is InfinigenResetEvent => event.type === 'reset');
  const poseRows = events.flatMap((event) => event.type === 'relationPatch' ? event.rows : []);
  const latestPoses = await latestAnimalPoseRows(poseRows);
  const poseByAnimal = new Map(latestPoses.rows.map((row) => [row.entityId, row]));
  const nodes = events.flatMap((event) => {
    switch (event.type) {
      case 'instance':
        return [royalInstanceNode(event, poseByAnimal.get(event.id))];
      case 'terrain':
        return [royalTerrainNode(event)];
      default:
        return [];
    }
  });

  return scene({
    children: [
      pass({
        camera: perspectiveCamera({
          far: 80000,
          fovY: Math.PI / 3,
          near: 0.05,
          position: reset?.camera.position ?? [0, 18, 24],
          rotation: [0, 0, 0]
        }),
        children: nodes,
        clearColor: [0.05, 0.055, 0.052, 1]
      })
    ]
  });
}

function royalInstanceNode(event: InfinigenInstanceEvent, poseRow: InfinigenAnimalPoseRow | undefined) {
  return mesh({
    geometry: boxGeometry({ size: [1, 1, 1] }),
    material: standardMaterial({ color: event.material.color }),
    transform: {
      position: poseRow === undefined ? event.position : [poseRow.x, poseRow.y, poseRow.z],
      rotation: poseRow === undefined ? event.rotation : [poseRow.rx, poseRow.ry, poseRow.rz],
      scale: event.scale
    }
  });
}

function royalTerrainNode(event: InfinigenTerrainEvent) {
  const position = event.position ?? [0, 0, 0];
  const y = averageHeight(event.samples);

  return mesh({
    geometry: boxGeometry({ size: [event.size, 0.08, event.size] }),
    material: standardMaterial({ color: event.material.color }),
    transform: {
      position: [position[0], position[1] + y, position[2]],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }
  });
}

function averageHeight(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0;
  }

  return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
}
