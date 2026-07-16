import {
  AttachmentCatalog,
  DatabaseView,
  DatasetMembership,
  type AttachmentProjection,
  type QueryObserver,
} from '@tarstate/core/database';
import type { Issue } from '@tarstate/core';
import { createIncrementalDatabaseQueryMaintenance } from '@tarstate/core/database/incremental';
import { prepareManualReadOnlyAttachment } from '@tarstate/core/attachment/adapter';
import type {
  Completeness,
  PreparedPlanRow,
  PreparedPlan,
  QueryNode,
  QueryRecord,
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

export type FsAttachment = {
  readonly mount: (catalog: AttachmentCatalog) => {
    readonly attachmentId: string;
    readonly sourceId: string;
    readonly discoveryEdges: readonly string[];
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
}): FsAttachment => {
  const { source } = options;
  const attachmentId = `patchpit:fs:${source.sourceId}`;
  return {
    mount: (catalog) => {
      const lease = catalog.attach({
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
      });
      return {
        attachmentId,
        sourceId: source.sourceId,
        discoveryEdges: [],
        close: () => lease.close(),
      };
    },
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

export const openFsEntries = (inputs: readonly FsAttachment[]) => openFsQuery<PreparedPlanRow<typeof fsEntriesPlan>>(
  inputs,
  fsEntriesPlan,
  () => ({ authorityScope: 'public', canRead: () => true }),
);

export const openFsSubtree = (input: FsAttachment, rootEntryId: string) => openFsQuery<FsEntryRow>(
  [input],
  fsSubtreePlan,
  ([attachment]) => {
    if (attachment === undefined) throw new Error('Filesystem attachment is unavailable');
    return {
      authorityScope: `patchpit:fs-subtree:${attachment.attachmentId}:${rootEntryId}`,
      canRead: (_viewScope: string, _attachmentScope: string, attachmentId: string) =>
        attachmentId === attachment.attachmentId,
      parameters: { rootEntryId, rootSourceId: attachment.sourceId },
    };
  },
);

type FsMountLease = ReturnType<FsAttachment['mount']>;
type FsQueryConfiguration = {
  readonly authorityScope: string;
  readonly canRead: (viewAuthorityScope: string, attachmentAuthorityScope: string, attachmentId: string) => boolean;
  readonly parameters?: Readonly<Record<string, string>>;
};

const openFsQuery = <Row>(
  inputs: readonly FsAttachment[],
  plan: PreparedPlan<QueryNode>,
  configure: (attachments: readonly FsMountLease[]) => FsQueryConfiguration,
) => {
  const catalog = new AttachmentCatalog();
  const leases = inputs.map((input) => input.mount(catalog));
  const configuration = configure(leases);
  const dataset = new DatasetMembership({
    datasetId: plan.datasetId,
    state: 'settled',
    members: leases.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      sourceId: attachment.sourceId,
      expectation: 'required',
      discoveryEdges: attachment.discoveryEdges,
    })),
  });
  const database = new DatabaseView<QueryNode, QueryRecord, readonly RelationInput[]>({
    authorityScope: configuration.authorityScope,
    authorityFingerprint: plan.authorityFingerprint,
    registryFingerprint: plan.registryFingerprint,
    attachments: catalog,
    datasets: [dataset],
    canRead: configuration.canRead,
    createQueryMaintenance: createIncrementalDatabaseQueryMaintenance(),
  });
  const observer = database.observe({
    plan,
    ...(configuration.parameters === undefined ? {} : { parameters: configuration.parameters }),
  }) as unknown as QueryObserver<Row>;

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
