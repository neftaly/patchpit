import {
  filesystemTreeProjectionRelations,
  filesystemTreeSchema,
  patchpitSystemSchemaRef,
  PatchpitType,
  projectFilesystemTreeRows,
  runtimeProjectionsSchema,
  windowManagerStateSchema,
  type PatchpitSchemaRef,
  type SeedFilesystem,
} from '@patchpit/system';
import {
  filesystemTreeProjection,
  filesystemTreeSchemaId,
  projectionVirtualDirectoryUrl,
  projectionVirtualFileUrl,
  projectionVirtualRootUrl,
  projectionVirtualServiceRootUrl,
  runtimeProjectionsProjection,
  runtimeProjectionsRelation,
  runtimeProjectionsSchemaId,
  runtimeError,
  workspaceProjectionRelationSet,
  type AutomergeHeadSet,
  type FilesystemTreeNodeRow,
  type ProjectionName,
  workspaceLayoutProjection,
  workspaceProjectionSchemaId,
  type ProjectionBasis,
  type ProjectionEvent,
  type ProjectionVirtualFileName,
  type ProjectionSnapshot,
  type ProjectionSubscription,
  type ProjectionSubscriptionRequest,
  type RelationSet,
  type RuntimeProjectionCatalogRow,
  type RuntimeClient,
  type RuntimeError,
} from '@patchpit/system/runtime';
import {
  relationRows,
  relationSetFromRows,
  relationSetNames,
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

const runtimeProjectionsSchemaRef = patchpitSystemSchemaRef(runtimeProjectionsSchema);
const runtimeProjectionsSnapshotSchema = {
  schema: runtimeProjectionsSchema,
  ...(runtimeProjectionsSchemaRef.hash === undefined ? {} : { schemaHash: runtimeProjectionsSchemaRef.hash }),
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
  [runtimeProjectionsProjection]: {
    projection: runtimeProjectionsProjection,
    description: 'Runtime projection catalog advertised by the active Patchpit runtime.',
    owner: '@patchpit/system/runtime',
    schemaId: runtimeProjectionsSchemaId,
    schema: runtimeProjectionsSnapshotSchema,
    schemaRef: runtimeProjectionsSchemaRef,
    subscribe: () => () => {},
    payload: projectionCatalogPayload,
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

  const rows = [
    ...projection.rows,
    ...projectionVirtualTreeRows(seed, projection.rows.length),
  ];

  return {
    storageHeads: automergeHeadSetForHandle(seed.indexHandle),
    relations: relationSetFromRows(filesystemTreeProjectionRelations(rows)),
  };
}

function filesystemTreeBasePayload(seed: SeedFilesystem): ProjectionPayload | RuntimeError {
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

function projectionCatalogPayload(): ProjectionPayload {
  const rows = Object.values(bootstrapProjectionDefinitions)
    .map((definition) => projectionCatalogRow(assertProjectionDefinition(definition)))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    storageHeads: {},
    relations: relationSetFromRows({ [runtimeProjectionsRelation]: rows }),
  };
}

function projectionVirtualTreeRows(seed: SeedFilesystem, position: number): readonly FilesystemTreeNodeRow[] {
  const projectionDefinitions = Object.values(bootstrapProjectionDefinitions)
    .map((definition) => assertProjectionDefinition(definition))
    .sort((left, right) => left.projection.localeCompare(right.projection));
  const rows: FilesystemTreeNodeRow[] = [
    projectionVirtualFolderRow({
      name: 'srv',
      parentUrl: seed.rootUrl,
      position,
      title: 'srv',
      url: projectionVirtualServiceRootUrl,
    }),
    projectionVirtualFolderRow({
      name: 'projections',
      parentUrl: projectionVirtualServiceRootUrl,
      position: 0,
      title: 'projections',
      url: projectionVirtualRootUrl,
    }),
  ];

  projectionDefinitions.forEach((definition, projectionPosition) => {
    const projectionUrl = projectionVirtualDirectoryUrl(definition.projection);
    rows.push(projectionVirtualFolderRow({
      name: definition.projection,
      parentUrl: projectionVirtualRootUrl,
      position: projectionPosition,
      title: definition.projection,
      url: projectionUrl,
    }));
    projectionVirtualFileNames.forEach((file, filePosition) => {
      rows.push(projectionVirtualFileRow({
        name: file,
        parentUrl: projectionUrl,
        position: filePosition,
        text: projectionVirtualFileText(seed, definition, file),
        title: file,
        url: projectionVirtualFileUrl(definition.projection, file),
      }));
    });
  });

  return rows;
}

const projectionVirtualFileNames: readonly ProjectionVirtualFileName[] = ['meta.json', 'schema.json', 'summary.json'];

function projectionVirtualFolderRow(input: {
  readonly name: string;
  readonly parentUrl: string;
  readonly position: number;
  readonly title: string;
  readonly url: string;
}): FilesystemTreeNodeRow {
  return {
    isRoot: false,
    kind: 'folder',
    mediaType: null,
    name: input.name,
    parentUrl: input.parentUrl,
    position: input.position,
    sourceUrl: null,
    text: '',
    title: input.title,
    type: PatchpitType.Folder,
    url: input.url,
  };
}

function projectionVirtualFileRow(input: {
  readonly name: string;
  readonly parentUrl: string;
  readonly position: number;
  readonly text: string;
  readonly title: string;
  readonly url: string;
}): FilesystemTreeNodeRow {
  return {
    isRoot: false,
    kind: 'file',
    mediaType: 'application/json',
    name: input.name,
    parentUrl: input.parentUrl,
    position: input.position,
    sourceUrl: null,
    text: input.text,
    title: input.title,
    type: PatchpitType.File,
    url: input.url,
  };
}

function projectionVirtualFileText(
  seed: SeedFilesystem,
  definition: BootstrapProjectionDefinition,
  file: ProjectionVirtualFileName,
): string {
  const value = file === 'meta.json'
    ? projectionMetaExport(definition)
    : file === 'schema.json'
      ? definition.schema.schema
      : projectionSummaryExport(seed, definition);
  return `${JSON.stringify(value, null, 2)}\n`;
}

function projectionMetaExport(definition: BootstrapProjectionDefinition) {
  return projectionCatalogRow(definition);
}

function projectionSummaryExport(seed: SeedFilesystem, definition: BootstrapProjectionDefinition) {
  const payload = definition.projection === filesystemTreeProjection
    ? filesystemTreeBasePayload(seed)
    : definition.payload(seed);
  if (isRuntimeError(payload)) {
    return {
      basis: { kind: 'live' },
      error: payload,
      projection: definition.projection,
      schemaHash: projectionSchemaHash(definition),
      schemaId: definition.schemaId,
    };
  }

  return {
    basis: { kind: 'live' },
    projection: definition.projection,
    relationCounts: Object.fromEntries(relationSetNames(payload.relations)
      .map((relation) => [relation, relationRows(payload.relations, relation).length])),
    schemaHash: projectionSchemaHash(definition),
    schemaId: definition.schemaId,
    storageHeads: payload.storageHeads,
  };
}

function projectionCatalogRow(definition: BootstrapProjectionDefinition): RuntimeProjectionCatalogRow {
  return {
    basisKinds: ['live'],
    description: definition.description,
    name: definition.projection,
    owner: definition.owner,
    readOnly: true,
    schemaHash: projectionSchemaHash(definition),
    schemaId: definition.schemaId,
    ...(definition.schemaRef.url === undefined ? {} : { schemaUrl: definition.schemaRef.url }),
  };
}

function projectionSchemaHash(definition: BootstrapProjectionDefinition): NonNullable<ProjectionSnapshot['schemaHash']> {
  const schemaHash = definition.schemaRef.hash ?? definition.schema.schemaHash;
  if (schemaHash === undefined) {
    throw new Error(`Projection ${definition.projection} must ship a schema hash.`);
  }
  return schemaHash;
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
