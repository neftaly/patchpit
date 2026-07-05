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
  type ProjectionEvent,
  type ProjectionSubscription,
  type RelationSet,
  type RuntimeClient,
  type RuntimeError,
} from '@patchpit/system/runtime';

export type RuntimeProjectionFailure = {
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
};

export type FilesystemTreeProjectionState =
  | { readonly status: 'initializing' }
  | {
      readonly status: 'ready';
      readonly filesystem: ProjectedFilesystem;
      readonly root: FilesystemNode;
    }
  | { readonly status: 'failed'; readonly failure: RuntimeProjectionFailure };

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
      setProjection({ status: 'failed', failure: failureFromUnknownError(error) });
    }
    return () => subscription?.close();
  }, [rootUrl, runtime]);

  return projection;
}

function filesystemFromProjectionEvent(
  event: ProjectionEvent,
  rootUrl: string,
): FilesystemTreeProjectionState {
  if (event.type === 'error') return { status: 'failed', failure: failureFromRuntimeError(event.error) };
  if (event.type === 'patch') return { status: 'initializing' };
  return filesystemFromRelationSet(event.snapshot.relations, rootUrl);
}

function filesystemFromRelationSet(relations: RelationSet, rootUrl: string): FilesystemTreeProjectionState {
  const rows = relations.relations[filesystemTreeNodesRelation] ?? [];
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

function failureFromRuntimeError(error: RuntimeError): RuntimeProjectionFailure {
  return {
    title: projectionFailureTitle(error),
    message: error.message,
    details: [
      `code: ${error.code}`,
      ...(error.reason === undefined ? [] : [`reason: ${error.reason}`]),
      ...metadataDetails(error.metadata),
    ],
  };
}

function failureFromUnknownError(error: unknown): RuntimeProjectionFailure {
  return {
    title: 'Projection unavailable',
    message: error instanceof Error ? error.message : 'Filesystem projection subscription failed.',
    details: detailFromUnknown(error),
  };
}

function projectionFailureTitle(error: RuntimeError): string {
  if (error.code === 'unknown_projection') return 'Projection unavailable';
  if (error.code === 'schema_mismatch') return 'Projection schema mismatch';
  if (error.code === 'unsupported_basis') return 'Projection basis unavailable';
  if (error.code === 'runtime_unavailable') return 'Runtime unavailable';
  if (error.code === 'policy_denied') return 'Projection denied by policy';
  if (error.code === 'policy_quarantined') return 'Projection quarantined by policy';
  return 'Filesystem projection unavailable';
}

function detailFromUnknown(value: unknown): readonly string[] {
  if (value === undefined || value instanceof Error) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return [String(value)];
  }
  try {
    const json = JSON.stringify(value);
    return json === undefined ? [] : [json];
  } catch {
    return [Object.prototype.toString.call(value)];
  }
}

function metadataDetails(metadata: RuntimeError['metadata']): readonly string[] {
  if (metadata === undefined) return [];
  return Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
}
