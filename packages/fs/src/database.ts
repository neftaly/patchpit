import {
  AttachmentCatalog,
  createIncrementalDatabaseQueryMaintenance,
  DatabaseView,
  DatasetMembership,
  prepareManualReadOnlyAttachment,
  type AttachmentProjection,
  type Completeness,
  type Issue,
  type ObservableSource,
  type PreparedPlanRow,
  type QueryNode,
  type QueryObserver,
  type QueryRecord,
  type RelationInput,
  type SourceSnapshot,
} from '@tarstate/core';
import { fsEntriesPlan } from './queries.ts';
import { fsEntriesRelation, fsSchemaArtifact, parseFsEntries, type FsEntry } from './schema.ts';

export type FsDocument = {
  readonly sourceId: string;
  readonly entries: readonly FsEntry[];
};

type FsStorage = { readonly entries: readonly FsEntry[] };

export type FsAttachment = {
  readonly attachmentId: string;
  readonly sourceId: string;
  readonly attach: (catalog: AttachmentCatalog) => {
    readonly attachment: { readonly attachmentId: string; readonly sourceId: string };
    readonly close: () => void;
  };
};

type FsRows = {
  readonly entries: readonly FsEntry[];
  readonly occurrenceIds: readonly string[];
  readonly completeness: Completeness;
  readonly issues: readonly Issue[];
};

export const createFsAttachment = <Storage>(options: {
  readonly source: ObservableSource<Storage>;
  readonly project: (snapshot: SourceSnapshot<Storage>) => FsRows;
  readonly close?: () => void;
}): FsAttachment => {
  const { source } = options;
  const attachmentId = `patchpit:fs:${source.sourceId}`;
  return {
    attachmentId,
    sourceId: source.sourceId,
    attach: (catalog) => catalog.attach({
      attachmentId,
      incarnation: `${attachmentId}:1`,
      sourceId: source.sourceId,
      source,
      authorityScope: 'public',
      discoveryEdges: [],
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
    }, options.close),
  };
};

export const staticFsAttachment = (input: FsDocument): FsAttachment => {
  const entries = parseFsEntries(input.entries);
  return createFsAttachment({
    source: staticSource(input.sourceId, entries),
    project: () => ({
      entries,
      occurrenceIds: entries.map(({ entryId }) => entryId),
      completeness: 'exact',
      issues: [],
    }),
  });
};

export const openFsEntries = (inputs: readonly FsAttachment[]) => {
  const catalog = new AttachmentCatalog();
  const leases = inputs.map((input) => input.attach(catalog));
  const dataset = new DatasetMembership({
    datasetId: fsEntriesPlan.datasetId,
    state: 'settled',
    members: leases.map(({ attachment }) => ({
      attachmentId: attachment.attachmentId,
      sourceId: attachment.sourceId,
      expectation: 'required',
      discoveryEdges: [],
    })),
  });
  const database = new DatabaseView<QueryNode, QueryRecord, readonly RelationInput[]>({
    authorityScope: 'public',
    authorityFingerprint: fsEntriesPlan.authorityFingerprint,
    registryFingerprint: fsEntriesPlan.registryFingerprint,
    attachments: catalog,
    datasets: [dataset],
    canRead: () => true,
    createQueryMaintenance: createIncrementalDatabaseQueryMaintenance(),
  });
  const observer = database.observe({ plan: fsEntriesPlan }) as QueryObserver<PreparedPlanRow<typeof fsEntriesPlan>>;

  return {
    observer,
    close: () => {
      observer.close();
      database.close();
      leases.forEach(({ close }) => close());
    },
  };
};

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
