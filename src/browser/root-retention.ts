import type { AutomergeUrl } from '@automerge/automerge-repo';
import type {
  BrowserRootRecord,
  RootBaselineSource,
} from './root-catalogue.ts';

export type RootEvictionPlan = {
  readonly rootUrl: AutomergeUrl;
  readonly sourceIds: readonly AutomergeUrl[];
};

export const planDisposableRootEvictions = (
  roots: readonly BrowserRootRecord[],
  activeRootUrl?: AutomergeUrl,
): readonly RootEvictionPlan[] => {
  const stored = roots.filter((root) => root.localCopy.state === 'stored');
  if (stored.some((root) => root.baseline === undefined)) return [];
  return stored.flatMap((candidate): RootEvictionPlan[] => {
    if (candidate.rootUrl === activeRootUrl
      || candidate.provenance !== 'bootstrap'
      || candidate.retention !== 'disposable'
      || candidate.baseline === undefined) return [];
    const protectedSources = new Set(stored.flatMap((root) => root.rootUrl === candidate.rootUrl
      ? []
      : root.baseline?.map(({ sourceId }) => sourceId) ?? []));
    const sourceIds = candidate.baseline.flatMap(({ sourceId }) =>
      protectedSources.has(sourceId) ? [] : [sourceId]);
    return sourceIds.includes(candidate.rootUrl) ? [{ rootUrl: candidate.rootUrl, sourceIds }] : [];
  });
};

export const baselineMatches = (
  expected: readonly RootBaselineSource[],
  actual: readonly RootBaselineSource[],
) => canonicalBaseline(expected) === canonicalBaseline(actual);

const canonicalBaseline = (baseline: readonly RootBaselineSource[]) => JSON.stringify(
  baseline.map(({ sourceId, heads }) => ({ sourceId, heads: [...heads].sort() }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
);
