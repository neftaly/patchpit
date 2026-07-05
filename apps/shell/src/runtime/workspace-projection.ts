import {
  type PatchpitSchemaHash,
  SurfaceRole,
  WindowManagerNodeKind,
  type WindowContext,
  type WindowLayoutNode,
  type WindowSurface,
} from '@patchpit/system';
import {
  workspaceContextsRelation,
  workspaceStateRelation,
  workspaceSurfacesRelation,
  type AutomergeHeadSet,
  type ProjectionEvent,
  type RelationSet,
  type WorkspaceProjectionStateRow,
} from '@patchpit/system/runtime';
import {
  runtimeProjectionFailureFromRuntimeError,
  type RuntimeProjectionFailure,
} from './runtime-projection-failure';

export type WorkspaceProjection = {
  readonly contexts: Readonly<Record<string, WindowContext>>;
  readonly focus: string;
  readonly layout: WindowLayoutNode;
  readonly schemaHash?: PatchpitSchemaHash;
  readonly storageHeads?: AutomergeHeadSet;
  readonly surfaces: Readonly<Record<string, WindowSurface>>;
};

export type WorkspaceProjectionState =
  | { readonly status: 'initializing' }
  | {
      readonly status: 'ready';
      readonly workspace: WorkspaceProjection;
    }
  | { readonly status: 'failed'; readonly failure: RuntimeProjectionFailure };

export function workspaceProjectionFromProjectionEvent(event: ProjectionEvent): WorkspaceProjectionState {
  if (event.type === 'error') {
    return {
      status: 'failed',
      failure: runtimeProjectionFailureFromRuntimeError(event.error, 'Workspace projection unavailable'),
    };
  }
  if (event.type === 'patch') return { status: 'initializing' };
  return workspaceProjectionFromRelationSet(
    event.snapshot.relations,
    event.snapshot.schemaHash,
    event.snapshot.storageHeads,
  );
}

export function workspaceProjectionFromRelationSet(
  relations: RelationSet,
  schemaHash?: PatchpitSchemaHash,
  storageHeads?: AutomergeHeadSet,
): WorkspaceProjectionState {
  const diagnostics: string[] = [];
  const stateRows = relations.relations[workspaceStateRelation] ?? [];
  const contextRows = relations.relations[workspaceContextsRelation] ?? [];
  const surfaceRows = relations.relations[workspaceSurfacesRelation] ?? [];

  if (stateRows.length !== 1) {
    diagnostics.push(`Expected exactly one workspace state row, found ${stateRows.length}.`);
  }

  const state = stateRows[0];
  if (state !== undefined && !isWorkspaceStateRow(state)) {
    diagnostics.push('Workspace state row does not match the window-manager schema.');
  }

  const contexts = recordRowsById(contextRows, isWindowContextRow, 'workspace context', diagnostics);
  const surfaces = recordRowsById(surfaceRows, isWindowSurfaceRow, 'workspace surface', diagnostics);

  if (state === undefined || !isWorkspaceStateRow(state) || diagnostics.length > 0) {
    return {
      status: 'failed',
      failure: {
        title: 'Workspace projection unavailable',
        message: 'The workspace projection did not include usable window-manager rows.',
        details: diagnostics,
      },
    };
  }

  const invariantDiagnostics = workspaceProjectionInvariantDiagnostics(state, contexts, surfaces);
  if (invariantDiagnostics.length > 0) {
    return {
      status: 'failed',
      failure: {
        title: 'Workspace projection unavailable',
        message: 'The workspace projection rows are not internally consistent.',
        details: invariantDiagnostics,
      },
    };
  }

  return {
    status: 'ready',
    workspace: {
      contexts,
      focus: state.focus,
      layout: state.layout,
      ...(schemaHash === undefined ? {} : { schemaHash }),
      ...(storageHeads === undefined ? {} : { storageHeads }),
      surfaces,
    },
  };
}

function workspaceProjectionInvariantDiagnostics(
  state: WorkspaceProjectionStateRow,
  contexts: Readonly<Record<string, WindowContext>>,
  surfaces: Readonly<Record<string, WindowSurface>>,
): readonly string[] {
  const diagnostics: string[] = [];

  if (surfaces[state.focus] === undefined) {
    diagnostics.push(`Workspace focus references missing surface "${state.focus}".`);
  }

  collectMissingLayoutSurfaces(state.layout, surfaces, diagnostics, new Set());

  for (const surface of Object.values(surfaces)) {
    for (const contextId of surface.contexts) {
      if (contexts[contextId] === undefined) {
        diagnostics.push(`Surface "${surface.id}" pinned context "${contextId}" is missing from contexts.`);
      }
    }

    if (surface.previewContext !== undefined && contexts[surface.previewContext] === undefined) {
      diagnostics.push(`Surface "${surface.id}" previewContext "${surface.previewContext}" is missing from contexts.`);
    }

    if (surface.activeContext === undefined) continue;
    if (contexts[surface.activeContext] === undefined) {
      diagnostics.push(`Surface "${surface.id}" activeContext "${surface.activeContext}" is missing from contexts.`);
    }
    if (!surfaceHasContext(surface, surface.activeContext)) {
      diagnostics.push(
        `Surface "${surface.id}" activeContext "${surface.activeContext}" is not pinned or previewed by the surface.`,
      );
    }
  }

  return diagnostics;
}

function collectMissingLayoutSurfaces(
  node: WindowLayoutNode,
  surfaces: Readonly<Record<string, WindowSurface>>,
  diagnostics: string[],
  reportedSurfaceIds: Set<string>,
): void {
  if (node.kind === WindowManagerNodeKind.Surface) {
    if (surfaces[node.surfaceId] !== undefined || reportedSurfaceIds.has(node.surfaceId)) return;
    diagnostics.push(`Workspace layout references missing surface "${node.surfaceId}".`);
    reportedSurfaceIds.add(node.surfaceId);
    return;
  }

  collectMissingLayoutSurfaces(node.first, surfaces, diagnostics, reportedSurfaceIds);
  collectMissingLayoutSurfaces(node.second, surfaces, diagnostics, reportedSurfaceIds);
}

function surfaceHasContext(surface: WindowSurface, contextId: string): boolean {
  return surface.previewContext === contextId || surface.contexts.includes(contextId);
}

function recordRowsById<Row extends { readonly id: string }>(
  rows: readonly unknown[],
  isRow: (row: unknown) => row is Row,
  label: string,
  diagnostics: string[],
): Readonly<Record<string, Row>> {
  const record: Record<string, Row> = {};
  for (const row of rows) {
    if (!isRow(row)) {
      diagnostics.push(`Malformed ${label} row.`);
      continue;
    }
    if (record[row.id] !== undefined) diagnostics.push(`Duplicate ${label} row for ${row.id}.`);
    record[row.id] = row;
  }
  return record;
}

function isWorkspaceStateRow(row: unknown): row is WorkspaceProjectionStateRow {
  return (
    isRecord(row)
    && typeof row.focus === 'string'
    && typeof row.id === 'string'
    && isWindowLayoutNode(row.layout)
  );
}

function isWindowContextRow(row: unknown): row is WindowContext {
  return (
    isRecord(row)
    && typeof row.app === 'string'
    && isAppContainer(row.container)
    && typeof row.id === 'string'
    && isOptionalString(row.title)
    && typeof row.url === 'string'
  );
}

function isWindowSurfaceRow(row: unknown): row is WindowSurface {
  return (
    isRecord(row)
    && isOptionalString(row.activeContext)
    && isStringArray(row.contexts)
    && typeof row.id === 'string'
    && isOptionalString(row.previewContext)
    && (row.role === SurfaceRole.DocumentSet || row.role === SurfaceRole.WorkspaceView)
  );
}

function isWindowLayoutNode(value: unknown): value is WindowLayoutNode {
  if (!isRecord(value)) return false;
  if (value.kind === WindowManagerNodeKind.Surface) return typeof value.surfaceId === 'string';
  return (
    value.kind === WindowManagerNodeKind.Split
    && (value.direction === 'column' || value.direction === 'row')
    && isWindowLayoutNode(value.first)
    && typeof value.ratio === 'number'
    && isWindowLayoutNode(value.second)
  );
}

function isAppContainer(value: unknown): value is WindowContext['container'] {
  return isRecord(value) && Array.isArray(value.mounts);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
