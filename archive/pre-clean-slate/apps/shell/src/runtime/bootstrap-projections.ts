import {
  filesystemTreeProjectionRelations,
  filesystemTreeSchema,
  patchpitSystemSchemaRef,
  projectFilesystemTreeRows,
  windowManagerStateSchema,
  type PatchpitSchemaRef,
  type SeedFilesystem,
} from '@patchpit/system';
import {
  filesystemTreeProjection,
  filesystemTreeSchemaId,
  runtimeError,
  workspaceProjectionRelationSet,
  type AutomergeHeadSet,
  type FilesystemTreeNodeRow,
  type ProjectionName,
  workspaceLayoutProjection,
  workspaceProjectionSchemaId,
  type ProjectionBasis,
  type ProjectionEvent,
  type ProjectionSnapshot,
  type ProjectionSubscription,
  type ProjectionSubscriptionRequest,
  type RelationSet,
  type RuntimeClient,
  type RuntimeError,
} from '@patchpit/system/runtime';
import {
  relationSetFromRows,
} from '@patchpit/system/runtime/relations';
import { automergeHeadSetForHandle } from './automerge-heads';

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

type BootstrapProjectionDefinition = {
  readonly projection: ProjectionName;
  readonly description: string;
  readonly owner: string;
  readonly schemaId: ProjectionSubscriptionRequest['schemaId'];
  readonly schema: ProjectionSnapshotSchema;
  readonly schemaRef: PatchpitSchemaRef;
  readonly subscribe: (seed: SeedFilesystem, update: () => void) => () => void;
  readonly payload: (seed: SeedFilesystem) => ProjectionPayload | RuntimeError;
};

type ProjectionPayload = {
  readonly relations: RelationSet;
  readonly storageHeads: AutomergeHeadSet;
};

type ProjectionSnapshotSchema = Pick<ProjectionSnapshot, 'schema' | 'schemaHash'>;

type ProjectionBuildContext = {
  readonly definition: BootstrapProjectionDefinition;
  readonly request: ProjectionSubscriptionRequest;
  readonly subscriptionId: string;
  readonly payload: ProjectionPayload;
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

const bootstrapProjectionDefinitions: Partial<Record<ProjectionName, BootstrapProjectionDefinition>> = {
  [filesystemTreeProjection]: {
    projection: filesystemTreeProjection,
    description: 'Public filesystem tree projection served as Tarstate relation rows.',
    owner: '@patchpit/system/filesystem',
    schemaId: filesystemTreeSchemaId,
    schema: filesystemTreeSnapshotSchema,
    schemaRef: filesystemTreeSchemaRef,
    subscribe: (seed, update) => {
      seed.indexHandle.on('change', update);
      return () => seed.indexHandle.off('change', update);
    },
    payload: filesystemTreePayload,
  },
  [workspaceLayoutProjection]: {
    projection: workspaceLayoutProjection,
    description: 'Shared Patchpit window-manager state projected as runtime layout relations.',
    owner: '@patchpit/system/runtime',
    schemaId: workspaceProjectionSchemaId,
    schema: workspaceProjectionSnapshotSchema,
    schemaRef: workspaceProjectionSchemaRef,
    subscribe: (seed, update) => {
      seed.windowManagerHandle.on('change', update);
      return () => seed.windowManagerHandle.off('change', update);
    },
    payload: workspaceLayoutPayload,
  },
} as const satisfies Partial<Record<ProjectionName, BootstrapProjectionDefinition>>;

assertProjectionDefinitionsShipSchemas(bootstrapProjectionDefinitions);

export function createBootstrapProjectionSubscriber({
  diagnostics,
  seed,
  workspaceId,
}: BootstrapProjectionSubscriberOptions): RuntimeClient['subscribeProjection'] {
  let nextSubscriptionId = 1;

  return (request, listener) => {
    const subscriptionId = `${workspaceId}:projection:${nextSubscriptionId++}`;
    diagnostics.recordProjectionOpened(subscriptionId, request);
    const definition = bootstrapProjectionDefinitions[request.projection];

    return definition === undefined
      ? errorSubscription(subscriptionId, listener, runtimeError(
        'unknown_projection',
        `Unknown projection: ${request.projection}`,
      ), diagnostics)
      : subscribeLiveProjection({
        definition,
        diagnostics,
        listener,
        request,
        seed,
        subscriptionId,
      });
  };
}

function subscribeLiveProjection({
  definition,
  diagnostics,
  listener,
  request,
  seed,
  subscriptionId,
}: LiveProjectionSubscriptionOptions): ProjectionSubscription {
  const schemaError = projectionSchemaError(request, definition.schemaId);
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
    (update) => definition.subscribe(seed, update),
    () => buildProjectionSnapshot({ definition, request, seed, subscriptionId }),
  );
}

type LiveProjectionSubscriptionOptions = {
  readonly definition: BootstrapProjectionDefinition;
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

function buildProjectionSnapshot({
  definition,
  request,
  seed,
  subscriptionId,
}: Omit<LiveProjectionSubscriptionOptions, 'diagnostics' | 'listener'>): ProjectionSnapshot | RuntimeError {
  const payload = definition.payload(seed);
  if (isRuntimeError(payload)) return payload;

  return projectionSnapshot({
    definition,
    request,
    subscriptionId,
    payload,
  });
}

function projectionSnapshot({
  definition,
  payload,
  request,
  subscriptionId,
}: ProjectionBuildContext): ProjectionSnapshot {
  return {
    subscriptionId,
    projection: definition.projection,
    schemaId: request.schemaId,
    ...definition.schema,
    basis: request.basis ?? { kind: 'live' },
    storageHeads: payload.storageHeads,
    relations: payload.relations,
  };
}

function filesystemTreePayload(seed: SeedFilesystem): ProjectionPayload | RuntimeError {
  const projection = filesystemTreeBaseRows(seed);
  if (isRuntimeError(projection)) return projection;

  return {
    storageHeads: automergeHeadSetForHandle(seed.indexHandle),
    relations: relationSetFromRows(filesystemTreeProjectionRelations(projection.rows)),
  };
}

function filesystemTreeBaseRows(seed: SeedFilesystem): { readonly rows: readonly FilesystemTreeNodeRow[] } | RuntimeError {
  const projection = projectFilesystemTreeRows(seed.indexHandle.doc(), seed.rootUrl);
  if (projection.diagnostics.length > 0) {
    return {
      code: 'internal_error',
      message: 'Filesystem projection failed.',
      metadata: { diagnostics: projection.diagnostics.map((diagnostic) => String(diagnostic)) },
    };
  }

  return { rows: projection.rows };
}

function workspaceLayoutPayload(seed: SeedFilesystem): ProjectionPayload {
  return {
    storageHeads: automergeHeadSetForHandle(seed.windowManagerHandle),
    relations: workspaceProjectionRelationSet(seed.windowManagerHandle.doc()),
  };
}

function assertProjectionDefinitionsShipSchemas(
  definitions: Partial<Record<ProjectionName, BootstrapProjectionDefinition>>,
): void {
  for (const definition of Object.values(definitions)) {
    const projectionDefinition = assertProjectionDefinition(definition);
    if (projectionDefinition.schema.schema === undefined) {
      throw new Error(`Projection ${projectionDefinition.projection} must ship an inline schema descriptor.`);
    }
    if (projectionDefinition.schemaRef.hash === undefined && projectionDefinition.schema.schemaHash === undefined) {
      throw new Error(`Projection ${projectionDefinition.projection} must ship a schema hash.`);
    }
  }
}

function assertProjectionDefinition(
  definition: BootstrapProjectionDefinition | undefined,
): BootstrapProjectionDefinition {
  if (definition === undefined) throw new Error('Bootstrap projection definition is missing.');
  return definition;
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

function isRuntimeError(value: unknown): value is RuntimeError {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && 'code' in value && typeof value.code === 'string'
    && 'message' in value && typeof value.message === 'string';
}

function isLiveBasis(basis: ProjectionBasis | undefined): boolean {
  return basis === undefined || basis.kind === 'live';
}
