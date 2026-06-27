import { describe, expect, it } from 'vitest';
import {
  clusteredClusterKey,
  planClusteredLightingFeatureGate,
  runClusteredLightingPrototype,
  type ClusteredLightingBenchmarkCounterName,
  type ClusteredLightingPrototypeInput,
  type ClusteredLightingPrototypeRows
} from './clusteredLightingPrototype';

const baseCamera: ClusteredLightingPrototypeInput['camera'] = {
  cameraId: 'main-camera',
  farZ: 9,
  fovYDegrees: 90,
  nearZ: 1,
  viewportHeight: 100,
  viewportWidth: 100
};

describe('clustered lighting prototype', () => {
  it('assigns deterministic lights to stable cluster slots', () => {
    const input: ClusteredLightingPrototypeInput = {
      camera: baseCamera,
      frame: 12,
      grid: {
        maxLightsPerCluster: 4,
        slicesZ: 2,
        tilesX: 2,
        tilesY: 2
      },
      lights: [
        {
          intensity: 6,
          lightId: 'left-front',
          position: [-1, -1, -3],
          range: 0.5
        },
        {
          intensity: 12,
          lightId: 'right-back',
          position: [1, 1, -7],
          range: 0.5
        }
      ],
      scopeId: 'lighting-test'
    };
    const first = runClusteredLightingPrototype(input);
    const second = runClusteredLightingPrototype(input);

    expect(second).toEqual(first);
    expect(first.clustered_cluster).toHaveLength(8);
    expect(first.clustered_cluster.map((cluster) => cluster.clusterId)).toEqual([
      'z0:y0:x0',
      'z0:y0:x1',
      'z0:y1:x0',
      'z0:y1:x1',
      'z1:y0:x0',
      'z1:y0:x1',
      'z1:y1:x0',
      'z1:y1:x1'
    ]);
    expect(first.clustered_cluster_light_assignment).toEqual([
      {
        clusterId: 'z0:y0:x0',
        frame: 12,
        influenceScore: 2,
        lightId: 'left-front',
        lightKind: 'point',
        lightOrdinal: 0,
        reason: 'projected_sphere_overlap',
        relation: 'clustered_cluster_light_assignment',
        scopeId: 'lighting-test',
        sliceZ: 0,
        slot: 0,
        tileX: 0,
        tileY: 0
      },
      {
        clusterId: 'z1:y1:x1',
        frame: 12,
        influenceScore: 1.714286,
        lightId: 'right-back',
        lightKind: 'point',
        lightOrdinal: 1,
        reason: 'projected_sphere_overlap',
        relation: 'clustered_cluster_light_assignment',
        scopeId: 'lighting-test',
        sliceZ: 1,
        slot: 0,
        tileX: 1,
        tileY: 1
      }
    ]);
    expect(clusterLightCounts(first)).toEqual([
      ['z0:y0:x0', 1, 0],
      ['z1:y1:x1', 1, 0]
    ]);
    expect(counterValue(first, 'accepted_light_rows')).toBe(2);
    expect(counterValue(first, 'assignment_rows')).toBe(2);
    expect(counterValue(first, 'cluster_light_tests')).toBe(2);
  });

  it('reports total light budget and per-cluster assignment overflow diagnostics', () => {
    const rows = runClusteredLightingPrototype({
      camera: baseCamera,
      frame: 4,
      grid: {
        maxLights: 2,
        maxLightsPerCluster: 1,
        slicesZ: 1,
        tilesX: 1,
        tilesY: 1
      },
      lights: [
        { lightId: 'accepted-slot', position: [0, 0, -3], range: 0.25 },
        { lightId: 'overflowed-slot', position: [0, 0, -3], range: 0.25 },
        { lightId: 'budget-culled', position: [0, 0, -3], range: 0.25 }
      ],
      scopeId: 'overflow-test'
    });

    expect(rows.clustered_light_input.map((row) => [row.lightId, row.binningStatus])).toEqual([
      ['accepted-slot', 'accepted'],
      ['overflowed-slot', 'accepted'],
      ['budget-culled', 'budget_culled']
    ]);
    expect(rows.clustered_cluster_light_assignment.map((row) => [row.lightId, row.slot])).toEqual([
      ['accepted-slot', 0]
    ]);
    expect(rows.clustered_cluster_light_count).toEqual([
      {
        capacity: 1,
        clusterId: 'z0:y0:x0',
        frame: 4,
        lightCount: 1,
        overflowCount: 1,
        relation: 'clustered_cluster_light_count',
        scopeId: 'overflow-test',
        sliceZ: 0,
        tileX: 0,
        tileY: 0
      }
    ]);
    expect(rows.clustered_diagnostic).toEqual([
      expect.objectContaining({
        code: 'clustered_light_budget_exceeded',
        detail: { acceptedLights: 2, inputLights: 3, rejectedLights: 1 },
        field: 'maxLights',
        key: null,
        severity: 'warning',
        sourceRelation: 'clustered_cluster_grid'
      }),
      expect.objectContaining({
        code: 'clustered_cluster_light_overflow',
        detail: {
          capacity: 1,
          droppedLightIds: ['overflowed-slot'],
          overflowCount: 1
        },
        field: 'maxLightsPerCluster',
        key: 'z0:y0:x0',
        severity: 'warning',
        sourceRelation: 'clustered_cluster_light_assignment'
      })
    ]);
    expect(counterValue(rows, 'overflowed_clusters')).toBe(1);
    expect(counterValue(rows, 'diagnostic_rows')).toBe(2);
  });

  it('emits feature gate rows for WebGL2 and WebGPU capability modes', () => {
    const webgl2 = planClusteredLightingFeatureGate({
      backend: 'webgl2',
      capabilities: {
        depthTexture: true,
        halfFloatTexture: true,
        instancing: true,
        webgl2: true
      },
      frame: 5,
      scopeId: 'feature-test'
    });
    const webgl2MissingFloat = planClusteredLightingFeatureGate({
      backend: 'webgl2',
      capabilities: {
        depthTexture: true,
        instancing: true,
        webgl2: true
      },
      frame: 5,
      scopeId: 'feature-test'
    });
    const webgpu = planClusteredLightingFeatureGate({
      backend: 'webgpu',
      capabilities: {
        storageBuffer: true,
        webgpu: true
      },
      frame: 6,
      scopeId: 'feature-test'
    });
    const webgpuMissingStorage = planClusteredLightingFeatureGate({
      backend: 'webgpu',
      capabilities: {
        storageBuffer: false,
        webgpu: true
      },
      frame: 6,
      scopeId: 'feature-test'
    });

    expect(webgl2.row).toMatchObject({
      backend: 'webgl2',
      enabled: true,
      missingCapabilities: [],
      mode: 'webgl2-packed-texture-lists',
      relation: 'clustered_feature_gate',
      requiredCapabilities: ['webgl2', 'depth_texture', 'float_or_half_float_texture', 'instancing']
    });
    expect(webgl2.diagnostics).toEqual([]);
    expect(webgl2MissingFloat.row).toMatchObject({
      backend: 'webgl2',
      enabled: false,
      missingCapabilities: ['float_or_half_float_texture'],
      mode: 'disabled'
    });
    expect(webgl2MissingFloat.diagnostics).toEqual([
      expect.objectContaining({
        code: 'clustered_feature_disabled',
        detail: {
          backend: 'webgl2',
          missingCapabilities: ['float_or_half_float_texture']
        },
        severity: 'warning'
      })
    ]);
    expect(webgpu.row).toMatchObject({
      backend: 'webgpu',
      enabled: true,
      missingCapabilities: [],
      mode: 'webgpu-compute-storage-buffer',
      requiredCapabilities: ['webgpu', 'storage_buffer']
    });
    expect(webgpuMissingStorage.row).toMatchObject({
      backend: 'webgpu',
      enabled: false,
      missingCapabilities: ['storage_buffer'],
      mode: 'disabled'
    });
    expect(webgpuMissingStorage.diagnostics).toHaveLength(1);
  });

  it('assigns object bounds to overlapped clusters', () => {
    const rows = runClusteredLightingPrototype({
      camera: baseCamera,
      frame: 8,
      grid: {
        maxLightsPerCluster: 2,
        slicesZ: 2,
        tilesX: 2,
        tilesY: 2
      },
      lights: [],
      objects: [
        {
          max: [-0.8, -0.8, -2.6],
          min: [-1.2, -1.2, -3.4],
          objectId: 'left-front-object'
        }
      ],
      scopeId: 'object-test'
    });

    expect(rows.clustered_object_bounds).toEqual([
      {
        frame: 8,
        maxX: -0.8,
        maxY: -0.8,
        maxZ: -2.6,
        minX: -1.2,
        minY: -1.2,
        minZ: -3.4,
        objectId: 'left-front-object',
        objectOrdinal: 0,
        receivesLight: true,
        relation: 'clustered_object_bounds',
        scopeId: 'object-test',
        status: 'assigned'
      }
    ]);
    expect(rows.clustered_object_cluster).toEqual([
      {
        clusterId: clusteredClusterKey({ sliceZ: 0, tileX: 0, tileY: 0 }),
        frame: 8,
        objectId: 'left-front-object',
        objectOrdinal: 0,
        relation: 'clustered_object_cluster',
        scopeId: 'object-test',
        sliceZ: 0,
        tileX: 0,
        tileY: 0
      }
    ]);
    expect(counterValue(rows, 'object_bounds_rows')).toBe(1);
    expect(counterValue(rows, 'object_cluster_rows')).toBe(1);
    expect(counterValue(rows, 'object_cluster_tests')).toBe(1);
  });
});

function clusterLightCounts(
  rows: ClusteredLightingPrototypeRows
): readonly (readonly [string, number, number])[] {
  return rows.clustered_cluster_light_count
    .filter((row) => row.lightCount > 0 || row.overflowCount > 0)
    .map((row) => [row.clusterId, row.lightCount, row.overflowCount]);
}

function counterValue(
  rows: ClusteredLightingPrototypeRows,
  counter: ClusteredLightingBenchmarkCounterName
): number {
  const row = rows.clustered_benchmark_counter.find((candidate) => candidate.counter === counter);
  if (row === undefined) throw new Error(`Expected counter ${counter}`);
  return row.value;
}
