import type { FolderLinkRow } from '@patchpit/fs';
import type { DatabaseQuerySession } from '@tarstate/core/database/session';

export const resourceIdentity = ({ linkId, sourceId }: Pick<FolderLinkRow, 'linkId' | 'sourceId'>) =>
  JSON.stringify([sourceId, linkId]);

export type ResourceProjection = {
  readonly rows: readonly ResourceTreeRow[];
  readonly byIdentity: ReadonlyMap<string, FolderLinkRow>;
  readonly byResourceRef: ReadonlyMap<string, FolderLinkRow>;
  readonly graphState: ResourceGraphState;
  readonly launchableFolders: ReadonlySet<string>;
  readonly sourceProblems: readonly ResourceSourceProblem[];
};

export type ResourceGraphState = 'ready' | 'incomplete' | 'invalid' | 'stale' | 'closed';

type OpenResourceSnapshot = Extract<ResourceSnapshot, { readonly state: 'open' }>;
type ResourceSourceEvidence = OpenResourceSnapshot['current']['sourceStates'][number];

export type ResourceSourceProblem = Pick<
  ResourceSourceEvidence,
  'attachmentId' | 'authorized' | 'freshness' | 'sourceId' | 'state'
> & { readonly issueCodes: readonly string[] };

type ResourceTreeRow = {
  readonly depth: number;
  readonly folderTraversal?: 'already-expanded' | 'cycle';
  readonly resource: FolderLinkRow;
};

type ResourceSnapshot = ReturnType<DatabaseQuerySession<FolderLinkRow>['getSnapshot']>;

export const resourceRowsFromQuerySnapshot = (snapshot: ResourceSnapshot): readonly FolderLinkRow[] =>
  snapshot.state === 'closed' ? [] : snapshot.current.rows;

export const resourceGraphStateFromQuerySnapshot = (snapshot: ResourceSnapshot): ResourceGraphState => {
  if (snapshot.state === 'closed') return 'closed';
  const { completeness, freshness, readiness } = snapshot.current;
  if (readiness === 'invalid') return 'invalid';
  if (readiness !== 'ready' || completeness !== 'exact') return 'incomplete';
  return freshness === 'current' ? 'ready' : 'stale';
};

export const resourceSourceProblemsFromQuerySnapshot = (
  snapshot: ResourceSnapshot,
): readonly ResourceSourceProblem[] => snapshot.state === 'closed' ? [] : snapshot.current.sourceStates.flatMap((source) => {
  const issueCodes = source.issues
    .filter(({ severity }) => severity === 'error')
    .map(({ code }) => code);
  return source.authorized && source.state === 'ready' && source.freshness === 'current' && issueCodes.length === 0
    ? []
    : [{
        attachmentId: source.attachmentId,
        authorized: source.authorized,
        freshness: source.freshness,
        issueCodes,
        sourceId: source.sourceId,
        state: source.state,
      }];
});

export const projectResourceTree = (
  resources: readonly FolderLinkRow[],
  rootSourceId?: string,
  options: {
    readonly graphState?: ResourceGraphState;
    readonly sourceProblems?: readonly ResourceSourceProblem[];
  } = {},
): ResourceProjection => {
  const byIdentity = new Map(resources.map((resource) => [resourceIdentity(resource), resource]));
  const byFolder = resources.reduce((folders, resource) => {
    folders.set(resource.sourceId, [...folders.get(resource.sourceId) ?? [], resource]);
    return folders;
  }, new Map<string, FolderLinkRow[]>());
  const rows: ResourceTreeRow[] = [];
  const expandedFolders = new Set<string>();
  const activeFolders = new Set<string>();
  const appendFolder = (sourceId: string, depth: number) => {
    if (expandedFolders.has(sourceId)) return;
    expandedFolders.add(sourceId);
    activeFolders.add(sourceId);
    sorted(byFolder.get(sourceId)).forEach((resource) => {
      const folderTraversal = resource.typeHint !== 'folder'
        ? undefined
        : activeFolders.has(resource.resourceRef) ? 'cycle'
        : expandedFolders.has(resource.resourceRef) ? 'already-expanded'
        : undefined;
      rows.push({ depth, resource, ...(folderTraversal === undefined ? {} : { folderTraversal }) });
      if (resource.typeHint === 'folder' && folderTraversal === undefined) {
        appendFolder(resource.resourceRef, depth + 1);
      }
    });
    activeFolders.delete(sourceId);
  };
  if (rootSourceId !== undefined) appendFolder(rootSourceId, 0);
  [...byFolder.keys()].sort().forEach((sourceId) => appendFolder(sourceId, 0));
  const byResourceRef = new Map<string, FolderLinkRow>();
  rows.forEach(({ resource }) => {
    if (!byResourceRef.has(resource.resourceRef)) byResourceRef.set(resource.resourceRef, resource);
  });
  const launchableFolders = new Set(resources.flatMap(({ name, sourceId, typeHint }) =>
    name === 'index.html' && typeHint !== 'folder' ? [sourceId] : []));
  return {
    rows,
    byIdentity,
    byResourceRef,
    graphState: options.graphState ?? 'ready',
    launchableFolders,
    sourceProblems: options.sourceProblems ?? [],
  };
};

const sorted = (resources: readonly FolderLinkRow[] | undefined) => [...resources ?? []].sort((left, right) =>
  (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
  || left.name.localeCompare(right.name) || left.linkId.localeCompare(right.linkId));
