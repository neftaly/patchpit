import {
  canonicalizeJson,
  createIssue,
  type Issue,
  type JsonValue,
} from '@tarstate/core';
import type { ObservedQueryResult } from '@tarstate/core/database';
import {
  openDatabaseQuery,
  type OpenLinkedDatabaseSource,
} from '@tarstate/core/database/session';
import { safeMaterializePortableBytes } from '@tarstate/core/values';
import { prepareTypedQuery } from '@tarstate/core/query';
import {
  typedFrom,
  typedOrderBy,
  typedSelect,
  typedSourceOf,
} from '@tarstate/core/query/authoring';
import {
  DEFAULT_FOLDER_DISCOVERY_BUDGET,
  fileRelation,
  folderLinksRelation,
  openFolderGraphQuery,
  type FolderDatabaseSource,
} from '@patchpit/fs';
import {
  APP_ENTRY_PATH,
  hasAppEntry,
  projectAppFiles,
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
const files = typedFrom(fileRelation, 'file');
const content = typedSelect(files, 'content', ({ file }) => ({
  binaryContent: file.row.binaryContent,
  contentKind: file.row.contentKind,
  mimeType: file.row.mimeType,
  resourceRef: typedSourceOf(file),
  textContent: file.row.textContent,
}));
const contentQuery = typedOrderBy(content, ({ content: row }) => [{
  value: row.row.resourceRef,
  direction: 'asc',
}]);
const links = typedFrom(folderLinksRelation, 'link');
const contentLinksQuery = typedSelect(links, 'sourceLink', ({ link }) => ({
  linkId: link.row.linkId,
  originSourceId: typedSourceOf(link),
  targetSourceId: link.row.resourceRef,
}));
const contentsPlan = await prepareTypedQuery(contentQuery, QUERY_IDENTITY);
const contentLinksPlan = await prepareTypedQuery(contentLinksQuery, QUERY_IDENTITY);
const DEFAULT_APP_BYTE_LIMIT = 256 * 1024 * 1024;
const MAX_SNAPSHOT_RETRIES = 2;
export const APP_FILE_AUTHORITY_SCOPE = 'patchpit.app-file';

type SnapshotOptions = {
  readonly byteLimit?: number;
  readonly root: FolderDatabaseSource;
  readonly rootFolderRef: string;
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
  const graph = await openFolderGraphQuery({
    authorityScope: APP_FILE_AUTHORITY_SCOPE,
    root: options.root,
    openSource: options.openSource,
  });
  try {
    options.signal?.throwIfAborted();
    const graphResult = await graph.whenSettled(settleOptions(options.signal));
    if (!launchable(graphResult)) return unavailable(graphResult);
    const files = projectAppFiles(graphResult.rows, options.rootFolderRef);
    if (!hasAppEntry(files)) return missingEntry(graphResult.basis.attachments);

    const contentResult = await snapshotContents(options);
    const latestGraph = graph.getSnapshot();
    if (latestGraph.state !== 'open' || !sameBasis(graphResult.basis, latestGraph.current.basis)) {
      if (retries === 0) throw new Error('Filesystem app changed while creating its snapshot');
      return snapshotFilesystemAppAttempt(options, retries - 1);
    }
    const sourceBases = contentResult.basis.attachments;
    if (!launchable(contentResult)) return unavailable(contentResult, sourceBases);

    options.signal?.throwIfAborted();
    const contents = materializeContentRows(contentResult.rows);
    const totalBytes = files.reduce((total, { resource }) =>
      total + (contents.get(resource.resourceRef)?.content.byteLength ?? 0), 0);
    if (totalBytes > (options.byteLimit ?? DEFAULT_APP_BYTE_LIMIT)) {
      throw new Error('Filesystem app is too large');
    }
    return ready(files.map(({ path, resource }) => {
      const resolved = contents.get(resource.resourceRef);
      if (resolved === undefined) {
        throw new Error(`Ready app content is unavailable: ${resource.resourceRef}`);
      }
      return {
        body: new Blob([resolved.content]),
        contentType: resolved.mimeType,
        path,
      };
    }), sourceBases);
  } finally {
    graph.close();
  }
};

const snapshotContents = async (options: SnapshotOptions) => {
  const observer = await openDatabaseQuery({
    sources: [{ source: options.root }],
    plan: contentsPlan,
    queryAuthorityScope: APP_FILE_AUTHORITY_SCOPE,
    canRead: () => true,
    followSourceLinks: {
      budget: DEFAULT_FOLDER_DISCOVERY_BUDGET,
      plan: contentLinksPlan,
      openSource: options.openSource,
    },
  });
  try {
    return await observer.whenSettled(settleOptions(options.signal));
  } finally {
    observer.close();
  }
};

type MaterializedContent = {
  readonly content: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
};

const materializeContentRows = (
  rows: readonly Readonly<Record<string, unknown>>[],
): ReadonlyMap<string, MaterializedContent> => rows.reduce((contents, row) => {
  const { binaryContent, contentKind, mimeType, resourceRef, textContent } = row;
  if (typeof mimeType !== 'string' || typeof resourceRef !== 'string') {
    throw new TypeError('App file content projection is invalid');
  }
  const bytes = contentKind === 'text' && typeof textContent === 'string'
    ? new TextEncoder().encode(textContent)
    : materializeBinaryContent(contentKind, binaryContent);
  if (bytes === undefined || contents.has(resourceRef)) {
    throw new TypeError('App file content projection is invalid');
  }
  contents.set(resourceRef, { content: bytes, mimeType });
  return contents;
}, new Map<string, MaterializedContent>());

const materializeBinaryContent = (
  contentKind: unknown,
  content: unknown,
): Uint8Array<ArrayBuffer> | undefined => {
  if (contentKind !== 'binary') return undefined;
  const materialized = safeMaterializePortableBytes(content);
  return materialized.success ? materialized.value : undefined;
};

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

const sameBasis = (left: JsonValue, right: JsonValue) =>
  canonicalizeJson(left) === canonicalizeJson(right);
const settleOptions = (signal: AbortSignal | undefined) => signal === undefined ? undefined : { signal };
