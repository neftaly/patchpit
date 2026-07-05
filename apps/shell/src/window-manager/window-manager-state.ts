import type { DocHandle } from '@automerge/automerge-repo';
import {
  defineSchema,
  opaqueField,
  relation,
  stringField,
  write,
} from '@tarstate/core';
import {
  type WindowContext,
  type WindowLayoutNode,
  WindowManagerNodeKind,
  type WindowManagerStateDoc,
  type WindowSurface,
  SurfaceRole,
} from '@patchpit/system';

export type SplitPath = readonly ('first' | 'second')[];
export type ContextMovePlacement = 'before' | 'after';

type WindowManagerStateRow = {
  contexts: Record<string, WindowContext>;
  focus: string;
  id: string;
  layout: WindowLayoutNode;
  surfaces: Record<string, WindowSurface>;
};

const stateId = 'window-manager';
const windowManagerSchema = defineSchema({
  state: relation<WindowManagerStateRow>({
    key: 'id',
    fields: {
      contexts: opaqueField<Record<string, WindowContext>>(),
      focus: stringField(),
      id: stringField(),
      layout: opaqueField<WindowLayoutNode>(),
      surfaces: opaqueField<Record<string, WindowSurface>>(),
    },
  }),
});

export function commitWindowManagerState(
  handle: DocHandle<WindowManagerStateDoc>,
  update: (state: WindowManagerStateDoc) => void,
): void {
  const next = cloneWindowManagerState(handle.doc());
  update(next);
  const changes = write(windowManagerSchema.state)
    .updateByKey(stateId, {
      contexts: next.contexts,
      focus: next.focus,
      id: stateId,
      layout: next.layout,
      surfaces: next.surfaces,
    })
    .changes as WindowManagerStateRow;

  handle.change((doc) => {
    doc.contexts = structuredClone(changes.contexts);
    doc.focus = changes.focus;
    doc.layout = structuredClone(changes.layout);
    doc.surfaces = structuredClone(changes.surfaces);
  });
}

export function focusContext(
  state: WindowManagerStateDoc,
  surfaceId: string,
  contextId: string,
): void {
  const surface = surfaceById(state, surfaceId);
  if (surface === undefined) return;
  if (surface.previewContext === contextId) {
    surface.activeContext = contextId;
    focusSurface(state, surfaceId);
    return;
  }

  if (surface.contexts.includes(contextId)) {
    clearPreview(state, surface);
    surface.activeContext = contextId;
    focusSurface(state, surfaceId);
  }
}

export function closeContext(
  state: WindowManagerStateDoc,
  surfaceId: string,
  contextId: string,
): void {
  const surface = surfaceById(state, surfaceId);
  if (surface === undefined) return;
  const index = surface.contexts.indexOf(contextId);

  if (index === -1) {
    if (surface.previewContext === contextId) {
      clearPreview(state, surface);
      if (surface.activeContext === contextId) setActive(surface, surface.contexts.at(0));
      focusSurface(state, surfaceId);
    }
    return;
  }

  surface.contexts.splice(index, 1);
  deleteUnreferencedContext(state, contextId);
  if (surface.activeContext === contextId) {
    setActive(surface, surface.previewContext ?? surface.contexts[Math.max(0, index - 1)]);
  }
  focusSurface(state, surfaceId);
}

export function pinContext(
  state: WindowManagerStateDoc,
  surfaceId: string,
  contextId: string,
): void {
  const surface = surfaceById(state, surfaceId);
  if (surface === undefined) return;
  if (surface.previewContext !== contextId) return;

  delete surface.previewContext;
  if (!surface.contexts.includes(contextId)) surface.contexts.push(contextId);
  surface.activeContext = contextId;
  focusSurface(state, surfaceId);
}

export function moveContext(
  state: WindowManagerStateDoc,
  sourceSurfaceId: string,
  contextId: string,
  targetSurfaceId: string,
  targetContextId?: string,
  placement: ContextMovePlacement = 'after',
): void {
  const source = surfaceById(state, sourceSurfaceId);
  const target = surfaceById(state, targetSurfaceId);
  if (source === undefined || target?.role !== SurfaceRole.DocumentSet) return;
  if (contextId === targetContextId) return;

  const sourcePinnedIndex = source.contexts.indexOf(contextId);
  const wasPreview = source.previewContext === contextId;
  if (sourcePinnedIndex === -1 && !wasPreview) return;

  if (wasPreview) delete source.previewContext;
  else source.contexts.splice(sourcePinnedIndex, 1);
  if (source.activeContext === contextId && source !== target) {
    setActive(source, source.previewContext ?? nextActiveContext(source, sourcePinnedIndex));
  }

  clearPreview(state, target, contextId);
  const existingTargetIndex = target.contexts.indexOf(contextId);
  if (existingTargetIndex !== -1) target.contexts.splice(existingTargetIndex, 1);

  const targetIndex = targetContextId === undefined ? -1 : target.contexts.indexOf(targetContextId);
  const insertIndex = targetIndex === -1
    ? target.contexts.length
    : placement === 'before'
      ? targetIndex
      : targetIndex + 1;

  target.contexts.splice(insertIndex, 0, contextId);
  target.activeContext = contextId;
  focusSurface(state, targetSurfaceId);
}

export function openContext(
  state: WindowManagerStateDoc,
  context: WindowContext,
  sourceSurfaceId?: string,
): void {
  const surfaceId = targetDocumentSurfaceId(state, sourceSurfaceId);
  if (surfaceId === undefined) return;
  const surface = surfaceById(state, surfaceId);
  if (surface === undefined) return;

  if (surface.previewContext === context.id) delete surface.previewContext;
  else clearPreview(state, surface);

  state.contexts[context.id] = context;
  if (!surface.contexts.includes(context.id)) surface.contexts.push(context.id);
  surface.activeContext = context.id;
  focusSurface(state, surfaceId);
}

export function previewContext(
  state: WindowManagerStateDoc,
  context: WindowContext,
  sourceSurfaceId?: string,
): void {
  const surfaceId = targetDocumentSurfaceId(state, sourceSurfaceId);
  if (surfaceId === undefined) return;
  const surface = surfaceById(state, surfaceId);
  if (surface === undefined) return;

  if (surface.contexts.includes(context.id)) {
    clearPreview(state, surface);
  } else if (surface.previewContext !== context.id) {
    clearPreview(state, surface);
    surface.previewContext = context.id;
  }

  state.contexts[context.id] = context;
  surface.activeContext = context.id;
  focusSurface(state, surfaceId);
}

export function resizeSplit(state: WindowManagerStateDoc, path: SplitPath, ratio: number): void {
  const node = splitAtPath(state.layout, path);
  if (node !== undefined) node.ratio = clampedRatio(ratio);
}

function surfaceById(state: WindowManagerStateDoc, surfaceId: string): WindowSurface | undefined {
  return state.surfaces[surfaceId];
}

function targetDocumentSurfaceId(
  state: WindowManagerStateDoc,
  sourceSurfaceId: string | undefined,
): string | undefined {
  if (
    state.focus !== sourceSurfaceId
    && state.surfaces[state.focus]?.role === SurfaceRole.DocumentSet
  ) {
    return state.focus;
  }

  return Object.values(state.surfaces).find((surface) => (
    surface.id !== sourceSurfaceId && surface.role === SurfaceRole.DocumentSet
  ))?.id;
}

function focusSurface(state: WindowManagerStateDoc, surfaceId: string): void {
  state.focus = surfaceId;
}

function setActive(surface: WindowSurface, contextId: string | undefined): void {
  if (contextId === undefined) delete surface.activeContext;
  else surface.activeContext = contextId;
}

function nextActiveContext(surface: WindowSurface, removedIndex: number): string | undefined {
  return surface.contexts[removedIndex] ?? surface.contexts[Math.max(0, removedIndex - 1)];
}

function clearPreview(
  state: WindowManagerStateDoc,
  surface: WindowSurface,
  keepContextId?: string,
): void {
  const preview = surface.previewContext;
  if (preview === undefined) return;

  delete surface.previewContext;
  if (preview !== keepContextId && !surface.contexts.includes(preview)) {
    deleteUnreferencedContext(state, preview);
  }
}

function deleteUnreferencedContext(state: WindowManagerStateDoc, contextId: string): void {
  const stillReferenced = Object.values(state.surfaces).some((surface) => (
    surface.contexts.includes(contextId) || surface.previewContext === contextId
  ));
  if (!stillReferenced) delete state.contexts[contextId];
}

function splitAtPath(
  root: WindowLayoutNode,
  path: SplitPath,
): Extract<WindowLayoutNode, { kind: WindowManagerNodeKind.Split }> | undefined {
  let node = root;
  for (const side of path) {
    if (node.kind === WindowManagerNodeKind.Surface) return undefined;
    node = node[side];
  }
  return node.kind === WindowManagerNodeKind.Split ? node : undefined;
}

function clampedRatio(ratio: number): number {
  return Math.min(0.95, Math.max(0.05, ratio));
}

function cloneWindowManagerState(state: WindowManagerStateDoc): WindowManagerStateDoc {
  return {
    ...state,
    contexts: structuredClone(state.contexts),
    layout: structuredClone(state.layout),
    surfaces: structuredClone(state.surfaces),
  };
}
