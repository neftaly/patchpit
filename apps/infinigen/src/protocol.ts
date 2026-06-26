export type Vec3 = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

export type InfinigenMaterial = {
  readonly color: Rgba;
  readonly emissive?: Rgba;
  readonly metalness?: number;
  readonly roughness?: number;
};

export type InfinigenResetEvent = {
  readonly camera: {
    readonly target: Vec3;
    readonly position: Vec3;
  };
  readonly seed: string;
  readonly type: 'reset';
};

export type InfinigenStatusEvent = {
  readonly message: string;
  readonly progress: number;
  readonly type: 'status';
};

export type InfinigenTerrainEvent = {
  readonly biome?: InfinigenTerrainBiome;
  readonly columns: number;
  readonly id?: string;
  readonly material: InfinigenMaterial;
  readonly position?: Vec3;
  readonly rows: number;
  readonly samples: readonly number[];
  readonly size: number;
  readonly type: 'terrain';
};

export type InfinigenWaterEvent = {
  readonly color: Rgba;
  readonly opacity: number;
  readonly radius: number;
  readonly type: 'water';
  readonly y: number;
};

export type InfinigenTerrainBiome = 'alpine' | 'basalt' | 'coast' | 'fern' | 'tussock' | 'wetland';

export type InfinigenInstanceKind = 'animal' | 'basalt' | 'building' | 'cedar' | 'crystal' | 'fern' | 'glow' | 'house' | 'landmark' | 'road';

export type InfinigenInstanceEvent = {
  readonly id: string;
  readonly kind: InfinigenInstanceKind;
  readonly material: InfinigenMaterial;
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
  readonly type: 'instance';
};

export type InfinigenAnimalActivity = 'drink' | 'explore' | 'graze' | 'rest' | 'social' | 'watch';

export type InfinigenAnimalPoseRow = {
  readonly activity?: InfinigenAnimalActivity;
  readonly entityId: string;
  readonly gaitPhase: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly source: string;
  readonly speed: number;
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type InfinigenRelationPatchEvent = {
  readonly relation: 'animalPose';
  readonly rows: readonly InfinigenAnimalPoseRow[];
  readonly type: 'relationPatch';
};

export type InfinigenDoneEvent = {
  readonly instances: number;
  readonly type: 'done';
};

export type InfinigenStreamEvent =
  | InfinigenDoneEvent
  | InfinigenInstanceEvent
  | InfinigenRelationPatchEvent
  | InfinigenResetEvent
  | InfinigenStatusEvent
  | InfinigenTerrainEvent
  | InfinigenWaterEvent;

const maxCoordinate = 10000;
const maxInstances = 100000;
const maxRelationRows = 512;
const maxStringLength = 160;
const maxTerrainCells = 16384;
const maxTerrainSide = 128;
const maxWorldSize = 10000;

export function parseInfinigenStreamEvent(input: unknown): InfinigenStreamEvent {
  if (!isRecord(input) || typeof input.type !== 'string') {
    throw new Error('Invalid Infinigen stream event');
  }

  switch (input.type) {
    case 'done':
      return {
        instances: integerField(input, 'instances', 0, maxInstances),
        type: 'done'
      };
    case 'instance':
      return {
        id: stringField(input, 'id', maxStringLength),
        kind: instanceKindField(input, 'kind'),
        material: materialField(input, 'material'),
        position: vec3Field(input, 'position', -maxCoordinate, maxCoordinate),
        rotation: vec3Field(input, 'rotation', -Math.PI * 8, Math.PI * 8),
        scale: vec3Field(input, 'scale', 0.001, maxWorldSize),
        type: 'instance'
      };
    case 'relationPatch':
      return relationPatchEvent(input);
    case 'reset':
      return {
        camera: cameraField(input, 'camera'),
        seed: stringField(input, 'seed', 96),
        type: 'reset'
      };
    case 'status':
      return {
        message: stringField(input, 'message', maxStringLength),
        progress: numberField(input, 'progress', 0, 1),
        type: 'status'
      };
    case 'terrain':
      return terrainEvent(input);
    case 'water':
      return {
        color: rgbaField(input, 'color'),
        opacity: numberField(input, 'opacity', 0, 1),
        radius: numberField(input, 'radius', 0.001, maxWorldSize),
        type: 'water',
        y: numberField(input, 'y', -maxCoordinate, maxCoordinate)
      };
  }

  throw new Error(`Unknown Infinigen stream event: ${input.type}`);
}

function relationPatchEvent(input: Record<string, unknown>): InfinigenRelationPatchEvent {
  const relation = stringField(input, 'relation', maxStringLength);

  if (relation !== 'animalPose') {
    throw new Error('Invalid relation');
  }

  const rows = input.rows;

  if (!Array.isArray(rows) || rows.length > maxRelationRows) {
    throw new Error('Invalid rows');
  }

  return {
    relation,
    rows: rows.map(animalPoseRow),
    type: 'relationPatch'
  };
}

function animalPoseRow(input: unknown): InfinigenAnimalPoseRow {
  if (!isRecord(input)) {
    throw new Error('Invalid animalPose row');
  }

  const activity = optionalAnimalActivityField(input, 'activity');

  return {
    ...(activity === undefined ? {} : { activity }),
    entityId: stringField(input, 'entityId', maxStringLength),
    gaitPhase: numberField(input, 'gaitPhase', -Math.PI * 4096, Math.PI * 4096),
    rx: numberField(input, 'rx', -Math.PI * 8, Math.PI * 8),
    ry: numberField(input, 'ry', -Math.PI * 8, Math.PI * 8),
    rz: numberField(input, 'rz', -Math.PI * 8, Math.PI * 8),
    source: stringField(input, 'source', 96),
    speed: numberField(input, 'speed', 0, 100),
    tick: integerField(input, 'tick', 0, 2 ** 31 - 1),
    x: numberField(input, 'x', -maxCoordinate, maxCoordinate),
    y: numberField(input, 'y', -maxCoordinate, maxCoordinate),
    z: numberField(input, 'z', -maxCoordinate, maxCoordinate)
  };
}

function optionalAnimalActivityField(input: Record<string, unknown>, key: string): InfinigenAnimalActivity | undefined {
  const value = input[key];

  if (value === undefined) {
    return undefined;
  }

  if (value === 'drink' || value === 'explore' || value === 'graze' || value === 'rest' || value === 'social' || value === 'watch') {
    return value;
  }

  throw new Error(`Invalid ${key}`);
}

function cameraField(input: Record<string, unknown>, key: string): InfinigenResetEvent['camera'] {
  const value = recordField(input, key);
  return {
    position: vec3Field(value, 'position', -maxCoordinate, maxCoordinate),
    target: vec3Field(value, 'target', -maxCoordinate, maxCoordinate)
  };
}

function terrainEvent(input: Record<string, unknown>): InfinigenTerrainEvent {
  const columns = integerField(input, 'columns', 2, maxTerrainSide);
  const rows = integerField(input, 'rows', 2, maxTerrainSide);
  const cellCount = columns * rows;

  if (cellCount > maxTerrainCells) {
    throw new Error('Invalid terrain size');
  }

  const samples = numberArrayField(input, 'samples', cellCount, -maxCoordinate, maxCoordinate);

  return {
    ...(input.biome === undefined ? {} : { biome: terrainBiomeField(input, 'biome') }),
    columns,
    ...(input.id === undefined ? {} : { id: stringField(input, 'id', maxStringLength) }),
    material: materialField(input, 'material'),
    ...(input.position === undefined ? {} : { position: vec3Field(input, 'position', -maxCoordinate, maxCoordinate) }),
    rows,
    samples,
    size: numberField(input, 'size', 0.001, maxWorldSize),
    type: 'terrain'
  };
}

function terrainBiomeField(input: Record<string, unknown>, key: string): InfinigenTerrainBiome {
  const value = stringField(input, key, maxStringLength);

  if (
    value === 'alpine' ||
    value === 'basalt' ||
    value === 'coast' ||
    value === 'fern' ||
    value === 'tussock' ||
    value === 'wetland'
  ) {
    return value;
  }

  throw new Error(`Invalid ${key}`);
}

function materialField(input: Record<string, unknown>, key: string): InfinigenMaterial {
  const value = recordField(input, key);
  return {
    color: rgbaField(value, 'color'),
    ...(value.emissive === undefined ? {} : { emissive: rgbaField(value, 'emissive') }),
    ...(value.metalness === undefined ? {} : { metalness: numberField(value, 'metalness', 0, 1) }),
    ...(value.roughness === undefined ? {} : { roughness: numberField(value, 'roughness', 0, 1) })
  };
}

function instanceKindField(input: Record<string, unknown>, key: string): InfinigenInstanceKind {
  const value = stringField(input, key, maxStringLength);

  if (
    value === 'animal' ||
    value === 'basalt' ||
    value === 'building' ||
    value === 'cedar' ||
    value === 'crystal' ||
    value === 'fern' ||
    value === 'glow' ||
    value === 'house' ||
    value === 'landmark' ||
    value === 'road'
  ) {
    return value;
  }

  throw new Error(`Invalid ${key}`);
}

function rgbaField(input: Record<string, unknown>, key: string): Rgba {
  const value = numberArrayField(input, key, 4, 0, 1);

  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 1];
}

function vec3Field(input: Record<string, unknown>, key: string, min: number, max: number): Vec3 {
  const value = numberArrayField(input, key, 3, min, max);

  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
}

function integerField(input: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = numberField(input, key, min, max);

  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${key}`);
  }

  return value;
}

function numberArrayField(
  input: Record<string, unknown>,
  key: string,
  expectedLength: number,
  min: number,
  max: number
): readonly number[] {
  const value = input[key];

  if (
    !Array.isArray(value) ||
    value.length !== expectedLength ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= min && item <= max)
  ) {
    throw new Error(`Invalid ${key}`);
  }

  return value;
}

function numberField(input: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = input[key];

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${key}`);
  }

  return value;
}

function recordField(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];

  if (!isRecord(value)) {
    throw new Error(`Invalid ${key}`);
  }

  return value;
}

function stringField(input: Record<string, unknown>, key: string, maxLength: number): string {
  const value = input[key];

  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error(`Invalid ${key}`);
  }

  return value;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
