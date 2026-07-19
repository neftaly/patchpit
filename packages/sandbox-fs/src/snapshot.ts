import {
  createIssue,
  type Issue,
  type JsonValue,
} from '@tarstate/core';
import type { ObservedQueryResult } from '@tarstate/core/database';
import type { PreparedPlanRow } from '@tarstate/core/query';
import {
  openDatabaseQuery,
  type OpenLinkedDatabaseSource,
} from '@tarstate/core/database/session';
import { safeMaterializePortableBytes } from '@tarstate/core/values';
import {
  DEFAULT_FOLDER_DISCOVERY_BUDGET,
  type FolderDatabaseSource,
  type FolderLinkRow,
} from '@patchpit/fs';
import {
  APP_ENTRY_PATH,
  hasAppEntry,
  projectAppFiles,
} from './app-files.ts';
import { appSnapshotPlan, contentLinksPlan } from './query.ts';

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

const DEFAULT_APP_BYTE_LIMIT = 256 * 1024 * 1024;
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
): Promise<AppSnapshotResult> => {
  const observer = await openDatabaseQuery({
    sources: [{ source: options.root }],
    plan: appSnapshotPlan,
    queryAuthorityScope: APP_FILE_AUTHORITY_SCOPE,
    canRead: () => true,
    followSourceLinks: {
      budget: DEFAULT_FOLDER_DISCOVERY_BUDGET,
      plan: contentLinksPlan,
      openSource: options.openSource,
    },
  });
  try {
    options.signal?.throwIfAborted();
    const result = await observer.whenSettled(settleOptions(options.signal));
    if (!launchable(result)) return unavailable(result);
    const projected = materializeSnapshotRows(result.rows);
    const files = projectAppFiles(projected.links, options.rootFolderRef);
    const sourceBases = result.basis.attachments;
    if (!hasAppEntry(files)) return missingEntry(sourceBases);
    options.signal?.throwIfAborted();
    const totalBytes = files.reduce((total, { resource }) =>
      total + (projected.contents.get(resource.resourceRef)?.content.byteLength ?? 0), 0);
    if (totalBytes > (options.byteLimit ?? DEFAULT_APP_BYTE_LIMIT)) {
      throw new Error('Filesystem app is too large');
    }
    return ready(files.map(({ path, resource }) => {
      const resolved = projected.contents.get(resource.resourceRef);
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
    observer.close();
  }
};

type MaterializedContent = {
  readonly content: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
};

type MaterializedSnapshot = {
  readonly links: FolderLinkRow[];
  readonly contents: Map<string, MaterializedContent>;
};

type AppSnapshotRow = PreparedPlanRow<typeof appSnapshotPlan>;

const materializeSnapshotRows = (
  rows: readonly AppSnapshotRow[],
): MaterializedSnapshot => rows.reduce<MaterializedSnapshot>((projection, row) => {
  if (row.rowKind === 'link') {
    projection.links.push({
      ...(row.copyOf === undefined ? {} : { copyOf: row.copyOf }),
      ...(row.icon === undefined ? {} : { icon: row.icon }),
      linkId: row.linkId,
      name: row.name,
      ...(row.order === undefined ? {} : { order: row.order }),
      resourceRef: row.resourceRef,
      sourceId: row.sourceId,
      typeHint: row.typeHint,
    });
    return projection;
  }
  const { binaryContent, contentKind, mimeType, sourceId, textContent } = row;
  const content = contentKind === 'text' && typeof textContent === 'string'
    ? new TextEncoder().encode(textContent)
    : materializeBinaryContent(contentKind, binaryContent);
  if (content === undefined || projection.contents.has(sourceId)) {
    throw new TypeError('App file content projection is invalid');
  }
  projection.contents.set(sourceId, { content, mimeType });
  return projection;
}, {
  links: [],
  contents: new Map<string, MaterializedContent>(),
});

const materializeBinaryContent = (
  contentKind: AppSnapshotRow['contentKind'],
  content: AppSnapshotRow['binaryContent'],
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

const settleOptions = (signal: AbortSignal | undefined) => signal === undefined ? undefined : { signal };
