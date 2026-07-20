import { getHeads } from '@automerge/automerge';
import {
  parseAutomergeUrl,
  Repo,
  type AutomergeUrl,
} from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import {
  MAX_ROOT_EVICTION_SOURCES,
  type BrowserRootCatalogue,
  type BrowserRootRecord,
  type RootBaselineSource,
} from './root-catalogue.ts';
import {
  baselineMatches,
  planDisposableRootEvictions,
  type RootEvictionPlan,
} from './root-retention.ts';

export const captureRepoBaseline = (
  repo: Repo,
  includedSourceIds?: ReadonlySet<AutomergeUrl>,
): readonly RootBaselineSource[] => Object.values(repo.handles)
  .filter((handle) => includedSourceIds === undefined || includedSourceIds.has(handle.url))
  .filter((handle) => handle.isReady())
  .flatMap((handle): RootBaselineSource[] => {
    const document = handle.doc();
    return document === undefined ? [] : [{ sourceId: handle.url, heads: [...getHeads(document)].sort() }];
  })
  .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

export const flushReadyRepoDocuments = async (repo: Repo) =>
  flushBaseline(repo, captureRepoBaseline(repo));

export const flushBaseline = async (repo: Repo, baseline: readonly RootBaselineSource[]) => repo.flush(
  baseline.map(({ sourceId }) => parseAutomergeUrl(sourceId).documentId),
);

export const collectDisposableBrowserRoots = async ({
  activeRootUrl,
  catalogue,
  lockNamespace,
  storage,
}: {
  readonly activeRootUrl?: AutomergeUrl;
  readonly catalogue: BrowserRootCatalogue;
  readonly lockNamespace: string;
  readonly storage: IndexedDBStorageAdapter;
}) => {
  const records = await catalogue.listRecent(1_024);
  await resumeInterruptedEvictions({ catalogue, lockNamespace, records, storage });
  const defaultRoot = await catalogue.getDefault();
  const protectedRootUrl = defaultRoot?.rootUrl ?? activeRootUrl;
  const plans = planDisposableRootEvictions(records, protectedRootUrl);
  for (const plan of plans) {
    await collectRoot({ catalogue, lockNamespace, plan, storage });
  }
};

const collectRoot = async ({ catalogue, lockNamespace, plan, storage }: {
  readonly catalogue: BrowserRootCatalogue;
  readonly lockNamespace: string;
  readonly plan: RootEvictionPlan;
  readonly storage: IndexedDBStorageAdapter;
}) => {
  if (plan.sourceIds.length === 0 || plan.sourceIds.length > MAX_ROOT_EVICTION_SOURCES) return;
  await navigator.locks.request(
    `${lockNamespace}:root:${plan.rootUrl}`,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (lock === null) return;
      const records = await catalogue.listRecent(1_024);
      const defaultRoot = await catalogue.getDefault();
      const currentPlan = planDisposableRootEvictions(records, defaultRoot?.rootUrl)
        .find(({ rootUrl }) => rootUrl === plan.rootUrl);
      const candidate = records.find(({ rootUrl }) => rootUrl === plan.rootUrl);
      if (currentPlan === undefined || candidate?.baseline === undefined
        || !sameSourceIds(currentPlan.sourceIds, plan.sourceIds)) return;
      const actual = await inspectStoredBaseline(storage, candidate.baseline);
      if (actual === undefined || !baselineMatches(candidate.baseline, actual)) {
        await catalogue.retain(candidate.rootUrl);
        return;
      }
      await evictSources(catalogue, storage, plan.rootUrl, rootFirst(plan));
    },
  );
};

const resumeInterruptedEvictions = async ({ catalogue, lockNamespace, records, storage }: {
  readonly catalogue: BrowserRootCatalogue;
  readonly lockNamespace: string;
  readonly records: readonly BrowserRootRecord[];
  readonly storage: IndexedDBStorageAdapter;
}) => {
  for (const record of records) {
    if (record.localCopy.state !== 'evicting') continue;
    await navigator.locks.request(
      `${lockNamespace}:root:${record.rootUrl}`,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (lock === null) return;
        await evictSources(
          catalogue,
          storage,
          record.rootUrl,
          record.localCopy.state === 'evicting' ? record.localCopy.remainingSourceIds : [],
        );
      },
    );
  }
};

const inspectStoredBaseline = async (
  storage: IndexedDBStorageAdapter,
  expected: readonly RootBaselineSource[],
): Promise<readonly RootBaselineSource[] | undefined> => {
  const repo = new Repo({ storage, saveDebounceRate: 0 });
  try {
    const sources = await Promise.all(expected.map(async ({ sourceId }) => {
      const handle = await repo.find<object>(sourceId);
      const document = handle.doc();
      return document === undefined
        ? undefined
        : { sourceId, heads: [...getHeads(document)].sort() } satisfies RootBaselineSource;
    }));
    return sources.every((source) => source !== undefined)
      ? sources as readonly RootBaselineSource[]
      : undefined;
  } catch {
    return undefined;
  } finally {
    await repo.shutdown();
  }
};

const evictSources = async (
  catalogue: BrowserRootCatalogue,
  storage: IndexedDBStorageAdapter,
  rootUrl: AutomergeUrl,
  sourceIds: readonly AutomergeUrl[],
) => {
  let remaining = [...sourceIds];
  await catalogue.setLocalCopy(rootUrl, {
    state: 'evicting',
    changedAt: Date.now(),
    remainingSourceIds: remaining,
  });
  while (remaining.length > 0) {
    const sourceId = remaining[0];
    if (sourceId === undefined) break;
    await storage.removeRange([parseAutomergeUrl(sourceId).documentId]);
    remaining = remaining.slice(1);
    await catalogue.setLocalCopy(rootUrl, {
      state: 'evicting',
      changedAt: Date.now(),
      remainingSourceIds: remaining,
    });
  }
  await catalogue.setLocalCopy(rootUrl, { state: 'evicted', changedAt: Date.now() });
};

const rootFirst = (plan: RootEvictionPlan) => [
  plan.rootUrl,
  ...plan.sourceIds.filter((sourceId) => sourceId !== plan.rootUrl),
];

const sameSourceIds = (left: readonly AutomergeUrl[], right: readonly AutomergeUrl[]) => {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((sourceId, index) => sourceId === sortedRight[index]);
};
