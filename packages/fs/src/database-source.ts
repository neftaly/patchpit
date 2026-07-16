import {
  type AttachmentProjection,
} from '@tarstate/core/database';
import type { Issue } from '@tarstate/core';
import {
  openDatabaseQuery,
  type DatabaseQuerySession,
  type MountableDatabaseSource,
} from '@tarstate/core/database/session';
import { prepareManualReadOnlyAttachment } from '@tarstate/core/attachment/adapter';
import type {
  Completeness,
  RelationInput,
} from '@tarstate/core/query';
import type { ObservableSource, SourceSnapshot } from '@tarstate/core/source';
import { fsEntriesPlan, fsSubtreePlan } from './queries.ts';
import { fsEntriesRelation, fsSchemaArtifact, parseFsEntries, type FsEntry } from './schema.ts';

export type FsDocument = {
  readonly sourceId: string;
  readonly entries: readonly FsEntry[];
};

export type FsEntryRow = FsEntry & { readonly sourceId: string };

type FsStorage = { readonly entries: readonly FsEntry[] };

export type FsDatabaseSource = MountableDatabaseSource;

type FsProjectionRows = {
  readonly entries: readonly FsEntry[];
  readonly occurrenceIds: readonly string[];
  readonly completeness: Completeness;
  readonly issues: readonly Issue[];
};

export const createFsDatabaseSource = <Storage>(options: {
  readonly source: ObservableSource<Storage>;
  readonly project: (snapshot: SourceSnapshot<Storage>) => FsProjectionRows;
}): FsDatabaseSource => {
  const { source } = options;
  const attachmentId = `patchpit:fs:${source.sourceId}`;
  return {
    mount: (catalog, mountOptions) => {
      const discoveryEdges = mountOptions?.discoveryEdges ?? [];
      const lease = catalog.attach({
        attachmentId,
        incarnation: `${attachmentId}:1`,
        sourceId: source.sourceId,
        source,
        authorityScope: 'public',
        discoveryEdges,
        preparation: prepareManualReadOnlyAttachment<Storage, readonly RelationInput[]>({
          schemaViewIds: [fsSchemaArtifact.id],
          project: (snapshot): AttachmentProjection<readonly RelationInput[]> => {
            if (snapshot.storage === undefined) {
              return { state: snapshot.state === 'ready' ? 'failed' : snapshot.state, issues: snapshot.issues };
            }
            const projection = options.project(snapshot);
            return {
              state: 'ready',
              value: [{
                relation: fsEntriesRelation,
                rows: projection.entries,
                occurrenceIds: projection.occurrenceIds,
                completeness: projection.completeness,
                sourceId: source.sourceId,
                attachmentId,
                basis: snapshot.basis,
              }],
              issues: projection.issues,
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

export const createStaticFsDatabaseSource = (input: FsDocument): FsDatabaseSource => {
  const entries = parseFsEntries(input.entries);
  return createFsDatabaseSource({
    source: staticSource(input.sourceId, entries),
    project: () => ({
      entries,
      occurrenceIds: entries.map(({ entryId }) => entryId),
      completeness: 'exact',
      issues: [],
    }),
  });
};

export const openFsEntriesQuery = (sources: readonly FsDatabaseSource[]) => openDatabaseQuery({
  sources: sources.map((source) => ({ source })),
  plan: fsEntriesPlan,
  queryAuthorityScope: 'public',
});

export const openFsSubtreeQuery = (source: FsDatabaseSource, rootEntryId: string) =>
  openDatabaseQuery({
    sources: [{ source }],
    plan: fsSubtreePlan,
    queryAuthorityScope: `patchpit:fs-subtree:${rootEntryId}`,
    canRead: () => true,
    parameters: { rootEntryId },
  }) as Promise<DatabaseQuerySession<FsEntryRow>>;

const staticSource = (sourceId: string, entries: readonly FsEntry[]) => ({
  sourceId,
  snapshot: (): SourceSnapshot<FsStorage> => ({
    sourceId,
    operationEpoch: `${sourceId}:operations:1`,
    basis: { incarnation: `${sourceId}:1`, revision: 0 },
    state: 'ready',
    freshness: 'current',
    storage: { entries },
    issues: [],
  }),
  subscribe: () => () => undefined,
});
