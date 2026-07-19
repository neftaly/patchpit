import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import type { FolderLinkRow } from '@patchpit/fs';
import {
  classifyExactResourceRelocation,
  relocationDestinationLink,
  type ResourceRelocationIntent,
} from '../../src/root/resource-relocation.ts';

const field = fc.string({ minLength: 1, maxLength: 40 });
const sourceLink = fc.record({
  copyOf: fc.option(field, { nil: undefined }),
  icon: fc.option(field, { nil: undefined }),
  linkId: field,
  name: field,
  resourceRef: field,
  typeHint: fc.constantFrom('file', 'resource'),
}).map(({ copyOf, icon, ...link }): FolderLinkRow => ({
  ...link,
  sourceId: 'source',
  ...(copyOf === undefined ? {} : { copyOf }),
  ...(icon === undefined ? {} : { icon }),
}));

void test('resource relocation progress is idempotent and interruption-safe', () => {
  fc.assert(fc.property(sourceLink, fc.uuid({ version: 4 }), (source, transferId) => {
    const intent: ResourceRelocationIntent = {
      destinationLinkId: `destination-${transferId}`,
      destinationSourceId: 'destination',
      source,
      transferId,
    };
    const initial = classifyExactResourceRelocation(intent, [source]);
    assert.equal(initial.state === 'ready' && initial.step, 'add-destination');

    const destination = {
      ...relocationDestinationLink(intent),
      order: 20,
      sourceId: intent.destinationSourceId,
    };
    const inserted = classifyExactResourceRelocation(intent, [source, destination]);
    assert.equal(inserted.state === 'ready' && inserted.step, 'unlink-source');
    assert.deepEqual(classifyExactResourceRelocation(intent, [source, destination]), inserted);
    assert.deepEqual(classifyExactResourceRelocation(intent, [destination]), { state: 'complete' });

    const changedSource = { ...source, name: `${source.name}-concurrent` };
    assert.deepEqual(classifyExactResourceRelocation(intent, [changedSource, destination]), {
      destinationApplied: true,
      reason: 'source-changed',
      state: 'blocked',
    });
    assert.deepEqual(classifyExactResourceRelocation(intent, [source, {
      ...destination,
      resourceRef: `${destination.resourceRef}-collision`,
    }]), {
      destinationApplied: false,
      reason: 'destination-collision',
      state: 'blocked',
    });
    assert.deepEqual(classifyExactResourceRelocation(intent, [source, source, destination]), {
      destinationApplied: false,
      reason: 'ambiguous-links',
      state: 'blocked',
    });
  }), { numRuns: 300 });

  fc.assert(fc.property(
    fc.integer({ min: 1, max: 30 }),
    fc.uuid({ version: 4 }),
    (depth, transferId) => {
      const source: FolderLinkRow = {
        linkId: 'folder-link',
        name: 'folder',
        resourceRef: 'folder-0',
        sourceId: 'root',
        typeHint: 'folder',
      };
      const descendants = Array.from({ length: depth }, (_, index): FolderLinkRow => ({
        linkId: `child-${index}`,
        name: `folder-${index + 1}`,
        resourceRef: `folder-${index + 1}`,
        sourceId: `folder-${index}`,
        typeHint: 'folder',
      }));
      assert.deepEqual(classifyExactResourceRelocation({
        destinationLinkId: `destination-${transferId}`,
        destinationSourceId: `folder-${depth}`,
        source,
        transferId,
      }, [source, ...descendants]), {
        destinationApplied: false,
        reason: 'folder-cycle',
        state: 'blocked',
      });
    },
  ), { numRuns: 100 });
});
