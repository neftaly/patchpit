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
  type PreparedPlan,
  type QueryNode,
  type QueryObserver,
  type QueryRecord,
  type RelationInput,
  type SourceSnapshot,
} from '@tarstate/core';
import { fsEntriesPlan, fsSubtreePlan } from './queries.ts';
import { fsEntriesRelation, fsSchemaArtifact, parseFsEntries, type FsEntry } from './schema.ts';

export type FsDocument = {
  readonly sourceId: string;
  readonly entries: readonly FsEntry[];
};

export type FsEntryRow = FsEntry & { readonly sourceId: string };

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
  let attachmentLeases = 0;
  return {
    attachmentId,
    sourceId: source.sourceId,
    attach: (catalog) => {
      attachmentLeases += 1;
      try {
        return catalog.attach({
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
        }, () => {
          attachmentLeases -= 1;
          if (attachmentLeases === 0) options.close?.();
        });
      } catch (error) {
        attachmentLeases -= 1;
        throw error;
      }
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
  'public',
  () => true,
);

export const openFsSubtree = (input: FsAttachment, rootEntryId: string) => openFsQuery<FsEntryRow>(
  [input],
  fsSubtreePlan,
  `patchpit:fs-subtree:${input.sourceId}:${rootEntryId}`,
  (_viewScope, _attachmentScope, attachmentId) => attachmentId === input.attachmentId,
  { rootEntryId, rootSourceId: input.sourceId },
);

const openFsQuery = <Row>(
  inputs: readonly FsAttachment[],
  plan: PreparedPlan<QueryNode>,
  authorityScope: string,
  canRead: (viewAuthorityScope: string, attachmentAuthorityScope: string, attachmentId: string) => boolean,
  parameters?: Readonly<Record<string, string>>,
) => {
  const catalog = new AttachmentCatalog();
  const leases = inputs.map((input) => input.attach(catalog));
  const dataset = new DatasetMembership({
    datasetId: plan.datasetId,
    state: 'settled',
    members: leases.map(({ attachment }) => ({
      attachmentId: attachment.attachmentId,
      sourceId: attachment.sourceId,
      expectation: 'required',
      discoveryEdges: [],
    })),
  });
  const database = new DatabaseView<QueryNode, QueryRecord, readonly RelationInput[]>({
    authorityScope,
    authorityFingerprint: plan.authorityFingerprint,
    registryFingerprint: plan.registryFingerprint,
    attachments: catalog,
    datasets: [dataset],
    canRead,
    createQueryMaintenance: createIncrementalDatabaseQueryMaintenance(),
  });
  const observer = database.observe({
    plan,
    ...(parameters === undefined ? {} : { parameters }),
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
