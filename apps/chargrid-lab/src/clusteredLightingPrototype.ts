export type ClusteredVec3 = readonly [number, number, number];
export type ClusteredRgb = readonly [number, number, number];

export type ClusteredDepthSliceMode = 'linear' | 'logarithmic';

export type ClusteredLightKind = 'point';

export type ClusteredCameraInput = {
  readonly cameraId: string;
  readonly farZ: number;
  readonly fovYDegrees: number;
  readonly nearZ: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
};

export type ClusteredGridInput = {
  readonly depthSliceMode?: ClusteredDepthSliceMode;
  readonly maxLights?: number;
  readonly maxLightsPerCluster?: number;
  readonly slicesZ: number;
  readonly tilesX: number;
  readonly tilesY: number;
};

export type ClusteredLightInput = {
  readonly color?: ClusteredRgb;
  readonly enabled?: boolean;
  readonly intensity?: number;
  readonly kind?: ClusteredLightKind;
  readonly lightId: string;
  readonly position: ClusteredVec3;
  readonly range: number;
};

export type ClusteredObjectBoundsInput = {
  readonly max: ClusteredVec3;
  readonly min: ClusteredVec3;
  readonly objectId: string;
  readonly receivesLight?: boolean;
};

export type ClusteredLightingRuntimeCapabilities = {
  readonly backend: 'webgl1' | 'webgl2' | 'webgpu';
  readonly capabilities?: {
    readonly depthTexture?: boolean;
    readonly floatTexture?: boolean;
    readonly halfFloatTexture?: boolean;
    readonly instancing?: boolean;
    readonly maxTextureImageUnits?: number;
    readonly storageBuffer?: boolean;
    readonly webgl2?: boolean;
    readonly webgpu?: boolean;
  };
};

export type ClusteredLightingFeatureGateInput = ClusteredLightingRuntimeCapabilities & {
  readonly frame?: number;
  readonly scopeId?: string;
};

export type ClusteredLightingPrototypeInput = {
  readonly camera: ClusteredCameraInput;
  readonly featureGate?: ClusteredLightingRuntimeCapabilities;
  readonly frame?: number;
  readonly grid: ClusteredGridInput;
  readonly lights: readonly ClusteredLightInput[];
  readonly objects?: readonly ClusteredObjectBoundsInput[];
  readonly scopeId?: string;
};

export type ClusteredCameraRow = {
  readonly aspect: number;
  readonly cameraId: string;
  readonly cameraSpace: 'view-space-negative-z-forward';
  readonly farZ: number;
  readonly fovYDegrees: number;
  readonly frame: number;
  readonly nearZ: number;
  readonly relation: 'clustered_camera';
  readonly scopeId: string;
  readonly tanHalfFovX: number;
  readonly tanHalfFovY: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
};

export type ClusteredClusterGridRow = {
  readonly cameraId: string;
  readonly clusterCount: number;
  readonly depthSliceMode: ClusteredDepthSliceMode;
  readonly frame: number;
  readonly maxLights: number;
  readonly maxLightsPerCluster: number;
  readonly relation: 'clustered_cluster_grid';
  readonly scopeId: string;
  readonly slicesZ: number;
  readonly tilesX: number;
  readonly tilesY: number;
};

export type ClusteredClusterRow = {
  readonly clusterId: string;
  readonly clusterIndex: number;
  readonly depthMax: number;
  readonly depthMin: number;
  readonly frame: number;
  readonly ndcMaxX: number;
  readonly ndcMaxY: number;
  readonly ndcMinX: number;
  readonly ndcMinY: number;
  readonly relation: 'clustered_cluster';
  readonly scopeId: string;
  readonly sliceZ: number;
  readonly tileX: number;
  readonly tileY: number;
};

export type ClusteredLightBinningStatus =
  | 'accepted'
  | 'budget_culled'
  | 'disabled'
  | 'frustum_culled'
  | 'invalid';

export type ClusteredLightInputRow = {
  readonly accepted: boolean;
  readonly binningStatus: ClusteredLightBinningStatus;
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly colorB: number;
  readonly colorG: number;
  readonly colorR: number;
  readonly enabled: boolean;
  readonly frame: number;
  readonly intensity: number;
  readonly lightId: string;
  readonly lightKind: ClusteredLightKind;
  readonly lightOrdinal: number;
  readonly range: number;
  readonly relation: 'clustered_light_input';
  readonly scopeId: string;
  readonly viewDepth: number;
};

export type ClusteredObjectBinningStatus = 'assigned' | 'frustum_culled' | 'invalid';

export type ClusteredObjectBoundsRow = {
  readonly frame: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly objectId: string;
  readonly objectOrdinal: number;
  readonly receivesLight: boolean;
  readonly relation: 'clustered_object_bounds';
  readonly scopeId: string;
  readonly status: ClusteredObjectBinningStatus;
};

export type ClusteredObjectClusterRow = {
  readonly clusterId: string;
  readonly frame: number;
  readonly objectId: string;
  readonly objectOrdinal: number;
  readonly relation: 'clustered_object_cluster';
  readonly scopeId: string;
  readonly sliceZ: number;
  readonly tileX: number;
  readonly tileY: number;
};

export type ClusteredClusterLightAssignmentRow = {
  readonly clusterId: string;
  readonly frame: number;
  readonly influenceScore: number;
  readonly lightId: string;
  readonly lightKind: ClusteredLightKind;
  readonly lightOrdinal: number;
  readonly reason: 'projected_sphere_overlap';
  readonly relation: 'clustered_cluster_light_assignment';
  readonly scopeId: string;
  readonly sliceZ: number;
  readonly slot: number;
  readonly tileX: number;
  readonly tileY: number;
};

export type ClusteredClusterLightCountRow = {
  readonly capacity: number;
  readonly clusterId: string;
  readonly frame: number;
  readonly lightCount: number;
  readonly overflowCount: number;
  readonly relation: 'clustered_cluster_light_count';
  readonly scopeId: string;
  readonly sliceZ: number;
  readonly tileX: number;
  readonly tileY: number;
};

export const clusteredLightingRoyalCoreApiRequirements = [
  'point_light_rows',
  'camera_space_bounds',
  'cluster_grid_budget',
  'cluster_light_assignment_buffer',
  'renderer_feature_gate'
] as const;

export type ClusteredLightingRoyalCoreApiRequirement =
  (typeof clusteredLightingRoyalCoreApiRequirements)[number];

export type ClusteredLightingFeatureGateMode =
  | 'disabled'
  | 'webgl2-packed-texture-lists'
  | 'webgpu-compute-storage-buffer';

export type ClusteredLightingFeatureGateRow = {
  readonly backend: ClusteredLightingRuntimeCapabilities['backend'];
  readonly enabled: boolean;
  readonly feature: 'clustered-forward-lighting';
  readonly frame: number;
  readonly missingCapabilities: readonly string[];
  readonly mode: ClusteredLightingFeatureGateMode;
  readonly reason: string;
  readonly relation: 'clustered_feature_gate';
  readonly requiredCapabilities: readonly string[];
  readonly requiredRoyalCoreApi: readonly ClusteredLightingRoyalCoreApiRequirement[];
  readonly scopeId: string;
};

export type ClusteredLightingDiagnosticCode =
  | 'clustered_cluster_light_overflow'
  | 'clustered_feature_disabled'
  | 'clustered_light_budget_exceeded'
  | 'clustered_light_clipped'
  | 'clustered_light_invalid_range'
  | 'clustered_object_clipped'
  | 'clustered_object_invalid_bounds';

export type ClusteredLightingDiagnosticSourceRelation =
  | 'clustered_camera'
  | 'clustered_cluster'
  | 'clustered_cluster_grid'
  | 'clustered_cluster_light_assignment'
  | 'clustered_feature_gate'
  | 'clustered_light_input'
  | 'clustered_object_bounds';

export type ClusteredLightingDiagnosticRow = {
  readonly code: ClusteredLightingDiagnosticCode;
  readonly detail: unknown | null;
  readonly field: string | null;
  readonly frame: number;
  readonly key: string | null;
  readonly message: string;
  readonly relation: 'clustered_diagnostic';
  readonly scopeId: string;
  readonly severity: 'info' | 'warning';
  readonly sourceRelation: ClusteredLightingDiagnosticSourceRelation;
};

export type ClusteredLightingBenchmarkCounterName =
  | 'accepted_light_rows'
  | 'assignment_rows'
  | 'cluster_light_tests'
  | 'cluster_rows'
  | 'diagnostic_rows'
  | 'input_light_rows'
  | 'max_cluster_light_count'
  | 'object_bounds_rows'
  | 'object_cluster_rows'
  | 'object_cluster_tests'
  | 'overflowed_clusters';

export type ClusteredLightingBenchmarkCounterRow = {
  readonly counter: ClusteredLightingBenchmarkCounterName;
  readonly frame: number;
  readonly passId: 'cpu-clustered-lighting';
  readonly relation: 'clustered_benchmark_counter';
  readonly scopeId: string;
  readonly unit: 'cluster-test' | 'count' | 'row';
  readonly value: number;
};

export type ClusteredLightingPrototypeRows = {
  readonly clustered_benchmark_counter: readonly ClusteredLightingBenchmarkCounterRow[];
  readonly clustered_camera: readonly ClusteredCameraRow[];
  readonly clustered_cluster: readonly ClusteredClusterRow[];
  readonly clustered_cluster_grid: readonly ClusteredClusterGridRow[];
  readonly clustered_cluster_light_assignment: readonly ClusteredClusterLightAssignmentRow[];
  readonly clustered_cluster_light_count: readonly ClusteredClusterLightCountRow[];
  readonly clustered_diagnostic: readonly ClusteredLightingDiagnosticRow[];
  readonly clustered_feature_gate: readonly ClusteredLightingFeatureGateRow[];
  readonly clustered_light_input: readonly ClusteredLightInputRow[];
  readonly clustered_object_bounds: readonly ClusteredObjectBoundsRow[];
  readonly clustered_object_cluster: readonly ClusteredObjectClusterRow[];
};

export type ClusteredLightingFeatureGatePlan = {
  readonly diagnostics: readonly ClusteredLightingDiagnosticRow[];
  readonly row: ClusteredLightingFeatureGateRow;
};

type NormalizedGrid = {
  readonly clusterCount: number;
  readonly depthSliceMode: ClusteredDepthSliceMode;
  readonly maxLights: number;
  readonly maxLightsPerCluster: number;
  readonly slicesZ: number;
  readonly tilesX: number;
  readonly tilesY: number;
};

type ClusterCoverage = {
  readonly firstSliceZ: number;
  readonly firstTileX: number;
  readonly firstTileY: number;
  readonly lastSliceZ: number;
  readonly lastTileX: number;
  readonly lastTileY: number;
};

type LightCandidate = {
  readonly coverage: ClusterCoverage | undefined;
  readonly row: ClusteredLightInputRow;
};

type ObjectCandidate = {
  readonly coverage: ClusterCoverage | undefined;
  readonly row: ClusteredObjectBoundsRow;
};

type MutableCounters = {
  clusterLightTests: number;
  objectClusterTests: number;
};

type OverflowBucket = {
  readonly cluster: ClusterCoord;
  readonly lightIds: string[];
};

type ClusterCoord = {
  readonly sliceZ: number;
  readonly tileX: number;
  readonly tileY: number;
};

const defaultScopeId = 'royal';

export function runClusteredLightingPrototype(
  input: ClusteredLightingPrototypeInput
): ClusteredLightingPrototypeRows {
  const scopeId = input.scopeId ?? defaultScopeId;
  const frame = nonNegativeInteger(input.frame ?? 1, 'frame');
  const camera = normalizeCamera(scopeId, frame, input.camera);
  const grid = normalizeGrid(input.grid, input.lights.length);
  const diagnostics: ClusteredLightingDiagnosticRow[] = [];
  const counters: MutableCounters = {
    clusterLightTests: 0,
    objectClusterTests: 0
  };

  const gridRow: ClusteredClusterGridRow = {
    cameraId: camera.cameraId,
    clusterCount: grid.clusterCount,
    depthSliceMode: grid.depthSliceMode,
    frame,
    maxLights: grid.maxLights,
    maxLightsPerCluster: grid.maxLightsPerCluster,
    relation: 'clustered_cluster_grid',
    scopeId,
    slicesZ: grid.slicesZ,
    tilesX: grid.tilesX,
    tilesY: grid.tilesY
  };
  const clusterRows = createClusterRows(scopeId, frame, camera, grid);
  const lightCandidates = createLightCandidates(scopeId, frame, camera, grid, input.lights, diagnostics);
  const assignmentResult = createLightAssignments(scopeId, frame, grid, lightCandidates, diagnostics, counters);
  const objectCandidates = createObjectCandidates(
    scopeId,
    frame,
    camera,
    grid,
    input.objects ?? [],
    diagnostics
  );
  const objectClusterRows = createObjectClusterRows(scopeId, frame, objectCandidates, counters);
  const featureGate =
    input.featureGate === undefined
      ? undefined
      : planClusteredLightingFeatureGate({ ...input.featureGate, frame, scopeId });

  if (featureGate !== undefined) diagnostics.push(...featureGate.diagnostics);

  const lightRows = lightCandidates.map((candidate) => candidate.row);
  const objectRows = objectCandidates.map((candidate) => candidate.row);
  const lightCountRows = clusterRows.map((cluster) => {
    const key = cluster.clusterId;
    const assigned = assignmentResult.assignmentCountByCluster.get(key) ?? 0;
    const overflow = assignmentResult.overflowByCluster.get(key);

    return {
      capacity: grid.maxLightsPerCluster,
      clusterId: key,
      frame,
      lightCount: assigned,
      overflowCount: overflow?.lightIds.length ?? 0,
      relation: 'clustered_cluster_light_count',
      scopeId,
      sliceZ: cluster.sliceZ,
      tileX: cluster.tileX,
      tileY: cluster.tileY
    } satisfies ClusteredClusterLightCountRow;
  });

  const counterRows = createCounterRows(scopeId, frame, {
    acceptedLightRows: lightRows.filter((row) => row.accepted).length,
    assignmentRows: assignmentResult.rows.length,
    clusterLightTests: counters.clusterLightTests,
    clusterRows: clusterRows.length,
    diagnosticRows: diagnostics.length,
    inputLightRows: lightRows.length,
    maxClusterLightCount: maxRowValue(lightCountRows, (row) => row.lightCount),
    objectBoundsRows: objectRows.length,
    objectClusterRows: objectClusterRows.length,
    objectClusterTests: counters.objectClusterTests,
    overflowedClusters: lightCountRows.filter((row) => row.overflowCount > 0).length
  });

  return {
    clustered_benchmark_counter: counterRows,
    clustered_camera: [camera],
    clustered_cluster: clusterRows,
    clustered_cluster_grid: [gridRow],
    clustered_cluster_light_assignment: assignmentResult.rows,
    clustered_cluster_light_count: lightCountRows,
    clustered_diagnostic: diagnostics,
    clustered_feature_gate: featureGate === undefined ? [] : [featureGate.row],
    clustered_light_input: lightRows,
    clustered_object_bounds: objectRows,
    clustered_object_cluster: objectClusterRows
  };
}

export function planClusteredLightingFeatureGate(
  input: ClusteredLightingFeatureGateInput
): ClusteredLightingFeatureGatePlan {
  const scopeId = input.scopeId ?? defaultScopeId;
  const frame = nonNegativeInteger(input.frame ?? 1, 'frame');
  const capabilities = input.capabilities ?? {};
  const diagnostics: ClusteredLightingDiagnosticRow[] = [];
  const required =
    input.backend === 'webgpu'
      ? ['webgpu', 'storage_buffer']
      : ['webgl2', 'depth_texture', 'float_or_half_float_texture', 'instancing'];
  const missing = missingCapabilities(input.backend, capabilities);
  const enabled = missing.length === 0;
  const mode = featureGateMode(input.backend, enabled);
  const reason = featureGateReason(input.backend, enabled, missing);
  const row: ClusteredLightingFeatureGateRow = {
    backend: input.backend,
    enabled,
    feature: 'clustered-forward-lighting',
    frame,
    missingCapabilities: missing,
    mode,
    reason,
    relation: 'clustered_feature_gate',
    requiredCapabilities: required,
    requiredRoyalCoreApi: clusteredLightingRoyalCoreApiRequirements,
    scopeId
  };

  if (!enabled) {
    diagnostics.push(
      diagnostic({
        code: 'clustered_feature_disabled',
        detail: { backend: input.backend, missingCapabilities: missing },
        field: 'capabilities',
        frame,
        key: 'clustered-forward-lighting',
        message: `Clustered lighting disabled for ${input.backend}: missing ${missing.join(', ')}`,
        scopeId,
        severity: 'warning',
        sourceRelation: 'clustered_feature_gate'
      })
    );
  }

  return { diagnostics, row };
}

export function clusteredClusterKey(coord: ClusterCoord): string {
  return `z${coord.sliceZ}:y${coord.tileY}:x${coord.tileX}`;
}

function normalizeCamera(scopeId: string, frame: number, input: ClusteredCameraInput): ClusteredCameraRow {
  const viewportWidth = positiveNumber(input.viewportWidth, 'viewportWidth');
  const viewportHeight = positiveNumber(input.viewportHeight, 'viewportHeight');
  const nearZ = positiveNumber(input.nearZ, 'nearZ');
  const farZ = positiveNumber(input.farZ, 'farZ');
  if (farZ <= nearZ) throw new Error('Clustered lighting camera farZ must be greater than nearZ');

  const fovYDegrees = positiveNumber(input.fovYDegrees, 'fovYDegrees');
  if (fovYDegrees >= 180) throw new Error('Clustered lighting camera fovYDegrees must be below 180');

  const aspect = viewportWidth / viewportHeight;
  const tanHalfFovY = Math.tan((fovYDegrees * Math.PI) / 360);

  return {
    aspect,
    cameraId: input.cameraId,
    cameraSpace: 'view-space-negative-z-forward',
    farZ,
    fovYDegrees,
    frame,
    nearZ,
    relation: 'clustered_camera',
    scopeId,
    tanHalfFovX: tanHalfFovY * aspect,
    tanHalfFovY,
    viewportHeight,
    viewportWidth
  };
}

function normalizeGrid(input: ClusteredGridInput, lightCount: number): NormalizedGrid {
  const tilesX = positiveInteger(input.tilesX, 'tilesX');
  const tilesY = positiveInteger(input.tilesY, 'tilesY');
  const slicesZ = positiveInteger(input.slicesZ, 'slicesZ');
  const maxLights = nonNegativeInteger(input.maxLights ?? lightCount, 'maxLights');
  const maxLightsPerCluster = nonNegativeInteger(input.maxLightsPerCluster ?? 64, 'maxLightsPerCluster');

  return {
    clusterCount: tilesX * tilesY * slicesZ,
    depthSliceMode: input.depthSliceMode ?? 'linear',
    maxLights,
    maxLightsPerCluster,
    slicesZ,
    tilesX,
    tilesY
  };
}

function createClusterRows(
  scopeId: string,
  frame: number,
  camera: ClusteredCameraRow,
  grid: NormalizedGrid
): readonly ClusteredClusterRow[] {
  const rows: ClusteredClusterRow[] = [];

  for (let sliceZ = 0; sliceZ < grid.slicesZ; sliceZ += 1) {
    const depth = sliceDepthBounds(camera, grid, sliceZ);
    for (let tileY = 0; tileY < grid.tilesY; tileY += 1) {
      for (let tileX = 0; tileX < grid.tilesX; tileX += 1) {
        rows.push({
          clusterId: clusteredClusterKey({ sliceZ, tileX, tileY }),
          clusterIndex: clusterIndex(grid, { sliceZ, tileX, tileY }),
          depthMax: round6(depth.max),
          depthMin: round6(depth.min),
          frame,
          ndcMaxX: round6(-1 + ((tileX + 1) * 2) / grid.tilesX),
          ndcMaxY: round6(-1 + ((tileY + 1) * 2) / grid.tilesY),
          ndcMinX: round6(-1 + (tileX * 2) / grid.tilesX),
          ndcMinY: round6(-1 + (tileY * 2) / grid.tilesY),
          relation: 'clustered_cluster',
          scopeId,
          sliceZ,
          tileX,
          tileY
        });
      }
    }
  }

  return rows;
}

function createLightCandidates(
  scopeId: string,
  frame: number,
  camera: ClusteredCameraRow,
  grid: NormalizedGrid,
  lights: readonly ClusteredLightInput[],
  diagnostics: ClusteredLightingDiagnosticRow[]
): readonly LightCandidate[] {
  const candidates: LightCandidate[] = [];
  let acceptedBudgetSlots = 0;
  let budgetRejected = 0;

  lights.forEach((light, lightOrdinal) => {
    const color = light.color ?? [1, 1, 1];
    const enabled = light.enabled ?? true;
    const range = finiteOrZero(light.range);
    const viewDepth = -light.position[2];
    const baseRow = {
      centerX: finiteOrZero(light.position[0]),
      centerY: finiteOrZero(light.position[1]),
      centerZ: finiteOrZero(light.position[2]),
      colorB: finiteOrZero(color[2]),
      colorG: finiteOrZero(color[1]),
      colorR: finiteOrZero(color[0]),
      enabled,
      frame,
      intensity: finiteOrZero(light.intensity ?? 1),
      lightId: light.lightId,
      lightKind: light.kind ?? 'point',
      lightOrdinal,
      range,
      relation: 'clustered_light_input',
      scopeId,
      viewDepth
    } satisfies Omit<ClusteredLightInputRow, 'accepted' | 'binningStatus'>;

    if (!enabled) {
      candidates.push({ coverage: undefined, row: lightRow(baseRow, 'disabled') });
      return;
    }

    if (range <= 0) {
      diagnostics.push(
        diagnostic({
          code: 'clustered_light_invalid_range',
          detail: { range },
          field: 'range',
          frame,
          key: light.lightId,
          message: `Light ${light.lightId} has a non-positive range`,
          scopeId,
          severity: 'warning',
          sourceRelation: 'clustered_light_input'
        })
      );
      candidates.push({ coverage: undefined, row: lightRow(baseRow, 'invalid') });
      return;
    }

    if (acceptedBudgetSlots >= grid.maxLights) {
      budgetRejected += 1;
      candidates.push({ coverage: undefined, row: lightRow(baseRow, 'budget_culled') });
      return;
    }

    acceptedBudgetSlots += 1;
    const coverage = projectedSphereCoverage(camera, grid, baseRow);
    if (coverage === undefined) {
      diagnostics.push(
        diagnostic({
          code: 'clustered_light_clipped',
          detail: { center: [baseRow.centerX, baseRow.centerY, baseRow.centerZ], range },
          field: 'position',
          frame,
          key: light.lightId,
          message: `Light ${light.lightId} does not overlap the camera frustum`,
          scopeId,
          severity: 'info',
          sourceRelation: 'clustered_light_input'
        })
      );
      candidates.push({ coverage: undefined, row: lightRow(baseRow, 'frustum_culled') });
      return;
    }

    candidates.push({ coverage, row: lightRow(baseRow, 'accepted') });
  });

  if (budgetRejected > 0) {
    diagnostics.push(
      diagnostic({
        code: 'clustered_light_budget_exceeded',
        detail: { acceptedLights: grid.maxLights, inputLights: lights.length, rejectedLights: budgetRejected },
        field: 'maxLights',
        frame,
        key: null,
        message: `Clustered lighting accepted ${grid.maxLights} lights and budget-culled ${budgetRejected}`,
        scopeId,
        severity: 'warning',
        sourceRelation: 'clustered_cluster_grid'
      })
    );
  }

  return candidates;
}

function createLightAssignments(
  scopeId: string,
  frame: number,
  grid: NormalizedGrid,
  candidates: readonly LightCandidate[],
  diagnostics: ClusteredLightingDiagnosticRow[],
  counters: MutableCounters
): {
  readonly assignmentCountByCluster: ReadonlyMap<string, number>;
  readonly overflowByCluster: ReadonlyMap<string, OverflowBucket>;
  readonly rows: readonly ClusteredClusterLightAssignmentRow[];
} {
  const rows: ClusteredClusterLightAssignmentRow[] = [];
  const assignmentCountByCluster = new Map<string, number>();
  const overflowByCluster = new Map<string, OverflowBucket>();

  for (const candidate of candidates) {
    if (candidate.coverage === undefined || !candidate.row.accepted) continue;

    forEachCoveredCluster(candidate.coverage, (coord) => {
      counters.clusterLightTests += 1;
      const clusterId = clusteredClusterKey(coord);
      const slot = assignmentCountByCluster.get(clusterId) ?? 0;

      if (slot >= grid.maxLightsPerCluster) {
        const bucket = overflowByCluster.get(clusterId) ?? { cluster: coord, lightIds: [] };
        bucket.lightIds.push(candidate.row.lightId);
        overflowByCluster.set(clusterId, bucket);
        return;
      }

      assignmentCountByCluster.set(clusterId, slot + 1);
      rows.push({
        clusterId,
        frame,
        influenceScore: round6(candidate.row.intensity / Math.max(1, candidate.row.viewDepth)),
        lightId: candidate.row.lightId,
        lightKind: candidate.row.lightKind,
        lightOrdinal: candidate.row.lightOrdinal,
        reason: 'projected_sphere_overlap',
        relation: 'clustered_cluster_light_assignment',
        scopeId,
        sliceZ: coord.sliceZ,
        slot,
        tileX: coord.tileX,
        tileY: coord.tileY
      });
    });
  }

  for (const [clusterId, overflow] of overflowByCluster) {
    diagnostics.push(
      diagnostic({
        code: 'clustered_cluster_light_overflow',
        detail: {
          capacity: grid.maxLightsPerCluster,
          droppedLightIds: overflow.lightIds,
          overflowCount: overflow.lightIds.length
        },
        field: 'maxLightsPerCluster',
        frame,
        key: clusterId,
        message: `Cluster ${clusterId} exceeded its ${grid.maxLightsPerCluster}-light assignment capacity`,
        scopeId,
        severity: 'warning',
        sourceRelation: 'clustered_cluster_light_assignment'
      })
    );
  }

  return { assignmentCountByCluster, overflowByCluster, rows };
}

function createObjectCandidates(
  scopeId: string,
  frame: number,
  camera: ClusteredCameraRow,
  grid: NormalizedGrid,
  objects: readonly ClusteredObjectBoundsInput[],
  diagnostics: ClusteredLightingDiagnosticRow[]
): readonly ObjectCandidate[] {
  return objects.map((object, objectOrdinal) => {
    const minX = finiteOrZero(object.min[0]);
    const minY = finiteOrZero(object.min[1]);
    const minZ = finiteOrZero(object.min[2]);
    const maxX = finiteOrZero(object.max[0]);
    const maxY = finiteOrZero(object.max[1]);
    const maxZ = finiteOrZero(object.max[2]);
    const baseRow = {
      frame,
      maxX,
      maxY,
      maxZ,
      minX,
      minY,
      minZ,
      objectId: object.objectId,
      objectOrdinal,
      receivesLight: object.receivesLight ?? true,
      relation: 'clustered_object_bounds',
      scopeId
    } satisfies Omit<ClusteredObjectBoundsRow, 'status'>;

    if (maxX <= minX || maxY <= minY || maxZ <= minZ) {
      diagnostics.push(
        diagnostic({
          code: 'clustered_object_invalid_bounds',
          detail: { max: [maxX, maxY, maxZ], min: [minX, minY, minZ] },
          field: 'bounds',
          frame,
          key: object.objectId,
          message: `Object ${object.objectId} has empty or inverted bounds`,
          scopeId,
          severity: 'warning',
          sourceRelation: 'clustered_object_bounds'
        })
      );
      return { coverage: undefined, row: objectRow(baseRow, 'invalid') };
    }

    const coverage = projectedAabbCoverage(camera, grid, { maxX, maxY, maxZ, minX, minY, minZ });
    if (coverage === undefined) {
      diagnostics.push(
        diagnostic({
          code: 'clustered_object_clipped',
          detail: { max: [maxX, maxY, maxZ], min: [minX, minY, minZ] },
          field: 'bounds',
          frame,
          key: object.objectId,
          message: `Object ${object.objectId} does not overlap the camera frustum`,
          scopeId,
          severity: 'info',
          sourceRelation: 'clustered_object_bounds'
        })
      );
      return { coverage: undefined, row: objectRow(baseRow, 'frustum_culled') };
    }

    return { coverage, row: objectRow(baseRow, 'assigned') };
  });
}

function createObjectClusterRows(
  scopeId: string,
  frame: number,
  candidates: readonly ObjectCandidate[],
  counters: MutableCounters
): readonly ClusteredObjectClusterRow[] {
  const rows: ClusteredObjectClusterRow[] = [];

  for (const candidate of candidates) {
    if (candidate.coverage === undefined || candidate.row.status !== 'assigned') continue;

    forEachCoveredCluster(candidate.coverage, (coord) => {
      counters.objectClusterTests += 1;
      rows.push({
        clusterId: clusteredClusterKey(coord),
        frame,
        objectId: candidate.row.objectId,
        objectOrdinal: candidate.row.objectOrdinal,
        relation: 'clustered_object_cluster',
        scopeId,
        sliceZ: coord.sliceZ,
        tileX: coord.tileX,
        tileY: coord.tileY
      });
    });
  }

  return rows;
}

function projectedSphereCoverage(
  camera: ClusteredCameraRow,
  grid: NormalizedGrid,
  light: Omit<ClusteredLightInputRow, 'accepted' | 'binningStatus'>
): ClusterCoverage | undefined {
  const depthMin = light.viewDepth - light.range;
  const depthMax = light.viewDepth + light.range;

  return projectedBoundsCoverage(camera, grid, {
    maxDepth: depthMax,
    maxX: light.centerX + light.range,
    maxY: light.centerY + light.range,
    minDepth: depthMin,
    minX: light.centerX - light.range,
    minY: light.centerY - light.range
  });
}

function projectedAabbCoverage(
  camera: ClusteredCameraRow,
  grid: NormalizedGrid,
  bounds: {
    readonly maxX: number;
    readonly maxY: number;
    readonly maxZ: number;
    readonly minX: number;
    readonly minY: number;
    readonly minZ: number;
  }
): ClusterCoverage | undefined {
  const nearDepth = Math.min(-bounds.minZ, -bounds.maxZ);
  const farDepth = Math.max(-bounds.minZ, -bounds.maxZ);

  return projectedBoundsCoverage(camera, grid, {
    maxDepth: farDepth,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    minDepth: nearDepth,
    minX: bounds.minX,
    minY: bounds.minY
  });
}

function projectedBoundsCoverage(
  camera: ClusteredCameraRow,
  grid: NormalizedGrid,
  bounds: {
    readonly maxDepth: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly minDepth: number;
    readonly minX: number;
    readonly minY: number;
  }
): ClusterCoverage | undefined {
  const clippedDepthMin = Math.max(camera.nearZ, bounds.minDepth);
  const clippedDepthMax = Math.min(camera.farZ, bounds.maxDepth);
  if (clippedDepthMax <= clippedDepthMin) return undefined;

  const ndcRange = projectNdcRange(camera, bounds, clippedDepthMin, clippedDepthMax);
  if (
    ndcRange.maxX < -1 ||
    ndcRange.minX > 1 ||
    ndcRange.maxY < -1 ||
    ndcRange.minY > 1
  ) {
    return undefined;
  }

  return {
    firstSliceZ: depthToSlice(camera, grid, clippedDepthMin),
    firstTileX: ndcToTile(Math.max(-1, ndcRange.minX), grid.tilesX),
    firstTileY: ndcToTile(Math.max(-1, ndcRange.minY), grid.tilesY),
    lastSliceZ: depthToSlice(camera, grid, clippedDepthMax),
    lastTileX: ndcToTile(Math.min(1, ndcRange.maxX), grid.tilesX),
    lastTileY: ndcToTile(Math.min(1, ndcRange.maxY), grid.tilesY)
  };
}

function projectNdcRange(
  camera: ClusteredCameraRow,
  bounds: {
    readonly maxX: number;
    readonly maxY: number;
    readonly minX: number;
    readonly minY: number;
  },
  depthMin: number,
  depthMax: number
): { readonly maxX: number; readonly maxY: number; readonly minX: number; readonly minY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const depth of [depthMin, depthMax]) {
    const denomX = depth * camera.tanHalfFovX;
    const denomY = depth * camera.tanHalfFovY;
    for (const x of [bounds.minX, bounds.maxX]) {
      const ndcX = x / denomX;
      minX = Math.min(minX, ndcX);
      maxX = Math.max(maxX, ndcX);
    }
    for (const y of [bounds.minY, bounds.maxY]) {
      const ndcY = y / denomY;
      minY = Math.min(minY, ndcY);
      maxY = Math.max(maxY, ndcY);
    }
  }

  return { maxX, maxY, minX, minY };
}

function forEachCoveredCluster(coverage: ClusterCoverage, visit: (coord: ClusterCoord) => void): void {
  for (let sliceZ = coverage.firstSliceZ; sliceZ <= coverage.lastSliceZ; sliceZ += 1) {
    for (let tileY = coverage.firstTileY; tileY <= coverage.lastTileY; tileY += 1) {
      for (let tileX = coverage.firstTileX; tileX <= coverage.lastTileX; tileX += 1) {
        visit({ sliceZ, tileX, tileY });
      }
    }
  }
}

function lightRow(
  base: Omit<ClusteredLightInputRow, 'accepted' | 'binningStatus'>,
  binningStatus: ClusteredLightBinningStatus
): ClusteredLightInputRow {
  return {
    ...base,
    accepted: binningStatus === 'accepted',
    binningStatus
  };
}

function objectRow(
  base: Omit<ClusteredObjectBoundsRow, 'status'>,
  status: ClusteredObjectBinningStatus
): ClusteredObjectBoundsRow {
  return { ...base, status };
}

function createCounterRows(
  scopeId: string,
  frame: number,
  values: {
    readonly acceptedLightRows: number;
    readonly assignmentRows: number;
    readonly clusterLightTests: number;
    readonly clusterRows: number;
    readonly diagnosticRows: number;
    readonly inputLightRows: number;
    readonly maxClusterLightCount: number;
    readonly objectBoundsRows: number;
    readonly objectClusterRows: number;
    readonly objectClusterTests: number;
    readonly overflowedClusters: number;
  }
): readonly ClusteredLightingBenchmarkCounterRow[] {
  return [
    counter(scopeId, frame, 'input_light_rows', values.inputLightRows, 'row'),
    counter(scopeId, frame, 'accepted_light_rows', values.acceptedLightRows, 'row'),
    counter(scopeId, frame, 'cluster_rows', values.clusterRows, 'row'),
    counter(scopeId, frame, 'assignment_rows', values.assignmentRows, 'row'),
    counter(scopeId, frame, 'cluster_light_tests', values.clusterLightTests, 'cluster-test'),
    counter(scopeId, frame, 'object_bounds_rows', values.objectBoundsRows, 'row'),
    counter(scopeId, frame, 'object_cluster_rows', values.objectClusterRows, 'row'),
    counter(scopeId, frame, 'object_cluster_tests', values.objectClusterTests, 'cluster-test'),
    counter(scopeId, frame, 'overflowed_clusters', values.overflowedClusters, 'count'),
    counter(scopeId, frame, 'max_cluster_light_count', values.maxClusterLightCount, 'count'),
    counter(scopeId, frame, 'diagnostic_rows', values.diagnosticRows, 'row')
  ];
}

function counter(
  scopeId: string,
  frame: number,
  counterName: ClusteredLightingBenchmarkCounterName,
  value: number,
  unit: ClusteredLightingBenchmarkCounterRow['unit']
): ClusteredLightingBenchmarkCounterRow {
  return {
    counter: counterName,
    frame,
    passId: 'cpu-clustered-lighting',
    relation: 'clustered_benchmark_counter',
    scopeId,
    unit,
    value
  };
}

function missingCapabilities(
  backend: ClusteredLightingRuntimeCapabilities['backend'],
  capabilities: NonNullable<ClusteredLightingRuntimeCapabilities['capabilities']>
): readonly string[] {
  if (backend === 'webgpu') {
    const missing: string[] = [];
    if ((capabilities.webgpu ?? true) !== true) missing.push('webgpu');
    if ((capabilities.storageBuffer ?? true) !== true) missing.push('storage_buffer');
    return missing;
  }

  if (backend === 'webgl1') return ['webgl2_or_webgpu'];

  const missing: string[] = [];
  if ((capabilities.webgl2 ?? true) !== true) missing.push('webgl2');
  if (capabilities.depthTexture !== true) missing.push('depth_texture');
  if (capabilities.floatTexture !== true && capabilities.halfFloatTexture !== true) {
    missing.push('float_or_half_float_texture');
  }
  if (capabilities.instancing !== true) missing.push('instancing');

  return missing;
}

function featureGateMode(
  backend: ClusteredLightingRuntimeCapabilities['backend'],
  enabled: boolean
): ClusteredLightingFeatureGateMode {
  if (!enabled) return 'disabled';
  return backend === 'webgpu' ? 'webgpu-compute-storage-buffer' : 'webgl2-packed-texture-lists';
}

function featureGateReason(
  backend: ClusteredLightingRuntimeCapabilities['backend'],
  enabled: boolean,
  missing: readonly string[]
): string {
  if (!enabled) return `missing ${missing.join(', ')}`;
  return backend === 'webgpu'
    ? 'WebGPU can build cluster lists with compute and storage buffers'
    : 'WebGL2 can consume CPU-built cluster lists packed into textures or uniform-buffer-sized pages';
}

function sliceDepthBounds(
  camera: ClusteredCameraRow,
  grid: NormalizedGrid,
  sliceZ: number
): { readonly max: number; readonly min: number } {
  if (grid.depthSliceMode === 'linear') {
    const step = (camera.farZ - camera.nearZ) / grid.slicesZ;
    return {
      max: camera.nearZ + (sliceZ + 1) * step,
      min: camera.nearZ + sliceZ * step
    };
  }

  const ratio = camera.farZ / camera.nearZ;
  return {
    max: camera.nearZ * ratio ** ((sliceZ + 1) / grid.slicesZ),
    min: camera.nearZ * ratio ** (sliceZ / grid.slicesZ)
  };
}

function depthToSlice(camera: ClusteredCameraRow, grid: NormalizedGrid, depth: number): number {
  const clampedDepth = clamp(depth, camera.nearZ, camera.farZ);
  if (grid.depthSliceMode === 'linear') {
    const normalized = (clampedDepth - camera.nearZ) / (camera.farZ - camera.nearZ);
    return clampInteger(Math.floor(normalized * grid.slicesZ), 0, grid.slicesZ - 1);
  }

  const normalized = Math.log(clampedDepth / camera.nearZ) / Math.log(camera.farZ / camera.nearZ);
  return clampInteger(Math.floor(normalized * grid.slicesZ), 0, grid.slicesZ - 1);
}

function ndcToTile(ndc: number, tiles: number): number {
  const normalized = (ndc + 1) / 2;
  return clampInteger(Math.floor(normalized * tiles), 0, tiles - 1);
}

function clusterIndex(grid: NormalizedGrid, coord: ClusterCoord): number {
  return coord.sliceZ * grid.tilesX * grid.tilesY + coord.tileY * grid.tilesX + coord.tileX;
}

function maxRowValue<T>(rows: readonly T[], select: (row: T) => number): number {
  let max = 0;
  for (const row of rows) max = Math.max(max, select(row));
  return max;
}

function diagnostic(input: {
  readonly code: ClusteredLightingDiagnosticCode;
  readonly detail: unknown | null;
  readonly field: string | null;
  readonly frame: number;
  readonly key: string | null;
  readonly message: string;
  readonly scopeId: string;
  readonly severity: ClusteredLightingDiagnosticRow['severity'];
  readonly sourceRelation: ClusteredLightingDiagnosticSourceRelation;
}): ClusteredLightingDiagnosticRow {
  return {
    code: input.code,
    detail: input.detail,
    field: input.field,
    frame: input.frame,
    key: input.key,
    message: input.message,
    relation: 'clustered_diagnostic',
    scopeId: input.scopeId,
    severity: input.severity,
    sourceRelation: input.sourceRelation
  };
}

function positiveNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Clustered lighting ${field} must be a positive finite number`);
  }
  return value;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function positiveInteger(value: number, field: string): number {
  const integer = Math.floor(value);
  if (!Number.isFinite(value) || integer <= 0) {
    throw new Error(`Clustered lighting ${field} must be a positive integer`);
  }
  return integer;
}

function nonNegativeInteger(value: number, field: string): number {
  const integer = Math.floor(value);
  if (!Number.isFinite(value) || integer < 0) {
    throw new Error(`Clustered lighting ${field} must be a non-negative integer`);
  }
  return integer;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
