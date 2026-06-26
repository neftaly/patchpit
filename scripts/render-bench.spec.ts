import {
  boxGeometry,
  directionalLight,
  mesh,
  pass,
  perspectiveCamera,
  scene,
  standardMaterial,
  type MeshNode
} from '@royal/renderer-core';
import { createRoot, type ReactReglRoot } from 'react-regl-fiber';
import { describe, expect, it } from 'vitest';
import { composeTransform } from '../packages/react-regl-fiber/src/webgl/matrix';
import { fakeCanvas, fakeGl } from '../tests/webgl-test-utils';

const camera = perspectiveCamera({
  position: [0, 0, 5],
  rotation: [0, 0, 0],
  fovY: Math.PI / 4,
  near: 0.1,
  far: 1000
});
const cube = boxGeometry({ size: [1, 1, 1] });
const red = standardMaterial({ color: [1, 0, 0, 1] });
const light = directionalLight({
  direction: [1, -2, -1],
  color: [1, 1, 1, 1]
});

const makeMesh = (index: number): MeshNode => mesh({
  geometry: cube,
  material: red,
  transform: {
    position: [index % 32, Math.floor(index / 32), 0],
    rotation: [index * 0.001, index * 0.002, 0]
  }
});

const meshes = Array.from({ length: 1000 }, (_, index) => makeMesh(index));
const first100Meshes = meshes.slice(0, 100);
const transforms = meshes.map((node) => node.transform);

const measure = (
  name: string,
  iterations: number,
  callback: () => void
): number => {
  const start = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    callback();
  }

  const perRunMs = (performance.now() - start) / iterations;

  console.log(`${name}: ${perRunMs.toFixed(4)} ms/run`);
  return perRunMs;
};

describe('tiny render benchmarks', () => {
  it('measures render graph construction', () => {
    const perRunMs = measure('build 1000 mesh nodes', 1000, () => {
      scene({
        children: [
          pass({
            camera,
            children: [light, ...meshes.map((_, index) => makeMesh(index))]
          })
        ]
      });
    });

    expect(perRunMs).toBeGreaterThanOrEqual(0);
  });

  it('measures transform composition', () => {
    let checksum = 0;
    const perRunMs = measure('compose 1000 transforms', 1000, () => {
      for (const transform of transforms) {
        checksum += composeTransform(transform)[12] ?? 0;
      }
    });

    expect(perRunMs).toBeGreaterThanOrEqual(0);
    expect(checksum).not.toBe(0);
  });

  it('measures render command smoke', () => {
    const root: ReactReglRoot = createRoot(fakeCanvas(fakeGl().gl));
    const renderScene = scene({
      children: [
        pass({
          camera,
          children: [light, ...first100Meshes]
        })
      ]
    });
    const perRunMs = measure('render 100 box meshes with fake WebGL', 1000, () => {
      root.render(renderScene);
    });

    root.unmount();

    expect(perRunMs).toBeGreaterThanOrEqual(0);
  });
});
