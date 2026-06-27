import type { Plugin } from 'vite';
import { createLinzNzScene } from './src/linz-scene';
import type { InfinigenQuality } from './src/args';
import type {
  InfinigenAnimalPoseRow,
  InfinigenInstanceEvent,
  InfinigenMaterial,
  InfinigenStreamEvent,
  InfinigenTerrainBiome,
  Vec3
} from './src/protocol';

type Random = () => number;

type AnimalTrack = {
  readonly id: string;
  readonly origin: Vec3;
  readonly phase: number;
  readonly radius: number;
  readonly speed: number;
};

type HouseSite = {
  readonly id: string;
  readonly position: Vec3;
};

type ScenePreset = 'infinigen' | 'linz-nz';

type SceneProfile = {
  readonly animal: number;
  readonly basalt: number;
  readonly cedar: number;
  readonly crystal: number;
  readonly fern: number;
  readonly glow: number;
  readonly house: number;
  readonly landmark: number;
  readonly quality: InfinigenQuality;
  readonly terrainColumns: number;
  readonly terrainRows: number;
  readonly terrainSize: number;
};

const sceneProfiles: Record<InfinigenQuality, SceneProfile> = {
  balanced: {
    animal: 6,
    basalt: 74,
    cedar: 46,
    crystal: 28,
    fern: 48,
    glow: 40,
    house: 3,
    landmark: 1,
    quality: 'balanced',
    terrainColumns: 45,
    terrainRows: 45,
    terrainSize: 64
  },
  high: {
    animal: 24,
    basalt: 180,
    cedar: 120,
    crystal: 64,
    fern: 180,
    glow: 120,
    house: 12,
    landmark: 2,
    quality: 'high',
    terrainColumns: 81,
    terrainRows: 81,
    terrainSize: 160
  },
  ultra: {
    animal: 70,
    basalt: 380,
    cedar: 260,
    crystal: 140,
    fern: 420,
    glow: 220,
    house: 40,
    landmark: 4,
    quality: 'ultra',
    terrainColumns: 121,
    terrainRows: 121,
    terrainSize: 360
  }
};

export function infinigenDevStreamPlugin(): Plugin {
  return {
    name: 'patchpit-infinigen-stream',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const streamPaths = streamRequestPaths(server.config.base);

        if (!streamPaths.has(url.pathname)) {
          next();
          return;
        }

        if (req.method !== 'GET') {
          next();
          return;
        }

        let closed = false;
        req.on('close', () => {
          closed = true;
        });

        const seed = url.searchParams.get('seed') ?? 'patchpit-001';
        const profile = sceneProfile(url.searchParams.get('quality'));
        const preset = scenePreset(url.searchParams.get('preset'));
        const baseEvents = preset === 'linz-nz'
          ? await createLinzNzScene({ quality: profile.quality, seed })
          : createInfinigenScene(seed, profile);
        const events = withAnimalPosePatches(baseEvents, `${preset}:${profile.quality}:${seed}`);

        res.writeHead(200, {
          'cache-control': 'no-store',
          'connection': 'keep-alive',
          'content-type': 'application/x-ndjson; charset=utf-8',
          'x-content-type-options': 'nosniff'
        });

        for (const event of events) {
          if (closed || res.writableEnded) {
            return;
          }

          res.write(`${JSON.stringify(event)}\n`);
          await sleep(streamDelayMs(event));
        }

        res.end();
      });
    }
  };
}

function streamRequestPaths(base: string): Set<string> {
  const normalizedBase = base === '/' ? '' : base.replace(/\/$/, '');
  return new Set(['/api/infinigen/scene.ndjson', `${normalizedBase}/api/infinigen/scene.ndjson`]);
}

function sceneProfile(value: string | null): SceneProfile {
  return value === 'balanced' || value === 'high' || value === 'ultra'
    ? sceneProfiles[value]
    : sceneProfiles.high;
}

function scenePreset(value: string | null): ScenePreset {
  return value === 'linz-nz' ? value : 'infinigen';
}

function createInfinigenScene(seed: string, profile: SceneProfile): readonly InfinigenStreamEvent[] {
  const random = createRandom(seed);
  const heights = createTerrainSamples(random, profile, 0, 0, 'fern');
  const instances = createInstances(random, heights, profile);
  const terrainChunks = createTerrainChunks(seed, profile);
  const events: InfinigenStreamEvent[] = [
    {
      camera: {
        position: [
          Number((profile.terrainSize * 0.43).toFixed(3)),
          Number((profile.terrainSize * 0.22).toFixed(3)),
          Number((profile.terrainSize * 0.48).toFixed(3))
        ],
        target: [0, 1.2, 0]
      },
      seed,
      type: 'reset'
    },
    {
      message: `terrain ${profile.quality}`,
      progress: 0.08,
      type: 'status'
    },
    ...terrainChunks,
    {
      color: [0.22, 0.56, 0.62, 1],
      opacity: 0.36,
      radius: Number((profile.terrainSize * 0.2).toFixed(3)),
      type: 'water',
      y: 0.18
    },
    {
      message: 'instances',
      progress: 0.2,
      type: 'status'
    },
    ...instances,
    {
      instances: instances.length,
      type: 'done'
    }
  ];

  return events;
}

function streamDelayMs(event: InfinigenStreamEvent): number {
  switch (event.type) {
    case 'instance':
      return 1;
    case 'relationPatch':
      return 33;
    default:
      return 18;
  }
}

function withAnimalPosePatches(events: readonly InfinigenStreamEvent[], seed: string): readonly InfinigenStreamEvent[] {
  const patches = createAnimalPosePatches(events, createRandom(`${seed}:animal-poses`));
  return patches.length === 0 ? events : [...events, ...patches];
}

function createAnimalPosePatches(
  instances: readonly InfinigenStreamEvent[],
  random: Random
): readonly InfinigenStreamEvent[] {
  const animals = instances
    .filter((event): event is InfinigenInstanceEvent => event.type === 'instance' && event.kind === 'animal')
    .map<AnimalTrack>((event) => ({
      id: event.id,
      origin: event.position,
      phase: random() * Math.PI * 2,
      radius: 0.9 + random() * 2.4,
      speed: 0.55 + random() * 1.2
    }));

  if (animals.length === 0) {
    return [];
  }

  const patches: InfinigenStreamEvent[] = [];
  const frameCount = 180;

  for (let tick = 0; tick < frameCount; tick += 1) {
    const rows: InfinigenAnimalPoseRow[] = [];
    const t = tick / 30;

    for (const animal of animals) {
      const phase = animal.phase + t * animal.speed;
      const nextPhase = phase + 0.04;
      const x = animal.origin[0] + Math.cos(phase) * animal.radius;
      const z = animal.origin[2] + Math.sin(phase) * animal.radius;
      const nextX = animal.origin[0] + Math.cos(nextPhase) * animal.radius;
      const nextZ = animal.origin[2] + Math.sin(nextPhase) * animal.radius;
      rows.push({
        entityId: animal.id,
        gaitPhase: phase * 5,
        rx: 0,
        ry: Math.atan2(-(nextZ - z), nextX - x),
        rz: 0,
        source: 'dev-stream',
        speed: animal.speed * animal.radius,
        tick,
        x: Number(x.toFixed(3)),
        y: Number((animal.origin[1] + Math.sin(phase * 2) * 0.05).toFixed(3)),
        z: Number(z.toFixed(3))
      });
    }

    patches.push({
      relation: 'animalPose',
      rows,
      type: 'relationPatch'
    });
  }

  return patches;
}

function createInstances(random: Random, heights: readonly number[], profile: SceneProfile): readonly InfinigenStreamEvent[] {
  const events: InfinigenStreamEvent[] = [];

  for (let index = 0; index < profile.basalt; index += 1) {
    const position = terrainPosition(random, heights, profile, 0.4);
    const height = 1.1 + random() * 3.8;
    events.push(instanceEvent(`basalt-${index}`, 'basalt', position, [0, random() * Math.PI, 0], [0.75, height, 0.75], {
      color: [0.25 + random() * 0.1, 0.25 + random() * 0.08, 0.24 + random() * 0.08, 1],
      roughness: 0.82
    }));
  }

  events.push({ message: 'canopy', progress: 0.48, type: 'status' });

  for (let index = 0; index < profile.cedar; index += 1) {
    const position = terrainPosition(random, heights, profile, 0.1);
    events.push(instanceEvent(`cedar-${index}`, 'cedar', position, [0, random() * Math.PI * 2, 0], [
      0.75 + random() * 0.55,
      0.9 + random() * 0.65,
      0.75 + random() * 0.55
    ], {
      color: [0.11, 0.31 + random() * 0.16, 0.16, 1],
      roughness: 0.9
    }));
  }

  events.push({ message: 'crystal', progress: 0.68, type: 'status' });

  for (let index = 0; index < profile.crystal; index += 1) {
    const position = terrainPosition(random, heights, profile, 0.28);
    events.push(instanceEvent(`crystal-${index}`, 'crystal', position, [random(), random() * Math.PI, random()], [
      0.35 + random() * 0.55,
      0.9 + random() * 1.4,
      0.35 + random() * 0.55
    ], {
      color: [0.2, 0.74, 0.92, 0.9],
      emissive: [0.04, 0.26, 0.34, 1],
      metalness: 0.05,
      roughness: 0.22
    }));
  }

  events.push({ message: 'fauna', progress: 0.78, type: 'status' });

  for (let index = 0; index < profile.animal; index += 1) {
    const position = terrainPosition(random, heights, profile, 0.45);
    const size = 0.65 + random() * 0.75;
    events.push(instanceEvent(`animal-${index}`, 'animal', position, [0, random() * Math.PI * 2, 0], [
      size,
      size,
      size
    ], {
      color: [0.43 + random() * 0.18, 0.32 + random() * 0.16, 0.2 + random() * 0.08, 1],
      roughness: 0.82
    }));
  }

  events.push({ message: 'landmarks', progress: 0.8, type: 'status' });

  for (let index = 0; index < profile.landmark; index += 1) {
    const angle = (index / Math.max(1, profile.landmark)) * Math.PI * 2 + random() * 0.5;
    const radius = profile.terrainSize * (0.12 + random() * 0.22);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const size = 2.4 + random() * 1.2;
    events.push(instanceEvent(`landmark-${index}`, 'landmark', [
      x,
      sampleHeight(heights, profile, x, z) + 0.24,
      z
    ], [
      0,
      -angle + Math.PI / 2,
      0
    ], [
      size,
      size,
      size
    ], {
      color: [0.42 + random() * 0.12, 0.39 + random() * 0.1, 0.32 + random() * 0.1, 1],
      roughness: 0.94
    }));
  }

  events.push({ message: 'settlements', progress: 0.82, type: 'status' });

  const houseSites: HouseSite[] = [];

  for (let index = 0; index < profile.house; index += 1) {
    const position = terrainPosition(random, heights, profile, 0.08);
    const footprint = 1.8 + random() * 2.4;
    houseSites.push({ id: `house-${index}`, position });
    events.push(instanceEvent(`house-${index}`, 'house', position, [0, random() * Math.PI * 2, 0], [
      footprint,
      1.1 + random() * 0.6,
      footprint * (0.75 + random() * 0.45)
    ], {
      color: [0.52 + random() * 0.12, 0.46 + random() * 0.12, 0.36 + random() * 0.1, 1],
      roughness: 0.88
    }));
  }

  for (const road of createRoads(houseSites, heights, profile)) {
    events.push(road);
  }

  for (let index = 0; index < profile.fern; index += 1) {
    const position = terrainPosition(random, heights, profile, 0.12);
    events.push(instanceEvent(`fern-${index}`, 'fern', position, [0, random() * Math.PI * 2, 0], [
      0.8 + random() * 0.75,
      0.8 + random() * 0.4,
      0.8 + random() * 0.75
    ], {
      color: [0.19, 0.57 + random() * 0.24, 0.24, 1],
      roughness: 0.86
    }));
  }

  events.push({ message: 'glow', progress: 0.88, type: 'status' });

  for (let index = 0; index < profile.glow; index += 1) {
    const position = terrainPosition(random, heights, profile, 1.4 + random() * 1.9);
    events.push(instanceEvent(`glow-${index}`, 'glow', position, [0, 0, 0], [
      0.7 + random() * 0.9,
      0.7 + random() * 0.9,
      0.7 + random() * 0.9
    ], {
      color: [0.42, 0.95, 0.84, 1],
      emissive: [0.2, 0.8, 0.7, 1],
      roughness: 0.35
    }));
  }

  return events;
}

function createRoads(houses: readonly HouseSite[], heights: readonly number[], profile: SceneProfile): readonly InfinigenInstanceEvent[] {
  const roads: InfinigenInstanceEvent[] = [];
  const sortedHouses = [...houses].sort((left, right) => Math.atan2(left.position[2], left.position[0]) - Math.atan2(right.position[2], right.position[0]));

  for (let index = 1; index < sortedHouses.length; index += 1) {
    roads.push(roadBetween(`road-${index - 1}`, sortedHouses[index - 1]?.position, sortedHouses[index]?.position, heights, profile));
  }

  for (let index = 0; index < sortedHouses.length; index += Math.max(2, Math.floor(sortedHouses.length / 8))) {
    roads.push(roadBetween(`road-spoke-${index}`, [0, sampleHeight(heights, profile, 0, 0) + 0.1, 0], sortedHouses[index]?.position, heights, profile));
  }

  return roads;
}

function roadBetween(
  id: string,
  start: Vec3 | undefined,
  end: Vec3 | undefined,
  heights: readonly number[],
  profile: SceneProfile
): InfinigenInstanceEvent {
  if (start === undefined || end === undefined) {
    throw new Error(`Cannot create road ${id}`);
  }

  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.max(0.1, Math.hypot(dx, dz));
  const x = start[0] + dx / 2;
  const z = start[2] + dz / 2;
  const y = sampleHeight(heights, profile, x, z) + 0.07;

  return instanceEvent(id, 'road', [x, y, z], [0, Math.atan2(-dz, dx), 0], [
    length,
    0.05,
    profile.quality === 'balanced' ? 0.45 : 0.72
  ], {
    color: [0.22, 0.21, 0.19, 1],
    roughness: 0.96
  });
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

function terrainPosition(random: Random, heights: readonly number[], profile: SceneProfile, yOffset: number): Vec3 {
  const x = (random() - 0.5) * profile.terrainSize * 0.9;
  const z = (random() - 0.5) * profile.terrainSize * 0.9;
  return [x, sampleHeight(heights, profile, x, z) + yOffset, z];
}

function createTerrainChunks(seed: string, profile: SceneProfile): readonly InfinigenStreamEvent[] {
  const chunks: InfinigenStreamEvent[] = [];
  const offsets = [-1, 0, 1];
  const chunkSize = profile.terrainSize;

  for (const xIndex of offsets) {
    for (const zIndex of offsets) {
      const biome = biomeForChunk(xIndex, zIndex);
      const random = createRandom(`${seed}:terrain:${xIndex}:${zIndex}:${biome}`);
      chunks.push({
        biome,
        columns: profile.terrainColumns,
        id: `terrain-${xIndex}-${zIndex}`,
        material: {
          color: terrainMaterialColor(biome),
          roughness: 0.94
        },
        position: [xIndex * chunkSize, 0, zIndex * chunkSize],
        rows: profile.terrainRows,
        samples: createTerrainSamples(random, profile, xIndex, zIndex, biome),
        size: chunkSize,
        type: 'terrain'
      });
    }
  }

  return chunks;
}

function biomeForChunk(xIndex: number, zIndex: number): InfinigenTerrainBiome {
  const index = Math.abs(xIndex * 17 + zIndex * 31) % 6;
  return ['coast', 'fern', 'tussock', 'wetland', 'basalt', 'alpine'][index] as InfinigenTerrainBiome;
}

function terrainMaterialColor(biome: InfinigenTerrainBiome): InfinigenMaterial['color'] {
  switch (biome) {
    case 'alpine':
      return [0.62, 0.66, 0.58, 1];
    case 'basalt':
      return [0.25, 0.27, 0.25, 1];
    case 'coast':
      return [0.48, 0.56, 0.34, 1];
    case 'fern':
      return [0.24, 0.5, 0.25, 1];
    case 'tussock':
      return [0.58, 0.52, 0.28, 1];
    case 'wetland':
      return [0.22, 0.48, 0.46, 1];
  }
}

function createTerrainSamples(
  random: Random,
  profile: SceneProfile,
  chunkX: number,
  chunkZ: number,
  biome: InfinigenTerrainBiome
): readonly number[] {
  const samples: number[] = [];
  const biomeLift = biomeHeightOffset(biome);

  for (let row = 0; row < profile.terrainRows; row += 1) {
    for (let column = 0; column < profile.terrainColumns; column += 1) {
      const x = column / (profile.terrainColumns - 1) - 0.5 + chunkX;
      const z = row / (profile.terrainRows - 1) - 0.5 + chunkZ;
      const ridge = Math.sin((x * 4.1 + z * 1.7) * Math.PI) * biomeRidgeScale(biome);
      const bowl = -Math.max(0, 1 - Math.hypot((x - chunkX) * 3.2, (z - chunkZ) * 3.2)) * biomeBowlScale(biome);
      const ripple = Math.sin((x * 13.2 - z * 7.6) * Math.PI) * biomeRippleScale(biome);
      const noise = (random() - 0.5) * (profile.quality === 'ultra' ? 1.02 : 0.72);
      samples.push(Number((biomeLift + ridge + bowl + ripple + noise + Math.hypot(x, z) * 0.55).toFixed(3)));
    }
  }

  return samples;
}

function biomeHeightOffset(biome: InfinigenTerrainBiome): number {
  switch (biome) {
    case 'alpine':
      return 2.8;
    case 'basalt':
      return 1.2;
    case 'coast':
      return -0.35;
    case 'fern':
      return 0.45;
    case 'tussock':
      return 1.1;
    case 'wetland':
      return -0.75;
  }
}

function biomeRidgeScale(biome: InfinigenTerrainBiome): number {
  return biome === 'alpine' ? 2.6 : biome === 'basalt' ? 1.8 : biome === 'wetland' ? 0.55 : 1.2;
}

function biomeBowlScale(biome: InfinigenTerrainBiome): number {
  return biome === 'coast' || biome === 'wetland' ? 2.4 : 1.3;
}

function biomeRippleScale(biome: InfinigenTerrainBiome): number {
  return biome === 'tussock' ? 0.42 : biome === 'basalt' ? 0.24 : 0.18;
}

function sampleHeight(heights: readonly number[], profile: SceneProfile, x: number, z: number): number {
  const column = Math.max(0, Math.min(profile.terrainColumns - 1, Math.round(((x / profile.terrainSize) + 0.5) * (profile.terrainColumns - 1))));
  const row = Math.max(0, Math.min(profile.terrainRows - 1, Math.round(((z / profile.terrainSize) + 0.5) * (profile.terrainRows - 1))));
  return heights[row * profile.terrainColumns + column] ?? 0;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
