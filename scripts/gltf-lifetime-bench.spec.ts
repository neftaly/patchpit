import {
  directionalLight,
  gltf,
  pass,
  perspectiveCamera,
  scene
} from '@royal/renderer-core';
import { createRoot } from '@royal/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeCanvas,
  fakeGl,
  type FakeGlCounts,
  installGltfFixture,
  waitFor
} from '../tests/webgl-test-utils';

const camera = perspectiveCamera({
  position: [0, 0, 5],
  rotation: [0, 0, 0],
  fovY: Math.PI / 4,
  near: 0.1,
  far: 1000
});
const light = directionalLight({ direction: [1, -2, -1], color: [1, 1, 1, 1] });
const renderScene = scene({
  children: [
    pass({
      camera,
      children: [
        light,
        gltf({ src: 'https://example.test/triangle.gltf' })
      ]
    })
  ]
});

describe('glTF lifetime benchmark', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('measures repeated mount and unmount resource ownership', async () => {
    installGltfFixture();
    const iterations = 50;
    const started = performance.now();
    const totals: FakeGlCounts = {
      createBuffer: 0,
      createTexture: 0,
      deleteBuffer: 0,
      deleteTexture: 0,
      drawElements: 0
    };

    for (let index = 0; index < iterations; index += 1) {
      const { counts, gl } = fakeGl();
      const root = createRoot(fakeCanvas(gl));

      root.render(renderScene);
      await waitFor(() => counts.drawElements > 0);
      root.unmount();

      totals.createBuffer += counts.createBuffer;
      totals.createTexture += counts.createTexture;
      totals.deleteBuffer += counts.deleteBuffer;
      totals.deleteTexture += counts.deleteTexture;
      totals.drawElements += counts.drawElements;
    }

    const perRunMs = (performance.now() - started) / iterations;
    console.log(
      `mount/draw/unmount glTF: ${perRunMs.toFixed(4)} ms/run, ` +
      `buffers ${totals.createBuffer}/${totals.deleteBuffer}, ` +
      `textures ${totals.createTexture}/${totals.deleteTexture}`
    );

    expect(totals.createBuffer).toBe(totals.deleteBuffer);
    expect(totals.createTexture).toBe(totals.deleteTexture);
    expect(totals.drawElements).toBeGreaterThanOrEqual(iterations);
  });
});
