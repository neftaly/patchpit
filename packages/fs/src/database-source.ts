import type { Issue } from '@tarstate/core';
import { prepareManualReadOnlyAttachment } from '@tarstate/core/attachment/adapter';
import type { AttachmentProjection } from '@tarstate/core/database';
import {
  openDatabaseQuery,
  type DatabaseDiscoveryBudget,
  type DatabaseQuerySession,
  type MountableDatabaseSource,
  type OpenLinkedDatabaseSource,
} from '@tarstate/core/database/session';
import type { Completeness, RelationInput } from '@tarstate/core/query';
import type { ObservableSource, SourceSnapshot } from '@tarstate/core/source';
import {
  fileDocumentTitlePlan,
  folderDocumentTitlePlan,
  folderLinksPlan,
  nestedFolderSourceLinksPlan,
} from './queries.ts';
import {
  folderLinksRelation,
  folderRelation,
  folderSchemaArtifact,
  parseFolderLink,
  type Folder,
  type FolderLink,
} from './schema.ts';

export type FolderDocument = {
  readonly sourceId: string;
  readonly title: string;
  readonly links: readonly FolderLink[];
};

export type FolderLinkRow = FolderLink & { readonly sourceId: string };
export type FolderDatabaseSource = MountableDatabaseSource;
export type DocumentTitleRow = { readonly title: string };

type FolderStorage = {
  readonly title: string;
  readonly links: readonly FolderLink[];
};

type FolderProjectionRows = {
  readonly folder: Folder;
  readonly links: readonly FolderLink[];
  readonly occurrenceIds: readonly string[];
  readonly completeness: Completeness;
  readonly issues: readonly Issue[];
};

export const DEFAULT_FOLDER_DISCOVERY_BUDGET = {
  maxLinkedSources: 1_024,
  maxDiscoveryEdges: 4_096,
  maxDepth: 64,
  maxTraversalSteps: 16_384,
} as const satisfies DatabaseDiscoveryBudget;

export const createFolderDatabaseSource = <Storage>(options: {
  readonly authorityScope?: string;
  readonly source: ObservableSource<Storage>;
  readonly project: (snapshot: SourceSnapshot<Storage>) => FolderProjectionRows;
}): FolderDatabaseSource => {
  const { source } = options;
  const attachmentId = `patchpit:folder:${source.sourceId}`;
  return {
    mount: (catalog, mountOptions) => {
      const discoveryEdges = mountOptions?.discoveryEdges ?? [];
      const lease = catalog.attach({
        attachmentId,
        incarnation: `${attachmentId}:1`,
        sourceId: source.sourceId,
        source,
        authorityScope: options.authorityScope ?? 'public',
        discoveryEdges,
        preparation: prepareManualReadOnlyAttachment<Storage, readonly RelationInput[]>({
          schemaViewIds: [folderSchemaArtifact.id],
          project: (snapshot): AttachmentProjection<readonly RelationInput[]> => {
            if (snapshot.storage === undefined) {
              return { state: snapshot.state === 'ready' ? 'failed' : snapshot.state, issues: snapshot.issues };
            }
            const projection = options.project(snapshot);
            return {
              state: 'ready',
              value: [{
                relation: folderRelation,
                rows: [projection.folder],
                occurrenceIds: ['folder'],
                completeness: projection.completeness,
                sourceId: source.sourceId,
                attachmentId,
                basis: snapshot.basis,
              }, {
                relation: folderLinksRelation,
                rows: projection.links,
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

export const createStaticFolderDatabaseSource = (
  input: FolderDocument,
  authorityScope = 'public',
): FolderDatabaseSource => {
  const links = input.links.map(parseFolderLink);
  return createFolderDatabaseSource({
    authorityScope,
    source: staticSource(input.sourceId, input.title, links),
    project: () => ({
      folder: { id: 'folder', title: input.title },
      links,
      occurrenceIds: links.map(({ linkId }) => linkId),
      completeness: 'exact',
      issues: [],
    }),
  });
};

export const openFolderLinksQuery = (sources: readonly FolderDatabaseSource[]) => openDatabaseQuery({
  sources: sources.map((source) => ({ source })),
  plan: folderLinksPlan,
  queryAuthorityScope: 'public',
}) as Promise<DatabaseQuerySession<FolderLinkRow>>;

export const openFolderGraphQuery = (options: {
  readonly authorityScope?: string;
  readonly root: FolderDatabaseSource;
  readonly openSource: OpenLinkedDatabaseSource;
  readonly budget?: DatabaseDiscoveryBudget;
}) => openDatabaseQuery({
  sources: [{ source: options.root }],
  plan: folderLinksPlan,
  queryAuthorityScope: options.authorityScope ?? 'public',
  followSourceLinks: {
    plan: nestedFolderSourceLinksPlan,
    budget: options.budget ?? DEFAULT_FOLDER_DISCOVERY_BUDGET,
    openSource: options.openSource,
  },
}) as Promise<DatabaseQuerySession<FolderLinkRow>>;

export const openFolderDocumentTitleQuery = (source: MountableDatabaseSource) => openDatabaseQuery({
  sources: [{ source }],
  plan: folderDocumentTitlePlan,
  queryAuthorityScope: 'public',
});

export const openFileDocumentTitleQuery = (source: MountableDatabaseSource) => openDatabaseQuery({
  sources: [{ source }],
  plan: fileDocumentTitlePlan,
  queryAuthorityScope: 'public',
});

const staticSource = (sourceId: string, title: string, links: readonly FolderLink[]) => ({
  sourceId,
  snapshot: (): SourceSnapshot<FolderStorage> => ({
    sourceId,
    operationEpoch: `${sourceId}:operations:1`,
    basis: { incarnation: `${sourceId}:1`, revision: 0 },
    state: 'ready',
    freshness: 'current',
    storage: { title, links },
    issues: [],
  }),
  subscribe: () => () => undefined,
});
