import { useEffect, useState } from 'react';
import {
  projectFilesystemTreeFromRows,
  type FilesystemNode,
  type ProjectedFilesystem,
} from '@patchpit/system';
import {
  filesystemTreeNodesRelation,
  filesystemTreeProjection,
  filesystemTreeSchemaId,
  workspaceLayoutProjection,
  workspaceProjectionFromRelationSet,
  workspaceProjectionSchemaId,
  runtimeProjectionsProjection,
  runtimeProjectionsRelation,
  runtimeProjectionsSchemaId,
  type ProjectionEvent,
  type ProjectionSnapshot,
  type ProjectionSubscription,
  type ProjectionSubscriptionRequest,
  type RelationSet,
  type RuntimeProjectionCatalogRow,
  type RuntimeClient,
  type WorkspaceProjection,
  type WorkspaceProjectionState,
} from '@patchpit/system/runtime';
import { relationRows } from '@patchpit/system/runtime/relations';
import {
  runtimeProjectionFailureFromRuntimeError,
  runtimeProjectionFailureFromUnknownError,
  type RuntimeProjectionFailure,
} from './runtime-projection-failure';

export type { RuntimeProjectionFailure } from './runtime-projection-failure';
export type { WorkspaceProjection, WorkspaceProjectionState };

export type RuntimeProjectionSnapshotState =
  | { readonly status: 'initializing' }
  | { readonly status: 'ready'; readonly snapshot: ProjectionSnapshot }
  | { readonly status: 'failed'; readonly failure: RuntimeProjectionFailure };

export type RuntimeProjectionCatalogState =
  | { readonly status: 'initializing' }
  | {
      readonly status: 'ready';
      readonly rows: readonly RuntimeProjectionCatalogRow[];
      readonly snapshot: ProjectionSnapshot;
    }
  | { readonly status: 'failed'; readonly failure: RuntimeProjectionFailure };

export type FilesystemTreeProjectionState =
  | { readonly status: 'initializing' }
  | {
      readonly status: 'ready';
      readonly filesystem: ProjectedFilesystem;
      readonly root: FilesystemNode;
    }
  | { readonly status: 'failed'; readonly failure: RuntimeProjectionFailure };

export function useRuntimeProjectionCatalog(runtime: RuntimeClient): RuntimeProjectionCatalogState {
  const projection = useRuntimeProjectionSnapshot(runtime, {
    projection: runtimeProjectionsProjection,
    schemaId: runtimeProjectionsSchemaId,
  });

  if (projection.status !== 'ready') return projection;

  return {
    status: 'ready',
    rows: relationRows<unknown>(
      projection.snapshot.relations,
      runtimeProjectionsRelation,
    ).filter(isRuntimeProjectionCatalogRow),
    snapshot: projection.snapshot,
  };
}

export function useRuntimeProjectionSnapshot(
  runtime: RuntimeClient,
  request: Pick<ProjectionSubscriptionRequest, 'projection' | 'schemaId'> | undefined,
): RuntimeProjectionSnapshotState {
  const [projection, setProjection] = useState<RuntimeProjectionSnapshotState>({ status: 'initializing' });

  useEffect(() => {
    if (request === undefined) {
      setProjection({ status: 'initializing' });
      return undefined;
    }
    setProjection({ status: 'initializing' });
    let subscription: ProjectionSubscription | undefined;
    try {
      subscription = runtime.subscribeProjection(
        {
          projection: request.projection,
          schemaId: request.schemaId,
          basis: { kind: 'live' },
        },
        (event) => {
          if (event.type !== 'patch') setProjection(snapshotFromProjectionEvent(event));
        },
      );
    } catch (error) {
      setProjection({ status: 'failed', failure: runtimeProjectionFailureFromUnknownError(error) });
    }
    return () => subscription?.close();
  }, [request?.projection, request?.schemaId, runtime]);

  return projection;
}

export function useFilesystemTreeProjection(
  runtime: RuntimeClient,
  rootUrl: string,
): FilesystemTreeProjectionState {
  const [projection, setProjection] = useState<FilesystemTreeProjectionState>({ status: 'initializing' });

  useEffect(() => {
    setProjection({ status: 'initializing' });
    let subscription: ProjectionSubscription | undefined;
    try {
      subscription = runtime.subscribeProjection(
        {
          projection: filesystemTreeProjection,
          schemaId: filesystemTreeSchemaId,
          basis: { kind: 'live' },
        },
        (event) => {
          if (event.type !== 'patch') setProjection(filesystemFromProjectionEvent(event, rootUrl));
        },
      );
    } catch (error) {
      setProjection({ status: 'failed', failure: runtimeProjectionFailureFromUnknownError(error) });
    }
    return () => subscription?.close();
  }, [rootUrl, runtime]);

  return projection;
}

export function useWorkspaceProjection(runtime: RuntimeClient): WorkspaceProjectionState {
  const [projection, setProjection] = useState<WorkspaceProjectionState>({ status: 'initializing' });

  useEffect(() => {
    setProjection({ status: 'initializing' });
    let subscription: ProjectionSubscription | undefined;
    try {
      subscription = runtime.subscribeProjection(
        {
          projection: workspaceLayoutProjection,
          schemaId: workspaceProjectionSchemaId,
          basis: { kind: 'live' },
        },
        (event) => {
          if (event.type !== 'patch') setProjection(workspaceProjectionFromProjectionEvent(event));
        },
      );
    } catch (error) {
      setProjection({
        status: 'failed',
        failure: runtimeProjectionFailureFromUnknownError(
          error,
          'Workspace projection subscription failed.',
        ),
      });
    }
    return () => subscription?.close();
  }, [runtime]);

  return projection;
}

function snapshotFromProjectionEvent(event: ProjectionEvent): RuntimeProjectionSnapshotState {
  if (event.type === 'error') {
    return { status: 'failed', failure: runtimeProjectionFailureFromRuntimeError(event.error) };
  }
  if (event.type === 'patch') return { status: 'initializing' };
  return { status: 'ready', snapshot: event.snapshot };
}

function filesystemFromProjectionEvent(
  event: ProjectionEvent,
  rootUrl: string,
): FilesystemTreeProjectionState {
  if (event.type === 'error') {
    return { status: 'failed', failure: runtimeProjectionFailureFromRuntimeError(event.error) };
  }
  if (event.type === 'patch') return { status: 'initializing' };
  return filesystemFromRelationSet(event.snapshot.relations, rootUrl);
}

function filesystemFromRelationSet(relations: RelationSet, rootUrl: string): FilesystemTreeProjectionState {
  const rows = relationRows<unknown>(relations, filesystemTreeNodesRelation);
  const filesystem = projectFilesystemTreeFromRows(rows, rootUrl);
  if (filesystem.root !== null) return { status: 'ready', filesystem, root: filesystem.root };

  return {
    status: 'failed',
    failure: {
      title: 'Filesystem projection unavailable',
      message: 'The filesystem tree projection did not include a usable root.',
      details: filesystem.diagnostics.map((diagnostic) => String(diagnostic)),
    },
  };
}

function workspaceProjectionFromProjectionEvent(event: ProjectionEvent): WorkspaceProjectionState {
  if (event.type === 'error') {
    return { status: 'failed', failure: runtimeProjectionFailureFromRuntimeError(event.error) };
  }
  if (event.type === 'patch') return { status: 'initializing' };
  return workspaceProjectionFromRelationSet(
    event.snapshot.relations,
    event.snapshot.schemaHash,
    event.snapshot.storageHeads,
  );
}

function isRuntimeProjectionCatalogRow(row: unknown): row is RuntimeProjectionCatalogRow {
  if (row === null || typeof row !== 'object') return false;
  const candidate = row as {
    readonly basisKinds?: unknown;
    readonly name?: unknown;
    readonly readOnly?: unknown;
    readonly schemaHash?: unknown;
    readonly schemaId?: unknown;
  };
  return typeof candidate.name === 'string'
    && typeof candidate.schemaId === 'string'
    && typeof candidate.schemaHash === 'string'
    && candidate.readOnly === true
    && Array.isArray(candidate.basisKinds)
    && candidate.basisKinds.every((kind) => typeof kind === 'string');
}
