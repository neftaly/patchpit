import {
  AttachmentCatalog,
  canonicalizeJson,
  createIncrementalDatabaseQueryMaintenance,
  DatabaseView,
  DatasetMembership,
  prepareManualReadOnlyAttachment,
  prepareQuery,
  relationLiteral,
  schemaLiteral,
  sealSchema,
  type Issue,
  type JsonValue,
  type QueryNode,
  type RelationInput,
  type SourceSnapshot,
} from '@tarstate/core';
import { openFsSubtree, type FsAttachment, type FsEntryRow } from '@patchpit/fs';

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
const contentsRelation = relationLiteral(contentSchema, contentSchemaBody, 'contents');
const contentsQuery: QueryNode = {
  kind: 'select',
  input: { kind: 'from', relation: contentsRelation, alias: 'content' },
  alias: 'content',
  fields: {
    resourceRef: { kind: 'field', alias: 'content', name: 'resourceRef' },
    contentType: { kind: 'field', alias: 'content', name: 'contentType' },
    byteLength: { kind: 'field', alias: 'content', name: 'byteLength' },
  },
};
const contentsPlan = await prepareQuery({
  root: contentsQuery,
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:app-contents:1',
  datasetId: 'patchpit:app:contents',
});
const maxAppFiles = 4_096;
const maxAppBytes = 256 * 1024 * 1024;

export const snapshotFilesystemApp = async (options: {
  readonly filesystem: FsAttachment;
  readonly rootEntryId: string;
  readonly read: AppFileContentReader;
  readonly signal?: AbortSignal;
}): Promise<AppSnapshotResult> => snapshotFilesystemAppAttempt(options, 2);

const snapshotFilesystemAppAttempt = async (
  options: {
    readonly filesystem: FsAttachment;
    readonly rootEntryId: string;
    readonly read: AppFileContentReader;
    readonly signal?: AbortSignal;
  },
  retries: number,
): Promise<AppSnapshotResult> => {
  const subtree = openFsSubtree(options.filesystem, options.rootEntryId);
  try {
    options.signal?.throwIfAborted();
    const subtreeSnapshot = subtree.observer.getSnapshot();
    if (subtreeSnapshot.state === 'closed') throw new Error('Filesystem subtree observation closed');
    const subtreeResult = subtreeSnapshot.current;
    const root = subtreeResult.rows.find(({ entryId, sourceId }) =>
      entryId === options.rootEntryId && sourceId === options.filesystem.sourceId);
    if (!launchable(subtreeResult)) {
      return unavailable(subtreeResult);
    }
    if (root?.kind !== 'folder') throw new Error('Filesystem app root is not an authorized folder');
    const entries = subtreeResult.rows.filter(({ entryId }) => entryId !== root.entryId);
    const files = entries.filter(({ kind }) => kind === 'file');
    if (files.length > maxAppFiles) throw new Error('Filesystem app has too many files');
    const subtreeBases = subtreeResult.basis.attachments;
    if (files.length === 0) return ready([], subtreeBases);

    const refs = [...new Set(files.map(({ resourceRef }) => resourceRef))];
    const reads = new Map<string, SourceSnapshot<AppFileContent> | undefined>();
    for (const resourceRef of refs) {
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
    if (totalBytes > maxAppBytes) throw new Error('Filesystem app is too large');
    const sourceRefs = new Map<string, string>();
    for (const [resourceRef, snapshot] of reads) {
      if (snapshot === undefined) continue;
      const existing = sourceRefs.get(snapshot.sourceId);
      if (existing !== undefined && existing !== resourceRef) {
        throw new Error(`App resource references share one source identity: ${existing}, ${resourceRef}`);
      }
      sourceRefs.set(snapshot.sourceId, resourceRef);
    }
    const contents = observeContents(refs, reads, `${options.filesystem.sourceId}:${root.entryId}`);
    const contentSnapshot = contents.observer.getSnapshot();
    contents.close();
    if (contentSnapshot.state === 'closed') throw new Error('App content observation closed');
    const latestSubtree = subtree.observer.getSnapshot();
    if (!sameOpenBasis(subtreeSnapshot, latestSubtree)) {
      if (retries === 0) throw new Error('Filesystem app changed while creating its snapshot');
      return snapshotFilesystemAppAttempt(options, retries - 1);
    }
    const contentResult = contentSnapshot.current;
    const sourceBases = Object.freeze([...subtreeBases, ...contentResult.basis.attachments]);
    if (!launchable(contentResult)) {
      return unavailable(contentResult, sourceBases);
    }

    const paths = appFilePaths(root, entries);
    return ready(files.map((file) => {
      const snapshot = reads.get(file.resourceRef);
      if (snapshot?.state !== 'ready' || snapshot.storage?.kind !== 'patchpit.file-content@1'
        || !(snapshot.storage.bytes instanceof Uint8Array)
        || (snapshot.storage.contentType !== undefined && typeof snapshot.storage.contentType !== 'string')) {
        throw new Error(`Ready app content is unavailable: ${file.resourceRef}`);
      }
      return {
        body: new Blob([Uint8Array.from(snapshot.storage.bytes)]),
        ...(snapshot.storage.contentType === undefined ? {} : { contentType: snapshot.storage.contentType }),
        path: paths.get(file.entryId)!,
      };
    }), sourceBases);
  } finally {
    subtree.close();
  }
};

const sameOpenBasis = (
  left: ReturnType<ReturnType<typeof openFsSubtree>['observer']['getSnapshot']>,
  right: ReturnType<ReturnType<typeof openFsSubtree>['observer']['getSnapshot']>,
) => left.state === 'open' && right.state === 'open'
  && canonicalizeJson(left.current.basis as unknown as JsonValue)
    === canonicalizeJson(right.current.basis as unknown as JsonValue);

const observeContents = (
  refs: readonly string[],
  reads: ReadonlyMap<string, SourceSnapshot<AppFileContent> | undefined>,
  authorityScope: string,
) => {
  const catalog = new AttachmentCatalog();
  const attachmentIds = new Map(refs.map((ref) => [ref, `patchpit:app-content:${ref}`]));
  const sources = new Map<string, ReturnType<typeof staticSource>>();
  const leases = refs.flatMap((resourceRef) => {
    const snapshot = reads.get(resourceRef);
    if (snapshot === undefined) return [];
    const source = sources.get(snapshot.sourceId) ?? staticSource(snapshot);
    sources.set(snapshot.sourceId, source);
    return [catalog.attach({
      attachmentId: attachmentIds.get(resourceRef)!,
      incarnation: `patchpit:app-content:${resourceRef}:1`,
      sourceId: source.sourceId,
      source,
      authorityScope,
      discoveryEdges: [],
      preparation: prepareManualReadOnlyAttachment<AppFileContent, readonly RelationInput[]>({
        schemaViewIds: [contentSchema.id],
        project: (current) => {
          if (current.state !== 'ready' || current.storage === undefined) {
            return { state: current.state === 'ready' ? 'failed' as const : current.state, issues: current.issues };
          }
          if (current.storage.kind !== 'patchpit.file-content@1'
            || !(current.storage.bytes instanceof Uint8Array)
            || current.sourceId !== resourceRef
            || (current.storage.contentType !== undefined && typeof current.storage.contentType !== 'string')) {
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
              attachmentId: attachmentIds.get(resourceRef)!,
              basis: current.basis,
            }],
            issues: current.issues,
          };
        },
      }),
    })];
  });
  const dataset = new DatasetMembership({
    datasetId: contentsPlan.datasetId,
    state: 'settled',
    members: refs.map((resourceRef) => {
      const snapshot = reads.get(resourceRef);
      return {
        attachmentId: attachmentIds.get(resourceRef)!,
        sourceId: snapshot?.sourceId ?? resourceRef,
        expectation: 'required' as const,
        discoveryEdges: [],
      };
    }),
  });
  const allowed = new Set(attachmentIds.values());
  const database = new DatabaseView({
    authorityScope,
    authorityFingerprint: contentsPlan.authorityFingerprint,
    registryFingerprint: contentsPlan.registryFingerprint,
    attachments: catalog,
    datasets: [dataset],
    canRead: (_viewScope, attachmentScope, attachmentId) =>
      attachmentScope === authorityScope && allowed.has(attachmentId),
    createQueryMaintenance: createIncrementalDatabaseQueryMaintenance(),
  });
  const observer = database.observe({ plan: contentsPlan });
  return {
    observer,
    close: () => {
      observer.close();
      database.close();
      leases.forEach(({ close }) => close());
    },
  };
};

const staticSource = (snapshot: SourceSnapshot<AppFileContent>) => ({
  sourceId: snapshot.sourceId,
  snapshot: () => snapshot,
  subscribe: () => () => undefined,
});

const appFilePaths = (root: FsEntryRow, entries: readonly FsEntryRow[]) => {
  const byId = new Map(entries.map((entry) => [entry.entryId, entry]));
  const paths = new Map<string, readonly string[]>();
  const resolving = new Set<string>();
  const pathFor = (entry: FsEntryRow): readonly string[] => {
    const known = paths.get(entry.entryId);
    if (known !== undefined) return known;
    if (resolving.has(entry.entryId)) throw new Error(`Filesystem parent cycle at: ${entry.entryId}`);
    resolving.add(entry.entryId);
    const parent = entry.parentId === null ? undefined : byId.get(entry.parentId);
    if (entry.parentId !== root.entryId && parent === undefined) {
      throw new Error(`Filesystem parent is outside the app subtree: ${entry.entryId}`);
    }
    const path = entry.parentId === root.entryId
      ? [entry.name]
      : [...pathFor(parent!), entry.name];
    resolving.delete(entry.entryId);
    paths.set(entry.entryId, Object.freeze(path));
    return path;
  };
  for (const entry of entries) pathFor(entry);
  const keys = entries.filter(({ kind }) => kind === 'file').map(({ entryId }) => JSON.stringify(pathFor(byId.get(entryId)!)));
  if (new Set(keys).size !== keys.length) throw new Error('Filesystem app paths are not unique');
  return paths;
};

const unavailable = (
  result: { readonly readiness: 'ready' | 'incomplete' | 'invalid'; readonly completeness: 'exact' | 'lower-bound' | 'unknown'; readonly freshness: 'current' | 'stale' | 'mixed' | 'none'; readonly issues: readonly Issue[]; readonly basis: { readonly attachments: ImmutableAppSnapshot['sourceBases'] } },
  sourceBases = result.basis.attachments,
): AppSnapshotResult => {
  return Object.freeze({
    state: result.readiness === 'ready' ? 'incomplete' : result.readiness,
    completeness: result.completeness,
    issues: result.issues,
    sourceBases,
  });
};

const launchable = (result: {
  readonly readiness: 'ready' | 'incomplete' | 'invalid';
  readonly completeness: 'exact' | 'lower-bound' | 'unknown';
  readonly freshness: 'current' | 'stale' | 'mixed' | 'none';
}) => result.readiness === 'ready' && result.completeness === 'exact' && result.freshness === 'current';

const ready = (
  files: ImmutableAppSnapshot['files'],
  sourceBases: ImmutableAppSnapshot['sourceBases'],
): ImmutableAppSnapshot => Object.freeze({
  state: 'ready',
  completeness: 'exact',
  files: Object.freeze(files.map((file) => Object.freeze(file))),
  sourceBases: Object.freeze(sourceBases),
});
