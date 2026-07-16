import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import type { FsEntryRow } from '@patchpit/fs';
import {
  appContentUrl,
  parseContentInvocation,
  viewerContentUrl,
} from '../../src/content/invocation.ts';
import { projectResources, resourceIdentity } from '../../src/content/resources.ts';
import {
  canonicalRootInvocationHash,
  parseRootInvocationHash,
  type RootInvocation,
} from '../../src/root/invocation.ts';

const nonEmptyString = fc.string({ minLength: 1, maxLength: 80 });
const validSrc = 'automerge:4NMNnkMhL8jXrdJ9jamS58PAVdXu';

void test('content and root invocation values round-trip without lossy escaping', () => {
  fc.assert(fc.property(
    nonEmptyString,
    nonEmptyString,
    fc.array(fc.string({ maxLength: 40 }), { minLength: 1, maxLength: 4 }),
    fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
    (sourceId, entryId, sync, delegation) => {
      assert.deepEqual(parseContentInvocation(viewerContentUrl(sourceId, entryId)), {
        kind: 'viewer',
        sourceId,
        entryId,
      });
      assert.deepEqual(parseContentInvocation(appContentUrl(entryId)), {
        kind: 'app',
        rootEntryId: entryId,
      });

      const invocation: RootInvocation = {
        src: validSrc,
        sync: sync as [string, ...string[]],
        ...(delegation === undefined ? {} : { delegation }),
      };
      assert.deepEqual(
        parseRootInvocationHash(canonicalRootInvocationHash(invocation), (value) => value === validSrc),
        { ok: true, value: invocation },
      );
    },
  ), { numRuns: 200 });
});

void test('invocation parsers are total over arbitrary URL text', () => {
  fc.assert(fc.property(fc.string({ maxLength: 300 }), (input) => {
    assert.doesNotThrow(() => parseContentInvocation(input));
    assert.doesNotThrow(() => parseRootInvocationHash(input, () => false));
  }), { numRuns: 300 });
});

void test('resource hierarchy projection preserves every source-scoped identity exactly once', () => {
  fc.assert(fc.property(
    fc.array(fc.record({
      source: fc.integer({ min: 0, max: 3 }),
      parentSeed: fc.nat(100),
      order: fc.integer({ min: -5, max: 20 }),
      name: nonEmptyString,
    }), { maxLength: 80 }),
    (descriptions) => {
      const priorBySource = new Map<string, string[]>();
      const resources = descriptions.map((description, index): FsEntryRow => {
        const sourceId = `source-${description.source}`;
        const prior = priorBySource.get(sourceId) ?? [];
        const parentId = description.parentSeed % 3 === 0 || prior.length === 0
          ? null
          : prior[description.parentSeed % prior.length]!;
        const entryId = `entry-${index}`;
        prior.push(entryId);
        priorBySource.set(sourceId, prior);
        return {
          sourceId,
          entryId,
          parentId,
          kind: index % 3 === 0 ? 'folder' : 'file',
          name: description.name,
          order: description.order,
          resourceRef: `${sourceId}:${entryId}`,
        };
      });
      const projected = projectResources(resources);
      const depthByIdentity = new Map(projected.rows.map(({ depth, resource }) => [resourceIdentity(resource), depth]));
      assert.equal(projected.rows.length, resources.length);
      assert.equal(depthByIdentity.size, resources.length);
      assert.equal(projected.byIdentity.size, resources.length);
      for (const resource of resources) {
        const identity = resourceIdentity(resource);
        assert.equal(projected.byIdentity.get(identity), resource);
        const depth = depthByIdentity.get(identity);
        assert.notEqual(depth, undefined);
        if (resource.parentId !== null) {
          assert.equal(
            depth,
            (depthByIdentity.get(JSON.stringify([resource.sourceId, resource.parentId])) ?? -1) + 1,
          );
        }
      }
    },
  ), { numRuns: 100 });
});
