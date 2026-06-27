import {
  as,
  defineSchema,
  evaluate,
  from,
  fromIndexedObjectSource,
  id,
  number,
  optional,
  pipe,
  project,
  relation,
  string,
  type TarstateDiagnostic
} from '@tarstate/core';
import type { InfinigenAnimalActivity, InfinigenAnimalPoseRow } from './protocol';

type AnimalPoseRelationRow = {
  readonly activity: string | undefined;
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

export type AnimalPosePatchResult = {
  readonly diagnostics: readonly TarstateDiagnostic[];
  readonly rows: readonly InfinigenAnimalPoseRow[];
};

export class AnimalPoseRelationState {
  #rows: readonly InfinigenAnimalPoseRow[] = [];
  #version = 0;

  reset(): void {
    this.#rows = [];
    this.#version += 1;
  }

  async patch(rows: readonly InfinigenAnimalPoseRow[]): Promise<AnimalPosePatchResult> {
    const version = ++this.#version;
    const candidateRows = [...this.#rows, ...rows];
    const result = await latestAnimalPoseRows(candidateRows);

    if (version === this.#version) {
      this.#rows = result.rows;
    }

    return result;
  }
}

const animalPoseSchema = defineSchema({
  animalPose: relation<AnimalPoseRelationRow>({
    ephemeral: true,
    key: ['entityId', 'tick', 'source'],
    fields: {
      activity: optional(string()),
      entityId: id('animal'),
      gaitPhase: number(),
      rx: number(),
      ry: number(),
      rz: number(),
      source: string(),
      speed: number(),
      tick: number(),
      x: number(),
      y: number(),
      z: number()
    }
  })
});

const pose = as(animalPoseSchema.animalPose, 'pose');
const animalPoseProjection = pipe(
  from(pose),
  project({
    activity: pose.activity,
    entityId: pose.entityId,
    gaitPhase: pose.gaitPhase,
    rx: pose.rx,
    ry: pose.ry,
    rz: pose.rz,
    source: pose.source,
    speed: pose.speed,
    tick: pose.tick,
    x: pose.x,
    y: pose.y,
    z: pose.z
  })
);

export async function latestAnimalPoseRows(rows: readonly InfinigenAnimalPoseRow[]): Promise<AnimalPosePatchResult> {
  const result = await evaluate(
    fromIndexedObjectSource({
      animalPose: rows
    }),
    animalPoseProjection
  );
  const latestByAnimal = new Map<string, InfinigenAnimalPoseRow>();

  for (const row of result.rows) {
    const protocolRow = toProtocolRow(row);
    const existing = latestByAnimal.get(protocolRow.entityId);

    if (existing === undefined || protocolRow.tick >= existing.tick) {
      latestByAnimal.set(protocolRow.entityId, protocolRow);
    }
  }

  return {
    diagnostics: result.diagnostics,
    rows: [...latestByAnimal.values()].sort((left, right) => left.entityId.localeCompare(right.entityId))
  };
}

function toProtocolRow(row: AnimalPoseRelationRow): InfinigenAnimalPoseRow {
  const activity = animalActivity(row.activity);

  return {
    ...(activity === undefined ? {} : { activity }),
    entityId: row.entityId,
    gaitPhase: row.gaitPhase,
    rx: row.rx,
    ry: row.ry,
    rz: row.rz,
    source: row.source,
    speed: row.speed,
    tick: row.tick,
    x: row.x,
    y: row.y,
    z: row.z
  };
}

function animalActivity(value: string | undefined): InfinigenAnimalActivity | undefined {
  switch (value) {
    case 'drink':
    case 'explore':
    case 'graze':
    case 'rest':
    case 'social':
    case 'watch':
      return value;
    default:
      return undefined;
  }
}
