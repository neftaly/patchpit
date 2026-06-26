import {
  boxGeometry,
  directionalLight,
  gltf,
  mesh,
  pass,
  perspectiveCamera,
  scene,
  standardMaterial
} from '@royal/renderer-core';
import { createRoot } from 'react-regl-fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeCanvas,
  fakeGl,
  installGltfFixture,
  waitFor
} from './webgl-test-utils';

const camera = perspectiveCamera({
  position: [0, 0, 5],
  rotation: [0, 0, 0],
  fovY: Math.PI / 4,
  near: 0.1,
  far: 1000
});
const cube = boxGeometry({ size: [1, 1, 1] });
const material = standardMaterial({ color: [1, 0, 0, 1] });
const light = directionalLight({ direction: [1, -2, -1], color: [1, 1, 1, 1] });
const renderScene = scene({
  children: [
    pass({
      camera,
      children: [
        light,
        mesh({ geometry: cube, material })
      ]
    })
  ]
});

describe('WebGL resource lifetime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches geometry buffers and releases them on unmount', () => {
    const { counts, gl } = fakeGl();
    const root = createRoot(fakeCanvas(gl));

    root.render(renderScene);
    root.render(renderScene);

    expect(counts.createBuffer).toBe(3);
    expect(counts.deleteBuffer).toBe(0);

    root.unmount();

    expect(counts.deleteBuffer).toBe(3);
  });

  it('releases glTF buffers and textures on unmount', async () => {
    installGltfFixture();
    const { counts, gl } = fakeGl();
    const root = createRoot(fakeCanvas(gl));
    const renderGltfScene = scene({
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

    root.render(renderGltfScene);
    await waitFor(() => counts.drawElements > 0);
    root.render(renderGltfScene);

    expect(counts.createBuffer).toBeGreaterThan(0);
    expect(counts.createTexture).toBeGreaterThan(0);
    expect(counts.deleteBuffer).toBe(0);
    expect(counts.deleteTexture).toBe(0);

    root.unmount();

    expect(counts.deleteBuffer).toBe(counts.createBuffer);
    expect(counts.deleteTexture).toBe(counts.createTexture);
  });

  it('releases a late glTF texture if unmounted before image decode finishes', async () => {
    let resolveBitmap: ((image: ImageBitmap) => void) | undefined;
    installGltfFixture({
      createImageBitmap: () => new Promise((resolve) => {
        resolveBitmap = resolve;
      })
    });
    const { counts, gl } = fakeGl();
    const root = createRoot(fakeCanvas(gl));
    const renderGltfScene = scene({
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

    root.render(renderGltfScene);
    await waitFor(() => counts.drawElements > 0);
    root.unmount();

    const deletedBeforeLateTexture = counts.deleteTexture;
    resolveBitmap?.({} as ImageBitmap);
    await waitFor(() => counts.deleteTexture > deletedBeforeLateTexture);

    expect(counts.deleteBuffer).toBe(counts.createBuffer);
    expect(counts.deleteTexture).toBe(counts.createTexture);
  });
});
