import type { InfinigenQuality } from './args';
import type {
  InfinigenInstanceEvent,
  InfinigenMaterial,
  InfinigenStreamEvent,
  Vec3
} from './protocol';

type Random = () => number;

type BBox = readonly [number, number, number, number];

type LinzSceneOptions = {
  readonly fetchImpl?: FetchImpl;
  readonly quality: InfinigenQuality;
  readonly seed: string;
  readonly timeoutMs?: number;
};

type LinzSceneProfile = {
  readonly animal: number;
  readonly buildingLimit: number;
  readonly fallbackBuildings: number;
  readonly fern: number;
  readonly forest: number;
  readonly glow: number;
  readonly quality: InfinigenQuality;
  readonly roadFeatureLimit: number;
  readonly roadSegmentLimit: number;
  readonly terrainColumns: number;
  readonly terrainRows: number;
  readonly terrainSize: number;
};

type LinzFeatureSet = {
  readonly buildings: readonly InfinigenInstanceEvent[];
  readonly message: string;
  readonly roads: readonly InfinigenInstanceEvent[];
};

type FetchImpl = (
  input: string,
  init?: {
    readonly signal?: AbortSignal;
  }
) => Promise<{
  json(): Promise<unknown>;
}>;

type ProjectedPoint = readonly [number, number];

type Bounds = {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
};

const linzArcgisRoot = 'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services';
const linzAucklandBbox: BBox = [1756000, 5916000, 1759000, 5919000];

const linzProfiles: Record<InfinigenQuality, LinzSceneProfile> = {
  balanced: {
    animal: 5,
    buildingLimit: 80,
    fallbackBuildings: 90,
    fern: 70,
    forest: 40,
    glow: 36,
    quality: 'balanced',
    roadFeatureLimit: 28,
    roadSegmentLimit: 90,
    terrainColumns: 49,
    terrainRows: 49,
    terrainSize: 126
  },
  high: {
    animal: 16,
    buildingLimit: 260,
    fallbackBuildings: 220,
    fern: 180,
    forest: 110,
    glow: 90,
    quality: 'high',
    roadFeatureLimit: 80,
    roadSegmentLimit: 240,
    terrainColumns: 89,
    terrainRows: 89,
    terrainSize: 184
  },
  ultra: {
    animal: 38,
    buildingLimit: 760,
    fallbackBuildings: 560,
    fern: 360,
    forest: 230,
    glow: 180,
    quality: 'ultra',
    roadFeatureLimit: 160,
    roadSegmentLimit: 620,
    terrainColumns: 121,
    terrainRows: 121,
    terrainSize: 238
  }
};

const buildingMaterial: InfinigenMaterial = {
  color: [0.62, 0.59, 0.5, 1],
  roughness: 0.9
};

const roadMaterial: InfinigenMaterial = {
  color: [0.18, 0.18, 0.17, 1],
  roughness: 0.96
};

export async function createLinzNzScene(options: LinzSceneOptions): Promise<readonly InfinigenStreamEvent[]> {
  const profile = linzProfiles[options.quality];
  const random = createRandom(`linz-nz:${options.seed}:${options.quality}`);
  const terrain = createLinzTerrainSamples(random, profile);
  const live = await loadLinzFeatureSet(options, profile, terrain);
  const fallback = live ?? createFallbackFeatureSet(random, profile, terrain);
  const vegetation = createVegetation(random, profile, terrain);
  const instances = [...fallback.roads, ...fallback.buildings, ...vegetation];

  return [
    {
      camera: {
        position: [
          Number((profile.terrainSize * 0.34).toFixed(3)),
          Number((profile.terrainSize * 0.22).toFixed(3)),
          Number((profile.terrainSize * 0.46).toFixed(3))
        ],
        target: [0, 1.4, 0]
      },
      seed: `linz-nz:${options.seed}`,
      type: 'reset'
    },
    {
      message: 'LINZ 124391 coastline and 121859 DEM refs',
      progress: 0.05,
      type: 'status'
    },
    {
      columns: profile.terrainColumns,
      material: {
        color: [0.23, 0.47, 0.32, 1],
        roughness: 0.93
      },
      rows: profile.terrainRows,
      samples: terrain,
      size: profile.terrainSize,
      type: 'terrain'
    },
    {
      color: [0.08, 0.35, 0.48, 1],
      opacity: 0.38,
      radius: Number((profile.terrainSize * 0.42).toFixed(3)),
      type: 'water',
      y: 0.08
    },
    {
      message: fallback.message,
      progress: 0.32,
      type: 'status'
    },
    ...instances,
    {
      instances: instances.length,
      type: 'done'
    }
  ];
}

async function loadLinzFeatureSet(
  options: LinzSceneOptions,
  profile: LinzSceneProfile,
  terrain: readonly number[]
): Promise<LinzFeatureSet | undefined> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (fetchImpl === undefined) {
    return undefined;
  }

  try {
    const [buildingPayload, roadPayload] = await Promise.all([
      fetchJson(linzQueryUrl('LINZ_NZ_Building_Outlines', profile.buildingLimit, 'OBJECTID,building_id'), fetchImpl, options.timeoutMs ?? 4500),
      fetchJson(linzQueryUrl('LINZ_NZ_Addresses_Roads', profile.roadFeatureLimit, 'OBJECTID,road_id,full_road_name'), fetchImpl, options.timeoutMs ?? 4500)
    ]);
    const buildings = buildingEventsFromArcgis(buildingPayload, profile, terrain);
    const roads = roadEventsFromArcgis(roadPayload, profile, terrain);

    if (buildings.length === 0 && roads.length === 0) {
      return undefined;
    }

    return {
      buildings,
      message: `LINZ ArcGIS live sample: ${buildings.length} buildings, ${roads.length} road segments`,
      roads
    };
  } catch {
    return undefined;
  }
}

async function fetchJson(url: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function linzQueryUrl(serviceName: string, resultRecordCount: number, outFields: string): string {
  const url = new URL(`${linzArcgisRoot}/${serviceName}/FeatureServer/0/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', outFields);
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('geometry', linzAucklandBbox.join(','));
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '2193');
  url.searchParams.set('outSR', '2193');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('resultRecordCount', String(resultRecordCount));
  url.searchParams.set('maxAllowableOffset', '4');
  return url.href;
}

function buildingEventsFromArcgis(
  payload: unknown,
  profile: LinzSceneProfile,
  terrain: readonly number[]
): readonly InfinigenInstanceEvent[] {
  const events: InfinigenInstanceEvent[] = [];

  for (const [index, feature] of featureArray(payload).entries()) {
    if (events.length >= profile.buildingLimit) {
      break;
    }

    const ring = firstPolygonRing(feature.geometry);

    if (ring === undefined || ring.length < 4) {
      continue;
    }

    const bounds = boundsOf(ring);
    const center = projectPoint([(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2], profile);
    const width = Math.max(0.38, Math.min(4.8, projectedLength(bounds.maxX - bounds.minX, profile)));
    const depth = Math.max(0.38, Math.min(4.8, projectedLength(bounds.maxY - bounds.minY, profile)));
    const y = sampleHeight(terrain, profile, center[0], center[1]) + 0.09;
    const objectId = objectIdOf(feature.attributes) ?? String(index);
    events.push(instanceEvent(`linz-building-${objectId}`, 'building', [center[0], y, center[1]], [
      0,
      longestEdgeAngle(ring),
      0
    ], [
      width,
      0.16 + Math.min(0.52, (width + depth) * 0.035),
      depth
    ], buildingMaterial));
  }

  return events;
}

function roadEventsFromArcgis(
  payload: unknown,
  profile: LinzSceneProfile,
  terrain: readonly number[]
): readonly InfinigenInstanceEvent[] {
  const events: InfinigenInstanceEvent[] = [];

  for (const [featureIndex, feature] of featureArray(payload).entries()) {
    if (events.length >= profile.roadSegmentLimit) {
      break;
    }

    const paths = polylinePaths(feature.geometry);
    let pathIndex = 0;

    for (const path of paths) {
      for (let pointIndex = 1; pointIndex < path.length; pointIndex += 1) {
        const previous = path[pointIndex - 1];
        const current = path[pointIndex];

        if (previous === undefined || current === undefined) {
          continue;
        }

        const start = projectPoint(previous, profile);
        const end = projectPoint(current, profile);
        const id = `linz-road-${objectIdOf(feature.attributes) ?? featureIndex}-${pathIndex}-${pointIndex}`;
        const road = roadBetween(id, start, end, terrain, profile);

        if (road !== undefined) {
          events.push(road);
        }

        if (events.length >= profile.roadSegmentLimit) {
          break;
        }
      }

      if (events.length >= profile.roadSegmentLimit) {
        break;
      }

      pathIndex += 1;
    }
  }

  return events;
}

function createFallbackFeatureSet(random: Random, profile: LinzSceneProfile, terrain: readonly number[]): LinzFeatureSet {
  const roads: InfinigenInstanceEvent[] = [];
  const origin: Vec3 = [0, 0, 0];
  const roadLines: readonly (readonly Vec3[])[] = [
    [[-56, 0, -38], [-28, 0, -26], [8, 0, -18], [48, 0, -2], [68, 0, 22]],
    [[-62, 0, 22], [-24, 0, 12], [20, 0, 4], [62, 0, -18]],
    [[-36, 0, -56], [-16, 0, -30], [-2, 0, 6], [8, 0, 52]],
    [[24, 0, -52], [18, 0, -18], [28, 0, 16], [46, 0, 48]]
  ];

  let roadIndex = 0;

  for (const line of roadLines) {
    for (let index = 1; index < line.length; index += 1) {
      const start = [line[index - 1]?.[0] ?? 0, line[index - 1]?.[2] ?? 0] as const;
      const end = [line[index]?.[0] ?? 0, line[index]?.[2] ?? 0] as const;
      const road = roadBetween(`linz-road-fallback-${roadIndex}`, start, end, terrain, profile);

      if (road !== undefined) {
        roads.push(road);
        roadIndex += 1;
      }
    }
  }

  const buildings: InfinigenInstanceEvent[] = [];

  for (let index = 0; index < profile.fallbackBuildings; index += 1) {
    const firstRoadLine = roadLines[0] ?? [origin];
    const corridor = roadLines[Math.floor(random() * roadLines.length)] ?? firstRoadLine;
    const anchor = corridor[Math.floor(random() * corridor.length)] ?? firstRoadLine[0] ?? origin;
    const x = anchor[0] + (random() - 0.5) * 18;
    const z = anchor[2] + (random() - 0.5) * 14;
    const width = 0.65 + random() * 1.65;
    const depth = 0.55 + random() * 1.45;
    buildings.push(instanceEvent(`linz-building-fallback-${index}`, 'building', [
      x,
      sampleHeight(terrain, profile, x, z) + 0.09,
      z
    ], [
      0,
      random() * Math.PI,
      0
    ], [
      width,
      0.14 + random() * 0.38,
      depth
    ], {
      color: [0.52 + random() * 0.14, 0.5 + random() * 0.12, 0.42 + random() * 0.08, 1],
      roughness: 0.9
    }));
  }

  return {
    buildings,
    message: `LINZ offline fallback: ${buildings.length} footprint proxies, ${roads.length} road segments`,
    roads
  };
}

function createVegetation(
  random: Random,
  profile: LinzSceneProfile,
  terrain: readonly number[]
): readonly InfinigenInstanceEvent[] {
  const events: InfinigenInstanceEvent[] = [];

  for (let index = 0; index < profile.forest; index += 1) {
    const position = terrainPosition(random, terrain, profile, 0.12);
    events.push(instanceEvent(`linz-kanuka-${index}`, 'cedar', position, [0, random() * Math.PI * 2, 0], [
      0.72 + random() * 0.48,
      0.72 + random() * 0.62,
      0.72 + random() * 0.48
    ], {
      color: [0.09, 0.28 + random() * 0.16, 0.13, 1],
      roughness: 0.9
    }));
  }

  for (let index = 0; index < profile.fern; index += 1) {
    const position = terrainPosition(random, terrain, profile, 0.08);
    events.push(instanceEvent(`linz-fern-${index}`, 'fern', position, [0, random() * Math.PI * 2, 0], [
      0.75 + random() * 0.7,
      0.72 + random() * 0.4,
      0.75 + random() * 0.7
    ], {
      color: [0.14, 0.44 + random() * 0.28, 0.18, 1],
      roughness: 0.87
    }));
  }

  for (let index = 0; index < profile.animal; index += 1) {
    const size = 0.52 + random() * 0.5;
    events.push(instanceEvent(`linz-animal-${index}`, 'animal', terrainPosition(random, terrain, profile, 0.34), [
      0,
      random() * Math.PI * 2,
      0
    ], [
      size,
      size,
      size
    ], {
      color: [0.38 + random() * 0.16, 0.3 + random() * 0.12, 0.2, 1],
      roughness: 0.84
    }));
  }

  for (let index = 0; index < profile.glow; index += 1) {
    events.push(instanceEvent(`linz-glow-${index}`, 'glow', terrainPosition(random, terrain, profile, 1 + random() * 1.3), [
      0,
      0,
      0
    ], [
      0.58 + random() * 0.68,
      0.58 + random() * 0.68,
      0.58 + random() * 0.68
    ], {
      color: [0.46, 0.92, 0.82, 1],
      emissive: [0.18, 0.72, 0.62, 1],
      roughness: 0.36
    }));
  }

  return events;
}

function createLinzTerrainSamples(random: Random, profile: LinzSceneProfile): readonly number[] {
  const samples: number[] = [];

  for (let row = 0; row < profile.terrainRows; row += 1) {
    for (let column = 0; column < profile.terrainColumns; column += 1) {
      const x = column / (profile.terrainColumns - 1) - 0.5;
      const z = row / (profile.terrainRows - 1) - 0.5;
      const ridge = Math.sin((x * 3.8 - z * 1.4) * Math.PI) * 0.72;
      const harbour = -Math.max(0, 1 - Math.hypot((x + 0.08) * 2.2, (z - 0.05) * 4.6)) * 2.2;
      const coneA = volcanicCone(x, z, -0.26, -0.14, 0.11, 3.1);
      const coneB = volcanicCone(x, z, 0.2, 0.2, 0.13, 2.4);
      const shore = Math.max(0, Math.hypot(x * 1.75, z * 1.35) - 0.42) * -0.75;
      const noise = (random() - 0.5) * (profile.quality === 'ultra' ? 0.52 : 0.34);
      samples.push(Number((1.25 + ridge + harbour + coneA + coneB + shore + noise).toFixed(3)));
    }
  }

  return samples;
}

function volcanicCone(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radius: number,
  height: number
): number {
  const distance = Math.hypot(x - centerX, z - centerZ);
  return Math.max(0, 1 - distance / radius) * height;
}

function terrainPosition(random: Random, terrain: readonly number[], profile: LinzSceneProfile, yOffset: number): Vec3 {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const x = (random() - 0.5) * profile.terrainSize * 0.88;
    const z = (random() - 0.5) * profile.terrainSize * 0.88;
    const y = sampleHeight(terrain, profile, x, z);

    if (y > 0.1 || attempt > 8) {
      return [x, y + yOffset, z];
    }
  }

  return [0, sampleHeight(terrain, profile, 0, 0) + yOffset, 0];
}

function roadBetween(
  id: string,
  start: ProjectedPoint,
  end: ProjectedPoint,
  terrain: readonly number[],
  profile: LinzSceneProfile
): InfinigenInstanceEvent | undefined {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);

  if (length < 0.18) {
    return undefined;
  }

  const x = start[0] + dx / 2;
  const z = start[1] + dz / 2;
  return instanceEvent(id, 'road', [x, sampleHeight(terrain, profile, x, z) + 0.08, z], [
    0,
    Math.atan2(-dz, dx),
    0
  ], [
    Math.max(0.26, length),
    0.045,
    profile.quality === 'balanced' ? 0.22 : 0.32
  ], roadMaterial);
}

function projectPoint(point: ProjectedPoint, profile: LinzSceneProfile): ProjectedPoint {
  const [minX, minY, maxX, maxY] = linzAucklandBbox;
  const width = maxX - minX;
  const height = maxY - minY;
  const worldSize = profile.terrainSize * 0.82;
  return [
    Number((((point[0] - (minX + width / 2)) / width) * worldSize).toFixed(3)),
    Number(((-((point[1] - (minY + height / 2)) / height)) * worldSize).toFixed(3))
  ];
}

function projectedLength(meters: number, profile: LinzSceneProfile): number {
  const [minX, , maxX] = linzAucklandBbox;
  return Math.abs(meters / (maxX - minX)) * profile.terrainSize * 0.82;
}

function sampleHeight(terrain: readonly number[], profile: LinzSceneProfile, x: number, z: number): number {
  const column = Math.max(0, Math.min(profile.terrainColumns - 1, Math.round(((x / profile.terrainSize) + 0.5) * (profile.terrainColumns - 1))));
  const row = Math.max(0, Math.min(profile.terrainRows - 1, Math.round(((z / profile.terrainSize) + 0.5) * (profile.terrainRows - 1))));
  return terrain[row * profile.terrainColumns + column] ?? 0;
}

function featureArray(payload: unknown): readonly {
  readonly attributes?: unknown;
  readonly geometry?: unknown;
}[] {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    return [];
  }

  return payload.features.filter(isRecord).slice(0, 2000);
}

function firstPolygonRing(input: unknown): readonly ProjectedPoint[] | undefined {
  if (!isRecord(input) || !Array.isArray(input.rings)) {
    return undefined;
  }

  for (const ring of input.rings) {
    const points = projectedPointArray(ring);

    if (points.length >= 4) {
      return points;
    }
  }

  return undefined;
}

function polylinePaths(input: unknown): readonly (readonly ProjectedPoint[])[] {
  if (!isRecord(input) || !Array.isArray(input.paths)) {
    return [];
  }

  return input.paths.map(projectedPointArray).filter((path) => path.length >= 2);
}

function projectedPointArray(input: unknown): readonly ProjectedPoint[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const points: ProjectedPoint[] = [];

  for (const point of input) {
    if (!Array.isArray(point) || point.length < 2) {
      continue;
    }

    const x = point[0];
    const y = point[1];

    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      points.push([x, y]);
    }
  }

  return points;
}

function boundsOf(points: readonly ProjectedPoint[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { maxX, maxY, minX, minY };
}

function longestEdgeAngle(points: readonly ProjectedPoint[]): number {
  let bestLength = 0;
  let bestAngle = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];

    if (start === undefined || end === undefined) {
      continue;
    }

    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);

    if (length > bestLength) {
      bestLength = length;
      bestAngle = Math.atan2(dy, dx);
    }
  }

  return bestAngle;
}

function objectIdOf(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const id = input.OBJECTID ?? input.objectid ?? input.objectId;
  return (typeof id === 'number' && Number.isFinite(id)) || typeof id === 'string' ? String(id).slice(0, 40) : undefined;
}

function instanceEvent(
  id: string,
  kind: InfinigenInstanceEvent['kind'],
  position: Vec3,
  rotation: Vec3,
  scale: Vec3,
  material: InfinigenMaterial
): InfinigenInstanceEvent {
  return {
    id,
    kind,
    material,
    position,
    rotation,
    scale,
    type: 'instance'
  };
}

function createRandom(seed: string): Random {
  let state = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
