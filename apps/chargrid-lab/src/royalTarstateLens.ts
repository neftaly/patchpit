import {
  and,
  as,
  boolean as bool,
  defineSchema,
  eq,
  from,
  fromObjectSource,
  id,
  leftJoin,
  maybe,
  number,
  optional,
  pipe,
  project,
  ref,
  relation,
  string,
  type Query,
  type RelationRef,
  type RelationSource,
  type TarstateDiagnostic
} from '../../../packages/tarstate/src/index';
import type { LayoutBox, PickTarget, UiSceneState } from './royalChargridPrimitives';

export type RoyalTarstatePointerSampleInput = {
  readonly sampleId: string;
  readonly sequence: number;
  readonly kind: 'down' | 'leave' | 'move' | 'up';
  readonly x: number;
  readonly y: number;
  readonly targetId?: string;
};

export type RoyalTarstateLensInput = {
  readonly scopeId?: string;
  readonly layoutBoxes: readonly LayoutBox[];
  readonly pickTargets: readonly PickTarget[];
  readonly sceneState?: UiSceneState;
  readonly pointerSamples?: readonly RoyalTarstatePointerSampleInput[];
};

export type RoyalTarstateLayoutBoxRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly primitive: string;
  readonly tone: string;
  readonly text?: string;
  readonly hasInteraction: boolean;
  readonly assetSrc?: string;
};

export type RoyalTarstatePickTargetRow = {
  readonly scopeId: string;
  readonly targetId: string;
  readonly boxId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly space: string;
  readonly kind: string;
  readonly role: string;
  readonly label: string;
  readonly group?: string;
  readonly layer: number;
  readonly disabled: boolean;
};

export type RoyalTarstateRenderFlagRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly active: boolean;
  readonly focused: boolean;
};

export type RoyalTarstatePointerSampleRow = {
  readonly scopeId: string;
  readonly sampleId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly targetId?: string;
};

export type RoyalTarstateRenderRow = {
  readonly scopeId: string;
  readonly boxId: string;
  readonly label: string;
  readonly primitive: string;
  readonly tone: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly active: boolean | undefined;
  readonly focused: boolean | undefined;
};

export type RoyalTarstatePickProbeRow = {
  readonly scopeId: string;
  readonly sampleId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly targetId: string | undefined;
  readonly targetRole: string | undefined;
  readonly targetLabel: string | undefined;
};

export type RoyalTarstateLensProbe = {
  readonly relationNames: readonly string[];
  readonly diagnostics: readonly TarstateDiagnostic[];
  readonly rowCount: (relation: string | RelationRef) => number;
  readonly rows: <Relation extends RelationRef>(relation: Relation) => readonly RowOf<Relation>[];
};

export type RoyalTarstateLensSnapshot = {
  readonly source: RelationSource;
  readonly probe: RoyalTarstateLensProbe;
};

type RowOf<Relation extends RelationRef> = Relation extends RelationRef<infer Row> ? Row : never;

export const royalTarstateSchema = defineSchema({
  layoutBoxes: relation<RoyalTarstateLayoutBoxRow>({
    key: ['scopeId', 'boxId'],
    fields: {
      scopeId: id('royalScope'),
      boxId: id('royalBox'),
      x: number(),
      y: number(),
      width: number(),
      height: number(),
      label: string(),
      primitive: string(),
      tone: string(),
      text: optional(string()),
      hasInteraction: bool(),
      assetSrc: optional(string())
    }
  }),
  pickTargets: relation<RoyalTarstatePickTargetRow>({
    key: ['scopeId', 'targetId'],
    fields: {
      scopeId: id('royalScope'),
      targetId: id('royalPickTarget'),
      boxId: ref('layoutBoxes.boxId'),
      x: number(),
      y: number(),
      width: number(),
      height: number(),
      space: string(),
      kind: string(),
      role: string(),
      label: string(),
      group: optional(string()),
      layer: number(),
      disabled: bool()
    }
  }),
  renderFlags: relation<RoyalTarstateRenderFlagRow>({
    key: ['scopeId', 'boxId'],
    ephemeral: true,
    fields: {
      scopeId: id('royalScope'),
      boxId: ref('layoutBoxes.boxId'),
      active: bool(),
      focused: bool()
    }
  }),
  pointerSamples: relation<RoyalTarstatePointerSampleRow>({
    key: ['scopeId', 'sampleId'],
    ephemeral: true,
    fields: {
      scopeId: id('royalScope'),
      sampleId: id('royalPointerSample'),
      sequence: number(),
      kind: string(),
      x: number(),
      y: number(),
      targetId: optional(ref('pickTargets.targetId'))
    }
  })
});

const layoutBox = as(royalTarstateSchema.layoutBoxes, 'layoutBox');
const pickTarget = as(royalTarstateSchema.pickTargets, 'pickTarget');
const renderFlag = as(royalTarstateSchema.renderFlags, 'renderFlag');
const pointerSample = as(royalTarstateSchema.pointerSamples, 'pointerSample');

export const royalTarstateQueries = {
  renderRows: pipe(
    from(layoutBox),
    leftJoin(
      from(renderFlag),
      and(
        eq(layoutBox.scopeId, renderFlag.scopeId),
        eq(layoutBox.boxId, renderFlag.boxId)
      )
    ),
    project({
      scopeId: layoutBox.scopeId,
      boxId: layoutBox.boxId,
      label: layoutBox.label,
      primitive: layoutBox.primitive,
      tone: layoutBox.tone,
      x: layoutBox.x,
      y: layoutBox.y,
      width: layoutBox.width,
      height: layoutBox.height,
      active: maybe(renderFlag.active),
      focused: maybe(renderFlag.focused)
    })
  ) satisfies Query<RoyalTarstateRenderRow>,
  pickProbeRows: pipe(
    from(pointerSample),
    leftJoin(
      from(pickTarget),
      and(
        eq(pointerSample.scopeId, pickTarget.scopeId),
        eq(pointerSample.targetId, pickTarget.targetId)
      )
    ),
    project({
      scopeId: pointerSample.scopeId,
      sampleId: pointerSample.sampleId,
      sequence: pointerSample.sequence,
      kind: pointerSample.kind,
      x: pointerSample.x,
      y: pointerSample.y,
      targetId: maybe(pointerSample.targetId),
      targetRole: maybe(pickTarget.role),
      targetLabel: maybe(pickTarget.label)
    })
  ) satisfies Query<RoyalTarstatePickProbeRow>
} as const;

export function createRoyalTarstateLensSnapshot(input: RoyalTarstateLensInput): RoyalTarstateLensSnapshot {
  const scopeId = input.scopeId ?? 'royal';
  const data: Record<string, readonly unknown[]> = {
    [royalTarstateSchema.layoutBoxes.name]: deriveLayoutBoxRows(scopeId, input.layoutBoxes),
    [royalTarstateSchema.pickTargets.name]: derivePickTargetRows(scopeId, input.pickTargets),
    [royalTarstateSchema.renderFlags.name]: deriveRenderFlagRows(scopeId, input.sceneState),
    [royalTarstateSchema.pointerSamples.name]: derivePointerSampleRows(scopeId, input.pointerSamples ?? [])
  };
  const diagnostics = deriveDiagnostics(data);
  const objectSource = fromObjectSource(data);
  const source: RelationSource = {
    ...objectSource,
    diagnostics: () => diagnostics
  };

  return {
    source,
    probe: createProbe(data, diagnostics)
  };
}

function deriveLayoutBoxRows(
  scopeId: string,
  layoutBoxes: readonly LayoutBox[]
): readonly RoyalTarstateLayoutBoxRow[] {
  return layoutBoxes.map((box) => ({
    scopeId,
    boxId: box.id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    label: box.label,
    primitive: box.primitive,
    tone: box.tone,
    hasInteraction: box.interaction !== undefined,
    ...(box.text === undefined ? {} : { text: box.text }),
    ...(box.gltf === undefined ? {} : { assetSrc: box.gltf.src })
  }));
}

function derivePickTargetRows(
  scopeId: string,
  pickTargets: readonly PickTarget[]
): readonly RoyalTarstatePickTargetRow[] {
  return pickTargets.map((target) => ({
    scopeId,
    targetId: target.id,
    boxId: target.id,
    x: target.bounds.rect.x,
    y: target.bounds.rect.y,
    width: target.bounds.rect.width,
    height: target.bounds.rect.height,
    space: target.bounds.space,
    kind: target.kind,
    role: target.interaction.role,
    label: target.interaction.label,
    layer: target.layer,
    disabled: target.interaction.disabled ?? false,
    ...(target.interaction.group === undefined ? {} : { group: target.interaction.group })
  }));
}

function deriveRenderFlagRows(
  scopeId: string,
  sceneState: UiSceneState | undefined
): readonly RoyalTarstateRenderFlagRow[] {
  const activeIds = sceneState?.activeIds ?? new Set<string>();
  const focusIds = sceneState?.focusIds ?? new Set<string>();
  const ids = new Set([...activeIds, ...focusIds]);

  return Array.from(ids, (boxId) => ({
    scopeId,
    boxId,
    active: activeIds.has(boxId),
    focused: focusIds.has(boxId)
  }));
}

function derivePointerSampleRows(
  scopeId: string,
  pointerSamples: readonly RoyalTarstatePointerSampleInput[]
): readonly RoyalTarstatePointerSampleRow[] {
  return pointerSamples.map((sample) => ({
    scopeId,
    sampleId: sample.sampleId,
    sequence: sample.sequence,
    kind: sample.kind,
    x: sample.x,
    y: sample.y,
    ...(sample.targetId === undefined ? {} : { targetId: sample.targetId })
  }));
}

function createProbe(
  data: Record<string, readonly unknown[]>,
  diagnostics: readonly TarstateDiagnostic[]
): RoyalTarstateLensProbe {
  return {
    relationNames: Object.keys(data),
    diagnostics,
    rowCount: (relationRef) => data[relationName(relationRef)]?.length ?? 0,
    rows: (relationRef) => (data[relationRef.name] ?? []) as readonly RowOf<typeof relationRef>[]
  };
}

function deriveDiagnostics(data: Record<string, readonly unknown[]>): readonly TarstateDiagnostic[] {
  const diagnostics: TarstateDiagnostic[] = [];
  const boxes = data[royalTarstateSchema.layoutBoxes.name] as readonly RoyalTarstateLayoutBoxRow[];
  const targets = data[royalTarstateSchema.pickTargets.name] as readonly RoyalTarstatePickTargetRow[];
  const renderFlags = data[royalTarstateSchema.renderFlags.name] as readonly RoyalTarstateRenderFlagRow[];
  const pointerSamples = data[royalTarstateSchema.pointerSamples.name] as readonly RoyalTarstatePointerSampleRow[];
  const boxIds = new Set(boxes.map((box) => scopedKey(box.scopeId, box.boxId)));
  const targetIds = new Set(targets.map((target) => scopedKey(target.scopeId, target.targetId)));

  for (const target of targets) {
    if (!boxIds.has(scopedKey(target.scopeId, target.boxId))) {
      diagnostics.push(
        missingRef('pick target points at missing layout box', royalTarstateSchema.pickTargets.name, 'boxId', target.targetId)
      );
    }
  }

  for (const flag of renderFlags) {
    if (!boxIds.has(scopedKey(flag.scopeId, flag.boxId))) {
      diagnostics.push(
        missingRef('render flag points at missing layout box', royalTarstateSchema.renderFlags.name, 'boxId', flag.boxId)
      );
    }
  }

  for (const sample of pointerSamples) {
    if (sample.targetId !== undefined && !targetIds.has(scopedKey(sample.scopeId, sample.targetId))) {
      diagnostics.push(
        missingRef(
          'pointer sample points at missing pick target',
          royalTarstateSchema.pointerSamples.name,
          'targetId',
          sample.sampleId
        )
      );
    }
  }

  return diagnostics;
}

function missingRef(message: string, relationNameValue: string, field: string, key: string): TarstateDiagnostic {
  return {
    code: 'missing_ref',
    message,
    relation: relationNameValue,
    field,
    key
  };
}

function scopedKey(scopeId: string, idValue: string): string {
  return `${scopeId}\u0000${idValue}`;
}

function relationName(input: string | RelationRef): string {
  return typeof input === 'string' ? input : input.name;
}
