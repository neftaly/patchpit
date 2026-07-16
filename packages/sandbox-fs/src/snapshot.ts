import {
  canonicalizeJson,
  createIssue,
  type Issue,
  type JsonValue,
} from '@tarstate/core';
import type { AttachmentProjection } from '@tarstate/core/database';
import {
  openDatabaseQuery,
  type DatabaseQuerySource,
  type MountableDatabaseSource,
} from '@tarstate/core/database/session';
import { prepareManualReadOnlyAttachment } from '@tarstate/core/attachment/adapter';
import type { RelationInput } from '@tarstate/core/query';
import { prepareTypedQuery, typedFrom } from '@tarstate/core/query/authoring';
import { relationLiteral, schemaLiteral, sealSchema } from '@tarstate/core/schema';
import type { SourceSnapshot } from '@tarstate/core/source';
import { openFsSubtreeQuery, type FsDatabaseSource } from '@patchpit/fs';
import {
  APP_ENTRY_PATH,
  hasAppEntry,
  projectAppFilePaths,
  selectAppFiles,
} from './app-files.ts';

export type AppFileContent = {
  readonly bytes?: unknown;
  readonly contentType?: unknown;
  readonly kind?: unknown;
};

export type AppFileContentReader = (
  resourceRef: string,
  signal?: AbortSignal,
) => Promise<SourceSnapshot<AppFileContent>>;

export type ImmutableAppSnapshot = {
  readonly state: 'ready';
  readonly completeness: 'exact';
  readonly entry: readonly ['index.html'];
  readonly files: readonly {
    readonly body: Blob;
    readonly contentType?: string;
    readonly path: readonly string[];
  }[];
  readonly sourceBases: readonly {
    readonly attachmentId: string;
    readonly sourceId: string;
    readonly basis: JsonValue;
  }[];
};

export type AppSnapshotResult = ImmutableAppSnapshot | {
  readonly state: 'incomplete' | 'invalid';
  readonly completeness: 'exact' | 'lower-bound' | 'unknown';
  readonly issues: readonly Issue[];
  readonly sourceBases: ImmutableAppSnapshot['sourceBases'];
};

const contentSchemaBody = schemaLiteral({
  relations: {
    contents: {
      relationId: 'patchpit.app.file-content',
      key: ['resourceRef'],
      fields: {
        resourceRef: { type: { kind: 'string' } },
        contentType: { type: { kind: 'string' }, nullable: true },
        byteLength: { type: { kind: 'integer' } },
      },
    },
  },
});
const contentSchema = await sealSchema({
  id: 'urn:patchpit:schema:app-file-content@1',
  body: contentSchemaBody,
});
const contentsRelation = relationLiteral(contentSchema, 'contents');
const contentsPlan = await prepareTypedQuery(typedFrom(contentsRelation, 'content'), {
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:app-contents:1',
  datasetId: 'patchpit:app:contents',
});
const MAX_APP_BYTES = 256 * 1024 * 1024;
const MAX_SNAPSHOT_RETRIES = 2;

export const snapshotFilesystemApp = async (options: {
  readonly filesystem: FsDatabaseSource;
  readonly rootEntryId: string;
  readonly read: AppFileContentReader;
  readonly signal?: AbortSignal;
}): Promise<AppSnapshotResult> => snapshotFilesystemAppAttempt(options, MAX_SNAPSHOT_RETRIES);

const snapshotFilesystemAppAttempt = async (
  options: {
    readonly filesystem: FsDatabaseSource;
    readonly rootEntryId: string;
    readonly read: AppFileContentReader;
    readonly signal?: AbortSignal;
  },
  retries: number,
): Promise<AppSnapshotResult> => {
  const subtree = await openFsSubtreeQuery(options.filesystem, options.rootEntryId);
  try {
    options.signal?.throwIfAborted();
    const subtreeSnapshot = subtree.getSnapshot();
    if (subtreeSnapshot.state === 'closed') throw new Error('Filesystem subtree observation closed');
    const subtreeResult = subtreeSnapshot.current;
    if (!launchable(subtreeResult)) {
      return unavailable(subtreeResult);
    }
    const { entries, files, resourceRefs, root } = selectAppFiles(subtreeResult.rows, options.rootEntryId);
    const subtreeBases = subtreeResult.basis.attachments;
    if (files.length === 0) return missingEntry(subtreeBases);

    const reads = new Map<string, SourceSnapshot<AppFileContent> | undefined>();
    for (const resourceRef of resourceRefs) {
      options.signal?.throwIfAborted();
      const snapshot = resourceRef.startsWith('https:')
        ? undefined
        : await options.read(resourceRef, options.signal).catch(() => undefined);
      reads.set(resourceRef, snapshot);
    }
    const totalBytes = files.reduce((total, file) => {
      const bytes = reads.get(file.resourceRef)?.storage?.bytes;
      return total + (bytes instanceof Uint8Array ? bytes.byteLength : 0);
    }, 0);
    if (totalBytes > MAX_APP_BYTES) throw new Error('Filesystem app is too large');
    const sourceRefs = new Map<string, string>();
    for (const [resourceRef, snapshot] of reads) {
      if (snapshot === undefined) continue;
      const existing = sourceRefs.get(snapshot.sourceId);
      if (existing !== undefined && existing !== resourceRef) {
        throw new Error(`App resource references share one source identity: ${existing}, ${resourceRef}`);
      }
      sourceRefs.set(snapshot.sourceId, resourceRef);
    }
    const contentSnapshot = await snapshotContents(
      resourceRefs,
      reads,
      `${root.sourceId}:${root.entryId}`,
    );
    if (contentSnapshot.state === 'closed') throw new Error('App content observation closed');
    const latestSubtree = subtree.getSnapshot();
    if (!sameOpenBasis(subtreeSnapshot, latestSubtree)) {
      if (retries === 0) throw new Error('Filesystem app changed while creating its snapshot');
      return snapshotFilesystemAppAttempt(options, retries - 1);
    }
    const contentResult = contentSnapshot.current;
    const sourceBases = Object.freeze([...subtreeBases, ...contentResult.basis.attachments]);
    if (!launchable(contentResult)) {
      return unavailable(contentResult, sourceBases);
    }

    const paths = projectAppFilePaths(root, entries);
    if (!hasAppEntry(files, paths)) {
      return missingEntry(sourceBases);
    }
    return ready(files.map((file) => {
      const snapshot = reads.get(file.resourceRef);
      if (snapshot?.state !== 'ready' || snapshot.storage?.kind !== 'patchpit.file-content@1'
        || !(snapshot.storage.bytes instanceof Uint8Array)
        || !(snapshot.storage.bytes.buffer instanceof ArrayBuffer)
        || (snapshot.storage.contentType !== undefined && typeof snapshot.storage.contentType !== 'string')) {
        throw new Error(`Ready app content is unavailable: ${file.resourceRef}`);
      }
      const bytes = snapshot.storage.bytes as Uint8Array<ArrayBuffer>;
      return {
        body: new Blob([bytes]),
        ...(snapshot.storage.contentType === undefined ? {} : { contentType: snapshot.storage.contentType }),
        path: paths.get(file.entryId)!,
      };
    }), sourceBases);
  } finally {
    subtree.close();
  }
};

const sameOpenBasis = (
  left: ReturnType<Awaited<ReturnType<typeof openFsSubtreeQuery>>['getSnapshot']>,
  right: ReturnType<Awaited<ReturnType<typeof openFsSubtreeQuery>>['getSnapshot']>,
) => left.state === 'open' && right.state === 'open'
  && canonicalizeJson(left.current.basis as unknown as JsonValue)
    === canonicalizeJson(right.current.basis as unknown as JsonValue);

const snapshotContents = async (
  refs: readonly string[],
  reads: ReadonlyMap<string, SourceSnapshot<AppFileContent> | undefined>,
  authorityScope: string,
) => {
  const observer = await openDatabaseQuery({
    sources: refs.map((resourceRef): DatabaseQuerySource => {
      const snapshot = reads.get(resourceRef);
      return snapshot === undefined
        ? { unresolved: { attachmentId: contentAttachmentId(resourceRef), sourceId: resourceRef } }
        : { source: createContentDatabaseSource(resourceRef, snapshot, authorityScope) };
    }),
    plan: contentsPlan,
    queryAuthorityScope: authorityScope,
  });
  try {
    return observer.getSnapshot();
  } finally {
    observer.close();
  }
};

const createContentDatabaseSource = (
  resourceRef: string,
  snapshot: SourceSnapshot<AppFileContent>,
  authorityScope: string,
): MountableDatabaseSource => {
  const attachmentId = contentAttachmentId(resourceRef);
  const source = staticSource(snapshot);
  return {
    mount: (catalog, options) => {
      const discoveryEdges = options?.discoveryEdges ?? [];
      const lease = catalog.attach({
        attachmentId,
        incarnation: `${attachmentId}:1`,
        sourceId: source.sourceId,
        source,
        authorityScope,
        discoveryEdges,
        preparation: prepareManualReadOnlyAttachment<AppFileContent, readonly RelationInput[]>({
          schemaViewIds: [contentSchema.id],
          project: (current): AttachmentProjection<readonly RelationInput[]> => {
            if (current.state !== 'ready' || current.storage === undefined) {
              return {
                state: current.state === 'ready' ? 'failed' : current.state,
                issues: current.issues,
              };
            }
            if (current.storage.kind !== 'patchpit.file-content@1'
              || !(current.storage.bytes instanceof Uint8Array)
              || current.sourceId !== resourceRef
              || (current.storage.contentType !== undefined
                && typeof current.storage.contentType !== 'string')) {
              throw new TypeError('App file content is invalid');
            }
            return {
              state: 'ready',
              value: [{
                relation: contentsRelation,
                rows: [{
                  resourceRef,
                  contentType: current.storage.contentType ?? null,
                  byteLength: current.storage.bytes.byteLength,
                }],
                occurrenceIds: [resourceRef],
                completeness: 'exact',
                sourceId: source.sourceId,
                attachmentId,
                basis: current.basis,
              }],
              issues: current.issues,
            };
          },
        }),
      });
      return {
        attachmentId,
        sourceId: source.sourceId,
        discoveryEdges,
        close: () => lease.close(),
      };
    },
  };
};

const staticSource = (snapshot: SourceSnapshot<AppFileContent>) => ({
  sourceId: snapshot.sourceId,
  snapshot: () => snapshot,
  subscribe: () => () => undefined,
});

const contentAttachmentId = (resourceRef: string) => `patchpit:app-content:${resourceRef}`;

const unavailable = (
  result: { readonly readiness: 'ready' | 'incomplete' | 'invalid'; readonly completeness: 'exact' | 'lower-bound' | 'unknown'; readonly freshness: 'current' | 'stale' | 'mixed' | 'none'; readonly issues: readonly Issue[]; readonly basis: { readonly attachments: ImmutableAppSnapshot['sourceBases'] } },
  sourceBases = result.basis.attachments,
): AppSnapshotResult => {
  const state = result.readiness === 'ready'
    ? result.issues.some(({ severity }) => severity === 'error') ? 'invalid' : 'incomplete'
    : result.readiness;
  return Object.freeze({
    state,
    completeness: result.completeness,
    issues: result.issues,
    sourceBases,
  });
};

const launchable = (result: {
  readonly readiness: 'ready' | 'incomplete' | 'invalid';
  readonly completeness: 'exact' | 'lower-bound' | 'unknown';
  readonly freshness: 'current' | 'stale' | 'mixed' | 'none';
  readonly issues: readonly Issue[];
}) => result.readiness === 'ready'
  && result.completeness === 'exact'
  && result.freshness === 'current'
  && !result.issues.some(({ severity }) => severity === 'error');

const ready = (
  files: ImmutableAppSnapshot['files'],
  sourceBases: ImmutableAppSnapshot['sourceBases'],
): ImmutableAppSnapshot => Object.freeze({
  state: 'ready',
  completeness: 'exact',
  entry: APP_ENTRY_PATH,
  files: Object.freeze(files.map((file) => Object.freeze(file))),
  sourceBases: Object.freeze(sourceBases),
});

const missingEntry = (
  sourceBases: ImmutableAppSnapshot['sourceBases'],
): AppSnapshotResult => Object.freeze({
  state: 'invalid',
  completeness: 'exact',
  issues: [createIssue({
    code: 'patchpit.app.entry-missing',
    phase: 'parse',
    severity: 'error',
    details: { path: 'index.html' },
  })],
  sourceBases: Object.freeze(sourceBases),
});
