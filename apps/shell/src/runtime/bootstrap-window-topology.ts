import {
  runtimeError,
  type Json,
  type RuntimeError,
} from '@patchpit/system/runtime';
import {
  SurfaceRole,
  WindowManagerNodeKind,
  type WindowLayoutNode,
  type WindowManagerStateDoc,
  type WindowSurface,
} from '@patchpit/system';
import {
  type ContextDropTarget,
  type SplitPath,
} from '../window-manager/window-manager-state';
import { isRecord } from './bootstrap-intent-result';

export function validateNewContextDropTarget(
  state: WindowManagerStateDoc,
  target: ContextDropTarget,
): RuntimeError | undefined {
  if (target.area === 'tabs') return validateTabDropTarget(state, target);
  return validateContentDropTarget(state, target);
}

export function validateMovedContextDropTarget(
  state: WindowManagerStateDoc,
  sourceSurfaceId: string,
  contextId: string,
  target: ContextDropTarget,
): RuntimeError | undefined {
  const source = state.surfaces[sourceSurfaceId];
  if (source === undefined) return surfaceNotFound(sourceSurfaceId);
  if (!surfaceHasContext(source, contextId)) return contextNotFoundOnSurface(contextId, sourceSurfaceId);

  if (target.area === 'tabs') {
    if (target.contextId === contextId) {
      return runtimeError('conflict', `Context ${contextId} cannot be moved relative to itself.`);
    }
    return validateTabDropTarget(state, target);
  }

  const targetError = validateContentDropTarget(state, target);
  if (targetError !== undefined) return targetError;
  if (target.zone === 'center' && sourceSurfaceId === target.surfaceId) {
    return runtimeError('conflict', `Context ${contextId} is already on surface ${target.surfaceId}.`);
  }

  return undefined;
}

export function validateSurfaceContext(
  state: WindowManagerStateDoc,
  surfaceId: string,
  contextId: string,
): RuntimeError | undefined {
  const surface = state.surfaces[surfaceId];
  if (surface === undefined) return surfaceNotFound(surfaceId);
  return surfaceHasContext(surface, contextId) ? undefined : contextNotFoundOnSurface(contextId, surfaceId);
}

export function validatePreviewContext(
  state: WindowManagerStateDoc,
  surfaceId: string,
  contextId: string,
): RuntimeError | undefined {
  const surface = state.surfaces[surfaceId];
  if (surface === undefined) return surfaceNotFound(surfaceId);
  if (surface.previewContext === contextId) return undefined;
  if (surfaceHasContext(surface, contextId)) {
    return runtimeError('conflict', `Context ${contextId} is not a preview on surface ${surfaceId}.`);
  }
  return contextNotFoundOnSurface(contextId, surfaceId);
}

export function validateResizeSplit(
  state: WindowManagerStateDoc,
  path: SplitPath,
): RuntimeError | undefined {
  const node = nodeAtPath(state.layout, path);
  if (node === undefined) return runtimeError('not_found', `Split path ${formatSplitPath(path)} was not found.`);
  if (node.kind !== WindowManagerNodeKind.Split) {
    return runtimeError('conflict', `Split path ${formatSplitPath(path)} is not a split.`);
  }
  return undefined;
}

export function targetDocumentSurface(
  state: WindowManagerStateDoc,
  sourceSurfaceId: string | undefined,
): WindowSurface | undefined {
  const focused = state.surfaces[state.focus];
  if (state.focus !== sourceSurfaceId && focused?.role === SurfaceRole.DocumentSet) return focused;
  return Object.values(state.surfaces).find((surface) => (
    surface.id !== sourceSurfaceId && surface.role === SurfaceRole.DocumentSet
  ));
}

export function targetLaunchSurface(
  state: WindowManagerStateDoc,
  role: SurfaceRole,
): WindowSurface | undefined {
  const focused = state.surfaces[state.focus];
  return focused?.role === role
    ? focused
    : Object.values(state.surfaces).find((surface) => surface.role === role);
}

export function surfaceWithContext(
  state: WindowManagerStateDoc,
  contextId: string,
): WindowSurface | undefined {
  return Object.values(state.surfaces).find((surface) => surfaceHasContext(surface, contextId));
}

export function surfaceHasContext(surface: WindowSurface, contextId: string): boolean {
  return surface.previewContext === contextId || surface.contexts.includes(contextId);
}

export function contextDropTarget(target: Json | undefined): ContextDropTarget | undefined {
  if (!isRecord(target) || typeof target.area !== 'string' || typeof target.surfaceId !== 'string') {
    return undefined;
  }

  if (target.area === 'tabs') {
    if (target.contextId !== undefined && typeof target.contextId !== 'string') return undefined;
    if (
      target.placement !== undefined
      && target.placement !== 'before'
      && target.placement !== 'after'
    ) {
      return undefined;
    }

    return {
      area: 'tabs',
      surfaceId: target.surfaceId,
      ...(typeof target.contextId === 'string' ? { contextId: target.contextId } : {}),
      ...(target.placement === 'before' || target.placement === 'after' ? { placement: target.placement } : {}),
    };
  }

  if (
    target.area === 'content'
    && (target.zone === 'center' || target.zone === 'left' || target.zone === 'right' || target.zone === 'top' || target.zone === 'bottom')
    && isSplitPath(target.path)
  ) {
    return {
      area: 'content',
      path: target.path,
      surfaceId: target.surfaceId,
      zone: target.zone,
    };
  }

  return undefined;
}

export function contextDropTargetJson(target: ContextDropTarget): Json {
  if (target.area === 'tabs') {
    return {
      area: target.area,
      surfaceId: target.surfaceId,
      ...(target.contextId === undefined ? {} : { contextId: target.contextId }),
      ...(target.placement === undefined ? {} : { placement: target.placement }),
    };
  }

  return {
    area: target.area,
    path: splitPathJson(target.path),
    surfaceId: target.surfaceId,
    zone: target.zone,
  };
}

export function splitPathJson(path: SplitPath): readonly Json[] {
  return path.map((side) => side);
}

export function isSplitPath(value: unknown): value is readonly ('first' | 'second')[] {
  return Array.isArray(value) && value.every((item) => item === 'first' || item === 'second');
}

function validateTabDropTarget(
  state: WindowManagerStateDoc,
  target: Extract<ContextDropTarget, { area: 'tabs' }>,
): RuntimeError | undefined {
  const surface = state.surfaces[target.surfaceId];
  if (surface === undefined) return surfaceNotFound(target.surfaceId);
  if (surface.role !== SurfaceRole.DocumentSet) {
    return runtimeError('conflict', `Surface ${target.surfaceId} cannot accept document contexts.`);
  }
  if (target.contextId !== undefined && !surfaceHasContext(surface, target.contextId)) {
    return contextNotFoundOnSurface(target.contextId, target.surfaceId);
  }
  return undefined;
}

function validateContentDropTarget(
  state: WindowManagerStateDoc,
  target: Extract<ContextDropTarget, { area: 'content' }>,
): RuntimeError | undefined {
  const surface = state.surfaces[target.surfaceId];
  if (surface === undefined) return surfaceNotFound(target.surfaceId);
  if (surface.role !== SurfaceRole.DocumentSet) {
    return runtimeError('conflict', `Surface ${target.surfaceId} cannot accept document contexts.`);
  }

  const node = nodeAtPath(state.layout, target.path);
  if (node === undefined) return runtimeError('not_found', `Split path ${formatSplitPath(target.path)} was not found.`);
  if (node.kind !== WindowManagerNodeKind.Surface || node.surfaceId !== target.surfaceId) {
    return runtimeError('conflict', `Split path ${formatSplitPath(target.path)} no longer targets surface ${target.surfaceId}.`);
  }

  return undefined;
}

function nodeAtPath(root: WindowLayoutNode, path: SplitPath): WindowLayoutNode | undefined {
  let node = root;
  for (const side of path) {
    if (node.kind === WindowManagerNodeKind.Surface) return undefined;
    node = node[side];
  }
  return node;
}

function surfaceNotFound(surfaceId: string): RuntimeError {
  return runtimeError('not_found', `Surface ${surfaceId} was not found.`);
}

function contextNotFoundOnSurface(contextId: string, surfaceId: string): RuntimeError {
  return runtimeError('not_found', `Context ${contextId} was not found on surface ${surfaceId}.`);
}

function formatSplitPath(path: SplitPath): string {
  return path.length === 0 ? '<root>' : path.join('.');
}
