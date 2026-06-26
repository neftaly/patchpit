import {
  boxGeometry,
  gltf,
  mesh,
  pass,
  perspectiveCamera,
  RenderGraphKind,
  standardMaterial,
  type RenderPass
} from '@royal/renderer-core';
import { jsx } from 'react-regl-fiber/jsx-runtime';
import { describe, expect, it } from 'vitest';

const camera = perspectiveCamera({
  position: [0, 0, 1],
  rotation: [0, 0, 0],
  fovY: Math.PI / 4,
  near: 0.1,
  far: 100
});

const cube = boxGeometry({ size: [1, 1, 1] });
const red = standardMaterial({ color: [1, 0, 0, 1] });

describe('render pass clearColor', () => {
  it('defaults to transparent black', () => {
    expect(pass({ camera, children: [] }).clearColor).toEqual([0, 0, 0, 0]);
  });

  it('keeps explicit colors through the JSX runtime', () => {
    const renderPass = jsx('pass', {
      camera,
      clearColor: [0.1, 0.2, 0.3, 1],
      children: []
    }) as RenderPass;

    expect(renderPass.kind).toBe(RenderGraphKind.Pass);
    expect(renderPass.clearColor).toEqual([0.1, 0.2, 0.3, 1]);
  });

  it('accepts one JSX camera child', () => {
    const cameraChild = jsx('perspectiveCamera', {
      position: [0, 0, 1],
      rotation: [0, 0, 0],
      fovY: Math.PI / 4,
      near: 0.1,
      far: 100
    });

    const renderPass = jsx('pass', {
      children: cameraChild
    }) as RenderPass;

    expect(renderPass.camera).toEqual(camera);
  });

  it('rejects missing JSX cameras', () => {
    expect(() => jsx('pass', { children: [] })).toThrow('pass expects exactly one camera');
  });

  it('rejects ambiguous JSX cameras', () => {
    const cameraChild = jsx('perspectiveCamera', {
      position: [0, 0, 1],
      rotation: [0, 0, 0],
      fovY: Math.PI / 4,
      near: 0.1,
      far: 100
    });

    expect(() => jsx('pass', {
      camera,
      children: cameraChild
    })).toThrow('pass expects exactly one camera');
  });

  it('rejects multiple JSX camera children', () => {
    const cameraChild = jsx('perspectiveCamera', {
      position: [0, 0, 1],
      rotation: [0, 0, 0],
      fovY: Math.PI / 4,
      near: 0.1,
      far: 100
    });

    expect(() => jsx('pass', {
      children: [cameraChild, cameraChild]
    })).toThrow('pass expects exactly one camera');
  });
});

describe('transform inputs', () => {
  it('defaults mesh scale to identity', () => {
    expect(mesh({
      geometry: cube,
      material: red,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0] }
    }).transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
  });

  it('keeps explicit glTF scale', () => {
    expect(gltf({
      src: '/DamagedHelmet/DamagedHelmet.gltf',
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 2, 2]
      }
    }).transform?.scale).toEqual([2, 2, 2]);
  });
});
