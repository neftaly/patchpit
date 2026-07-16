import {
  canonicalizeJson,
  createIssue,
  type Issue,
  type JsonValue,
} from '@tarstate/core';
import type { ObservedQueryResult, QueryObserver } from '@tarstate/core/database';
import {
  openDatabaseQuery,
  type OpenLinkedDatabaseSource,
} from '@tarstate/core/database/session';
import { prepareQuery } from '@tarstate/core/query';
import {
  compare,
  field,
  from,
  literal,
  orderBy,
  pipe,
  select,
  sourceOf,
  where,
} from '@tarstate/core/query/authoring';
import {
  decodeBinaryFileContent,
  fileRelation,
  fsSubtreeQuery,
  openFsSubtreeQuery,
  type BinaryFileContent,
  type FsDatabaseSource,
} from '@patchpit/fs';
import {
  APP_ENTRY_PATH,
  hasAppEntry,
  projectAppFilePaths,
  selectAppFiles,
} from './app-files.ts';

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

const QUERY_IDENTITY = {
  registryFingerprint: 'patchpit:registry:1',
  authorityFingerprint: 'patchpit:authority:app-contents:1',
  datasetId: 'patchpit:app:contents',
} as const;
const contentQuery = pipe(
  from(fileRelation, 'file'),
  select('content', {
    binaryContent: field('file', 'binaryContent'),
    contentKind: field('file', 'contentKind'),
    mimeType: field('file', 'mimeType'),
    resourceRef: sourceOf('file'),
    textContent: field('file', 'textContent'),
  }),
  orderBy([{ value: field('content', 'resourceRef'), direction: 'asc' }]),
);
const contentLinksQuery = pipe(
  fsSubtreeQuery,
  where(compare('eq', field('selected', 'kind'), literal('file'))),
  select('link', {
    linkId: field('selected', 'entryId'),
    originSourceId: field('selected', 'sourceId'),
    targetSourceId: field('selected', 'resourceRef'),
  }),
);
const contentsPlan = await prepareQuery({ root: contentQuery, ...QUERY_IDENTITY });
const contentLinksPlan = await prepareQuery({ root: contentLinksQuery, ...QUERY_IDENTITY });
const DEFAULT_APP_BYTE_LIMIT = 256 * 1024 * 1024;
const MAX_SNAPSHOT_RETRIES = 2;
const MEMBERSHIP_OPEN_ISSUE_CODE = 'observer.membership_open';
export const APP_FILE_AUTHORITY_SCOPE = 'patchpit.app-file';

type SnapshotOptions = {
  readonly byteLimit?: number;
  readonly filesystem: FsDatabaseSource;
  readonly rootEntryId: string;
  readonly openSource: OpenLinkedDatabaseSource;
  readonly signal?: AbortSignal;
};

export const snapshotFilesystemApp = async (
  options: SnapshotOptions,
): Promise<AppSnapshotResult> => snapshotFilesystemAppAttempt(options, MAX_SNAPSHOT_RETRIES);

const snapshotFilesystemAppAttempt = async (
  options: SnapshotOptions,
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
    const { entries, files, root } = selectAppFiles(subtreeResult.rows, options.rootEntryId);
    const subtreeBases = subtreeResult.basis.attachments;
    const paths = projectAppFilePaths(root, entries);
    if (!hasAppEntry(files, paths)) return missingEntry(subtreeBases);

    const contentSnapshot = await snapshotContents(options);
    if (contentSnapshot.state === 'closed') throw new Error('App content observation closed');
    const latestSubtree = subtree.getSnapshot();
    if (!sameOpenBasis(subtreeSnapshot, latestSubtree)) {
      if (retries === 0) throw new Error('Filesystem app changed while creating its snapshot');
      return snapshotFilesystemAppAttempt(options, retries - 1);
    }
    const contentResult = contentSnapshot.current;
    const sourceBases = contentResult.basis.attachments;
    if (!launchable(contentResult)) {
      return unavailable(contentResult, sourceBases);
    }

    options.signal?.throwIfAborted();
    const contents = materializeContentRows(contentResult.rows);
    const totalBytes = files.reduce((total, file) =>
      total + (contents.get(file.resourceRef)?.content.byteLength ?? 0), 0);
    if (totalBytes > (options.byteLimit ?? DEFAULT_APP_BYTE_LIMIT)) {
      throw new Error('Filesystem app is too large');
    }
    return ready(files.map((file) => {
      const resolved = contents.get(file.resourceRef);
      if (resolved === undefined) {
        throw new Error(`Ready app content is unavailable: ${file.resourceRef}`);
      }
      return {
        body: new Blob([resolved.content]),
        contentType: resolved.mimeType,
        path: requiredPath(paths, file.entryId),
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

const snapshotContents = async (options: SnapshotOptions) => {
  const observer = await openDatabaseQuery({
    sources: [{ source: options.filesystem }],
    plan: contentsPlan,
    queryAuthorityScope: APP_FILE_AUTHORITY_SCOPE,
    canRead: () => true,
    followSourceLinks: {
      plan: contentLinksPlan,
      parameters: { rootEntryId: options.rootEntryId },
      openSource: options.openSource,
    },
  });
  try {
    return await settledSnapshot(observer, options.signal);
  } finally {
    observer.close();
  }
};

const settledSnapshot = async <Row>(
  observer: QueryObserver<Row>,
  signal?: AbortSignal,
): Promise<ReturnType<QueryObserver<Row>['getSnapshot']>> => {
  const current = observer.getSnapshot();
  if (membershipSettled(current)) return current;
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    const finish = (snapshot: ReturnType<QueryObserver<Row>['getSnapshot']>) => {
      unsubscribe();
      signal?.removeEventListener('abort', aborted);
      resolve(snapshot);
    };
    const changed = () => {
      const snapshot = observer.getSnapshot();
      if (membershipSettled(snapshot)) finish(snapshot);
    };
    const aborted = () => {
      unsubscribe();
      reject(signal?.reason);
    };
    unsubscribe = observer.subscribe(changed);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted === true) aborted();
    else changed();
  });
};

const membershipSettled = <Row>(snapshot: ReturnType<QueryObserver<Row>['getSnapshot']>) =>
  snapshot.state === 'closed'
  || !snapshot.current.issues.some(({ code }) => code === MEMBERSHIP_OPEN_ISSUE_CODE);

type MaterializedContent = {
  readonly content: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
};

const materializeContentRows = (
  rows: readonly Readonly<Record<string, unknown>>[],
): ReadonlyMap<string, MaterializedContent> => {
  const contents = new Map<string, MaterializedContent>();
  for (const row of rows) {
    const { binaryContent, contentKind, mimeType, resourceRef, textContent } = row;
    if (typeof mimeType !== 'string' || typeof resourceRef !== 'string') {
      throw new TypeError('App file content projection is invalid');
    }
    const bytes = contentKind === 'text' && typeof textContent === 'string'
      ? new TextEncoder().encode(textContent)
      : contentKind === 'binary' && isBinaryContent(binaryContent)
        ? decodeBinaryFileContent(binaryContent)
        : undefined;
    if (bytes === undefined || contents.has(resourceRef)) {
      throw new TypeError('App file content projection is invalid');
    }
    contents.set(resourceRef, { content: bytes, mimeType });
  }
  return contents;
};

const isBinaryContent = (input: unknown): input is BinaryFileContent =>
  input !== null
  && typeof input === 'object'
  && !Array.isArray(input)
  && 'kind' in input && input.kind === 'tarstate.value'
  && 'type' in input && input.type === 'bytes'
  && 'value' in input && typeof input.value === 'string';

const unavailable = (
  result: ObservedQueryResult<unknown>,
  sourceBases = result.basis.attachments,
): AppSnapshotResult => {
  const requiredSourcesAvailable = result.sourceStates.every(({ expectation, state }) =>
    expectation === 'optional' || state === 'ready');
  const state = result.readiness === 'invalid'
    || result.issues.some(({ retry }) => retry === 'manual_repair')
    || (result.readiness === 'incomplete'
      && result.freshness === 'current'
      && requiredSourcesAvailable)
    || (result.readiness === 'ready'
      && result.issues.some(({ severity }) => severity === 'error'))
    ? 'invalid'
    : 'incomplete';
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

const requiredPath = (paths: ReadonlyMap<string, readonly string[]>, entryId: string) => {
  const path = paths.get(entryId);
  if (path === undefined) throw new Error(`Filesystem app path is unavailable: ${entryId}`);
  return path;
};

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
