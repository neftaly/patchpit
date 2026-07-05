import {
  filesystemTreeProjectionRelations,
  filesystemTreeSchema,
  patchpitSystemSchemaRef,
  projectFilesystemTreeRows,
  windowManagerStateSchema,
  type SeedFilesystem,
  type WindowContext,
  type WindowManagerStateDoc,
  type WindowSurface,
} from '@patchpit/system';
import {
  automergeHeadSetForHandle,
  filesystemTreeProjection,
  filesystemTreeSchemaId,
  runtimeError,
  workspaceContextsRelation,
  workspaceLayoutProjection,
  workspaceProjectionSchemaId,
  workspaceStateRelation,
  workspaceSurfacesRelation,
  type ProjectionBasis,
  type ProjectionEvent,
  type ProjectionSnapshot,
  type ProjectionSubscription,
  type ProjectionSubscriptionRequest,
  type RelationSet,
  type RuntimeClient,
  type RuntimeError,
  type TarstateRow,
  type WorkspaceProjectionRelations,
  type WorkspaceProjectionStateRow,
} from '@patchpit/system/runtime';

type ProjectionDiagnosticsRecorder = {
  recordProjectionClosed(subscriptionId: string): void;
  recordProjectionEvent(subscriptionId: string, event: ProjectionEvent): void;
  recordProjectionOpened(subscriptionId: string, request: ProjectionSubscriptionRequest): void;
};

type BootstrapProjectionSubscriberOptions = {
  readonly diagnostics: ProjectionDiagnosticsRecorder;
  readonly seed: SeedFilesystem;
  readonly workspaceId: string;
};

type LiveProjectionBuildContext = {
  readonly request: ProjectionSubscriptionRequest;
  readonly seed: SeedFilesystem;
  readonly subscriptionId: string;
};

const filesystemTreeSchemaRef = patchpitSystemSchemaRef(filesystemTreeSchema);
const filesystemTreeSnapshotSchema = {
  schema: filesystemTreeSchema,
  ...(filesystemTreeSchemaRef.hash === undefined ? {} : { schemaHash: filesystemTreeSchemaRef.hash }),
} as const;

const workspaceProjectionSchemaRef = patchpitSystemSchemaRef(windowManagerStateSchema);
const workspaceProjectionSnapshotSchema = {
  schema: windowManagerStateSchema,
  ...(workspaceProjectionSchemaRef.hash === undefined ? {} : { schemaHash: workspaceProjectionSchemaRef.hash }),
} as const;

export function createBootstrapProjectionSubscriber({
  diagnostics,
  seed,
  workspaceId,
}: BootstrapProjectionSubscriberOptions): RuntimeClient['subscribeProjection'] {
  let nextSubscriptionId = 1;

  return (request, listener) => {
    const subscriptionId = `${workspaceId}:projection:${nextSubscriptionId++}`;
    diagnostics.recordProjectionOpened(subscriptionId, request);

    if (request.projection === filesystemTreeProjection) {
      return subscribeFilesystemTreeProjection({
        diagnostics,
        listener,
        request,
        seed,
        subscriptionId,
      });
    }

    if (request.projection === workspaceLayoutProjection) {
      return subscribeWorkspaceLayoutProjection({
        diagnostics,
        listener,
        request,
        seed,
        subscriptionId,
      });
    }

    return errorSubscription(subscriptionId, listener, runtimeError(
      'unknown_projection',
      `Unknown projection: ${request.projection}`,
    ), diagnostics);
  };
}

function subscribeFilesystemTreeProjection({
  diagnostics,
  listener,
  request,
  seed,
  subscriptionId,
}: LiveProjectionSubscriptionOptions): ProjectionSubscription {
  const schemaError = projectionSchemaError(request, filesystemTreeSchemaId);
  if (schemaError !== undefined) {
    return errorSubscription(subscriptionId, listener, schemaError, diagnostics);
  }

  const basisError = liveBasisError(request);
  if (basisError !== undefined) {
    return errorSubscription(subscriptionId, listener, basisError, diagnostics);
  }

  return liveProjectionSubscription(
    subscriptionId,
    listener,
    diagnostics,
    (update) => {
      seed.indexHandle.on('change', update);
      return () => seed.indexHandle.off('change', update);
    },
    () => filesystemTreeSnapshot({ request, seed, subscriptionId }),
  );
}

function subscribeWorkspaceLayoutProjection({
  diagnostics,
  listener,
  request,
  seed,
  subscriptionId,
}: LiveProjectionSubscriptionOptions): ProjectionSubscription {
  const schemaError = projectionSchemaError(request, workspaceProjectionSchemaId);
  if (schemaError !== undefined) {
    return errorSubscription(subscriptionId, listener, schemaError, diagnostics);
  }

  const basisError = liveBasisError(request);
  if (basisError !== undefined) {
    return errorSubscription(subscriptionId, listener, basisError, diagnostics);
  }

  return liveProjectionSubscription(
    subscriptionId,
    listener,
    diagnostics,
    (update) => {
      seed.windowManagerHandle.on('change', update);
      return () => seed.windowManagerHandle.off('change', update);
    },
    () => workspaceLayoutSnapshot({ request, seed, subscriptionId }),
  );
}

type LiveProjectionSubscriptionOptions = {
  readonly diagnostics: ProjectionDiagnosticsRecorder;
  readonly listener: (event: ProjectionEvent) => void;
  readonly request: ProjectionSubscriptionRequest;
  readonly seed: SeedFilesystem;
  readonly subscriptionId: string;
};

function projectionSchemaError(
  request: ProjectionSubscriptionRequest,
  schemaId: string,
): RuntimeError | undefined {
  return request.schemaId === schemaId
    ? undefined
    : runtimeError(
      'schema_mismatch',
      `Projection ${request.projection} requires schema ${schemaId}.`,
    );
}

function liveBasisError(request: ProjectionSubscriptionRequest): RuntimeError | undefined {
  return isLiveBasis(request.basis)
    ? undefined
    : runtimeError(
      'unsupported_basis',
      `The bootstrap runtime only serves live ${request.projection} projections.`,
    );
}

function filesystemTreeSnapshot({
  request,
  seed,
  subscriptionId,
}: LiveProjectionBuildContext): ProjectionSnapshot | RuntimeError {
  const projection = projectFilesystemTreeRows(seed.indexHandle.doc(), seed.rootUrl);
  if (projection.diagnostics.length > 0) {
    return {
      code: 'internal_error',
      message: 'Filesystem projection failed.',
      metadata: { diagnostics: projection.diagnostics.map((diagnostic) => String(diagnostic)) },
    };
  }

  return {
    subscriptionId,
    projection: request.projection,
    schemaId: request.schemaId,
    ...filesystemTreeSnapshotSchema,
    basis: request.basis ?? { kind: 'live' },
    storageHeads: automergeHeadSetForHandle(seed.indexHandle),
    relations: filesystemTreeRelationSet(projection.rows),
  };
}

function filesystemTreeRelationSet(rows: Parameters<typeof filesystemTreeProjectionRelations>[0]): RelationSet {
  return relationSet(filesystemTreeProjectionRelations(rows));
}

function workspaceLayoutSnapshot({
  request,
  seed,
  subscriptionId,
}: LiveProjectionBuildContext): ProjectionSnapshot {
  return {
    subscriptionId,
    projection: request.projection,
    schemaId: request.schemaId,
    ...workspaceProjectionSnapshotSchema,
    basis: request.basis ?? { kind: 'live' },
    storageHeads: automergeHeadSetForHandle(seed.windowManagerHandle),
    relations: workspaceLayoutRelationSet(seed.windowManagerHandle.doc()),
  };
}

function workspaceLayoutRelationSet(state: WindowManagerStateDoc): RelationSet {
  return relationSet(workspaceProjectionRelations(state));
}

function workspaceProjectionRelations(
  state: WindowManagerStateDoc,
): WorkspaceProjectionRelations {
  return {
    [workspaceStateRelation]: [workspaceStateRow(state)],
    [workspaceContextsRelation]: workspaceContextRows(state),
    [workspaceSurfacesRelation]: workspaceSurfaceRows(state),
  };
}

function workspaceStateRow(state: WindowManagerStateDoc): WorkspaceProjectionStateRow {
  return {
    focus: state.focus,
    id: 'window-manager',
    layout: structuredClone(state.layout),
  };
}

function workspaceContextRows(state: WindowManagerStateDoc): readonly WindowContext[] {
  return Object.values(state.contexts)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((context) => ({
      app: context.app,
      container: structuredClone(context.container),
      id: context.id,
      ...(context.title === undefined ? {} : { title: context.title }),
      url: context.url,
    }));
}

function workspaceSurfaceRows(state: WindowManagerStateDoc): readonly WindowSurface[] {
  return Object.values(state.surfaces)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((surface) => ({
      ...(surface.activeContext === undefined ? {} : { activeContext: surface.activeContext }),
      contexts: [...surface.contexts],
      id: surface.id,
      ...(surface.previewContext === undefined ? {} : { previewContext: surface.previewContext }),
      role: surface.role,
    }));
}

function liveProjectionSubscription(
  subscriptionId: string,
  listener: (event: ProjectionEvent) => void,
  diagnostics: ProjectionDiagnosticsRecorder,
  subscribeChange: (update: () => void) => () => void,
  snapshot: () => ProjectionSnapshot | RuntimeError,
): ProjectionSubscription {
  let closed = false;
  const emit = (type: 'snapshot' | 'reset', reason?: string) => {
    if (closed) return;
    const nextSnapshot = snapshot();
    if (isRuntimeError(nextSnapshot)) {
      const event = { type: 'error', error: nextSnapshot } satisfies ProjectionEvent;
      diagnostics.recordProjectionEvent(subscriptionId, event);
      listener(event);
      return;
    }
    const event = (
      type === 'snapshot'
        ? { type, snapshot: nextSnapshot }
        : reason === undefined
          ? { type, snapshot: nextSnapshot }
          : { type, snapshot: nextSnapshot, reason }
    ) satisfies ProjectionEvent;
    diagnostics.recordProjectionEvent(subscriptionId, event);
    listener(event);
  };
  const update = () => emit('reset', 'source-change');
  const unsubscribe = subscribeChange(update);

  emit('snapshot');

  return {
    subscriptionId,
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      diagnostics.recordProjectionClosed(subscriptionId);
    },
  };
}

function errorSubscription(
  subscriptionId: string,
  listener: (event: ProjectionEvent) => void,
  error: RuntimeError,
  diagnostics: ProjectionDiagnosticsRecorder,
): ProjectionSubscription {
  const event = { type: 'error', error } satisfies ProjectionEvent;
  diagnostics.recordProjectionEvent(subscriptionId, event);
  listener(event);
  let closed = false;
  return {
    subscriptionId,
    close() {
      if (closed) return;
      closed = true;
      diagnostics.recordProjectionClosed(subscriptionId);
    },
  };
}

function relationSet(relations: Readonly<Record<string, readonly unknown[]>>): RelationSet {
  return { relations: relations as Readonly<Record<string, readonly TarstateRow[]>> };
}

function isRuntimeError(value: unknown): value is RuntimeError {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && 'code' in value && typeof value.code === 'string'
    && 'message' in value && typeof value.message === 'string';
}

function isLiveBasis(basis: ProjectionBasis | undefined): boolean {
  return basis === undefined || basis.kind === 'live';
}
