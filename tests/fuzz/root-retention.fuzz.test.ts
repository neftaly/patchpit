import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import type { AutomergeUrl } from '@automerge/automerge-repo';
import {
  MAX_ROOT_EVICTION_SOURCES,
  parseRootRecord,
  type BrowserRootRecord,
  type RootBaselineSource,
} from '../../src/browser/root-catalogue.ts';
import {
  baselineMatches,
  planDisposableRootEvictions,
} from '../../src/browser/root-retention.ts';

const rootUrls = [
  'automerge:4NMNnkMhL8jXrdJ9jamS58PAVdXu' as AutomergeUrl,
  'automerge:4hj6FJqozF7cLYqHi3FuK1SQhKc' as AutomergeUrl,
  'automerge:3h6FJqozF7cLYqHi3FuK1SQhKc' as AutomergeUrl,
] as const;

void test('root catalogue parsing is total for arbitrary browser data', () => {
  fc.assert(fc.property(fc.jsonValue(), (value) => {
    assert.doesNotThrow(() => parseRootRecord(value));
  }), { numRuns: 500 });
});

void test('root catalogue rejects unbounded eviction journals', () => {
  const candidate = {
    ...record(rootUrls[0], 0),
    localCopy: {
      state: 'evicting',
      changedAt: 0,
      remainingSourceIds: Array.from(
        { length: MAX_ROOT_EVICTION_SOURCES + 1 },
        () => rootUrls[0],
      ),
    },
  };
  assert.equal(parseRootRecord(candidate), undefined);
});

void test('retention never selects active, retained, shared, or uncertain sources', () => {
  fc.assert(fc.property(
    fc.uniqueArray(fc.integer({ min: 0, max: rootUrls.length - 1 }), { maxLength: rootUrls.length }),
    fc.option(fc.integer({ min: 0, max: rootUrls.length - 1 }), { nil: undefined }),
    fc.boolean(),
    (indices, activeIndex, includeUnknown) => {
      const records = indices.map((index, position) => record(rootUrls[index] as AutomergeUrl, position));
      const withUnknown = includeUnknown && records[0] !== undefined
        ? [withoutBaseline(records[0]), ...records.slice(1)]
        : records;
      const active = activeIndex === undefined ? undefined : rootUrls[activeIndex];
      const plans = planDisposableRootEvictions(withUnknown, active);
      if (includeUnknown && records.length > 0) assert.deepEqual(plans, []);
      for (const plan of plans) {
        assert.notEqual(plan.rootUrl, active);
        const candidate = withUnknown.find(({ rootUrl }) => rootUrl === plan.rootUrl);
        assert.equal(candidate?.retention, 'disposable');
        const protectedSources = new Set(withUnknown.flatMap((root) => root.rootUrl === plan.rootUrl
          ? []
          : root.baseline?.map(({ sourceId }) => sourceId) ?? []));
        assert.equal(plan.sourceIds.some((sourceId) => protectedSources.has(sourceId)), false);
      }
    },
  ), { numRuns: 300 });
});

void test('baseline comparison ignores ordering but not identity or heads', () => {
  const baseline: readonly RootBaselineSource[] = rootUrls.slice(0, 2).map((sourceId, index) => ({
    sourceId,
    heads: [`head-${index}`, `other-${index}`],
  }));
  assert.equal(baselineMatches(baseline, baseline.toReversed().map(({ sourceId, heads }) => ({
    sourceId,
    heads: heads.toReversed(),
  }))), true);
  assert.equal(baselineMatches(baseline, [{ ...baseline[0]!, heads: ['changed'] }, baseline[1]!]), false);
});

const record = (rootUrl: AutomergeUrl, index: number): BrowserRootRecord => ({
  format: 1,
  rootUrl,
  provenance: 'bootstrap',
  bootstrap: { id: 'patchpit.demo', generation: 1 },
  retention: index === 2 ? 'retained' : 'disposable',
  localCopy: { state: 'stored', changedAt: index },
  createdAt: index,
  lastOpenedAt: index,
  baseline: [{ sourceId: rootUrl, heads: [`head-${index}`] }],
});

const withoutBaseline = ({ baseline: _baseline, ...root }: BrowserRootRecord): BrowserRootRecord => root;
