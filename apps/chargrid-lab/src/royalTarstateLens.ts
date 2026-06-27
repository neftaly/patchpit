import {
  assetIdForSrc,
  createStoreLensSnapshot,
  royalLensSchema,
  royalProbeDiagnostics,
  royalQueries,
  type LensProbe,
  type LensSnapshot,
  type ReadableStore,
  type RoyalLayoutBoxRow,
  type RoyalPickProbeRow,
  type RoyalPickTargetRow,
  type RoyalPointerSampleRow,
  type RoyalRenderFlagRow,
  type RoyalRenderRow,
  type RoyalScopeRow,
  type StoreLens
} from '@royal/tarstate-lens';
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

export type RoyalTarstateLayoutBoxRow = RoyalLayoutBoxRow;
export type RoyalTarstatePickTargetRow = RoyalPickTargetRow;
export type RoyalTarstateRenderFlagRow = RoyalRenderFlagRow;
export type RoyalTarstatePointerSampleRow = RoyalPointerSampleRow;
export type RoyalTarstateRenderRow = RoyalRenderRow;
export type RoyalTarstatePickProbeRow = RoyalPickProbeRow;
export type RoyalTarstateLensProbe = LensProbe;
export type RoyalTarstateLensSnapshot = LensSnapshot;

export const royalTarstateSchema = royalLensSchema;
export const royalTarstateQueries = royalQueries;

type RoyalTarstateAdapterState = {
  readonly scopeId: string;
  readonly layoutBoxes: readonly LayoutBox[];
  readonly pickTargets: readonly PickTarget[];
  readonly sceneState?: UiSceneState;
  readonly pointerSamples: readonly RoyalTarstatePointerSampleInput[];
};

export function createRoyalTarstateLensSnapshot(input: RoyalTarstateLensInput): RoyalTarstateLensSnapshot {
  const state: RoyalTarstateAdapterState = {
    scopeId: input.scopeId ?? 'royal',
    layoutBoxes: input.layoutBoxes,
    pickTargets: input.pickTargets,
    ...(input.sceneState === undefined ? {} : { sceneState: input.sceneState }),
    pointerSamples: input.pointerSamples ?? []
  };
  const store = readableStore(state);

  return createStoreLensSnapshot(createRoyalTarstateStoreLenses(store), {
    diagnostics: royalProbeDiagnostics
  });
}

function createRoyalTarstateStoreLenses(
  store: ReadableStore<RoyalTarstateAdapterState>
): readonly StoreLens<unknown, Record<string, unknown>>[] {
  return [
    {
      relation: royalLensSchema.scopes,
      store,
      rows: (state) => [deriveScopeRow(state as RoyalTarstateAdapterState)]
    },
    {
      relation: royalLensSchema.layoutBoxes,
      store,
      rows: (state) => deriveLayoutBoxRows(state as RoyalTarstateAdapterState)
    },
    {
      relation: royalLensSchema.pickTargets,
      store,
      rows: (state) => derivePickTargetRows(state as RoyalTarstateAdapterState)
    },
    {
      relation: royalLensSchema.renderFlags,
      store,
      rows: (state) => deriveRenderFlagRows(state as RoyalTarstateAdapterState)
    },
    {
      relation: royalLensSchema.pointerSamples,
      store,
      rows: (state) => derivePointerSampleRows(state as RoyalTarstateAdapterState)
    }
  ];
}

function deriveScopeRow(state: RoyalTarstateAdapterState): RoyalScopeRow {
  return {
    scopeId: state.scopeId,
    compact: false,
    gridColumns: Math.max(0, ...state.layoutBoxes.map((box) => box.x + box.width)),
    gridRows: Math.max(0, ...state.layoutBoxes.map((box) => box.y + box.height))
  };
}

function deriveLayoutBoxRows(state: RoyalTarstateAdapterState): readonly RoyalLayoutBoxRow[] {
  return state.layoutBoxes.map((box) => ({
    scopeId: state.scopeId,
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
    ...(box.gltf === undefined ? {} : { assetId: assetIdForSrc(box.gltf.src) })
  }));
}

function derivePickTargetRows(state: RoyalTarstateAdapterState): readonly RoyalPickTargetRow[] {
  return state.pickTargets.map((target) => ({
    scopeId: state.scopeId,
    targetId: target.id,
    boxId: target.id,
    x: target.bounds.rect.x,
    y: target.bounds.rect.y,
    width: target.bounds.rect.width,
    height: target.bounds.rect.height,
    role: target.interaction.role,
    label: target.interaction.label,
    layer: target.layer,
    disabled: target.interaction.disabled ?? false,
    ...(target.interaction.group === undefined ? {} : { group: target.interaction.group })
  }));
}

function deriveRenderFlagRows(state: RoyalTarstateAdapterState): readonly RoyalRenderFlagRow[] {
  const activeIds = state.sceneState?.activeIds ?? new Set<string>();
  const focusIds = state.sceneState?.focusIds ?? new Set<string>();
  const ids = new Set([...activeIds, ...focusIds]);

  return Array.from(ids, (boxId) => ({
    scopeId: state.scopeId,
    boxId,
    active: activeIds.has(boxId),
    focused: focusIds.has(boxId),
    hovered: false
  }));
}

function derivePointerSampleRows(state: RoyalTarstateAdapterState): readonly RoyalPointerSampleRow[] {
  return state.pointerSamples.map((sample) => ({
    scopeId: state.scopeId,
    sampleId: sample.sampleId,
    sequence: sample.sequence,
    kind: sample.kind,
    x: sample.x,
    y: sample.y,
    ...(sample.targetId === undefined ? {} : { targetId: sample.targetId })
  }));
}

function readableStore<State>(state: State): ReadableStore<State> {
  return {
    getState: () => state
  };
}
