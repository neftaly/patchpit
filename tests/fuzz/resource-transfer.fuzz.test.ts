import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import type { FolderLinkRow } from '@patchpit/fs';
import {
  classifyExactResourceCopy,
  classifyExactResourceCopySource,
  classifyExactResourceRelocation,
  classifyExactResourceRelocationStep,
  copyDestinationLink,
  relocationDestinationLink,
  type ResourceRelocationIntent,
  type ResourceCopyIntent,
} from '../../src/root/resource-transfer.ts';

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
    assert.equal(
      classifyExactResourceRelocationStep(intent, [source], 'add-destination').state,
      'ready',
    );
    assert.equal(
      classifyExactResourceRelocationStep(intent, [source], 'unlink-source').state,
      'blocked',
    );
    assert.deepEqual(classifyExactResourceRelocation({
      ...intent,
      destinationSourceId: source.sourceId,
    }, [source]), { reason: 'same-source', state: 'no-op' });
    assert.deepEqual(classifyExactResourceRelocation(intent, []), {
      destinationApplied: false,
      reason: 'source-missing',
      state: 'blocked',
    });

    const sameNamedUnrelatedLink: FolderLinkRow = {
      linkId: `unrelated-${transferId}`,
      name: source.name,
      resourceRef: 'unrelated-resource',
      sourceId: intent.destinationSourceId,
      typeHint: 'file',
    };
    assert.deepEqual(
      classifyExactResourceRelocation(intent, [source, sameNamedUnrelatedLink]),
      initial,
    );

    const destination = {
      ...relocationDestinationLink(intent),
      order: 20,
      sourceId: intent.destinationSourceId,
    };
    const inserted = classifyExactResourceRelocation(intent, [source, destination]);
    assert.equal(inserted.state === 'ready' && inserted.step, 'unlink-source');
    assert.equal(
      classifyExactResourceRelocationStep(intent, [source, destination], 'add-destination').state,
      'ready',
    );
    assert.equal(
      classifyExactResourceRelocationStep(intent, [source, destination], 'unlink-source').state,
      'ready',
    );
    assert.deepEqual(classifyExactResourceRelocation(intent, [source, destination]), inserted);
    assert.deepEqual(classifyExactResourceRelocation(intent, [destination]), { state: 'complete' });
    assert.equal(
      classifyExactResourceRelocationStep(intent, [destination], 'add-destination').state,
      'ready',
    );
    assert.equal(
      classifyExactResourceRelocationStep(intent, [destination], 'unlink-source').state,
      'ready',
    );
    assert.deepEqual(
      classifyExactResourceRelocation(intent, [{ ...source, order: 99 }, destination]),
      inserted,
    );

    const changedSources: readonly FolderLinkRow[] = [{
      ...source,
      name: `${source.name}-concurrent`,
    }, {
      ...source,
      resourceRef: `${source.resourceRef}-concurrent`,
    }, {
      ...source,
      typeHint: `${source.typeHint}-concurrent`,
    }, {
      ...source,
      copyOf: `${source.copyOf ?? 'none'}-concurrent`,
    }, {
      ...source,
      icon: `${source.icon ?? 'none'}-concurrent`,
    }];
    changedSources.forEach((changedSource) => {
      assert.deepEqual(classifyExactResourceRelocation(intent, [changedSource, destination]), {
        destinationApplied: true,
        reason: 'source-changed',
        state: 'blocked',
      });
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

void test('resource copy progress retains identity lineage and rejects changed facts', () => {
  fc.assert(fc.property(sourceLink, fc.uuid({ version: 4 }), (source, transferId) => {
    const intent: ResourceCopyIntent = {
      destinationLinkId: `copy-${transferId}`,
      destinationSourceId: 'destination',
      source,
      sourceBasis: { incarnation: 'source:1', revision: 4 },
      transferId,
    };
    assert.deepEqual(classifyExactResourceCopySource(intent, [source]), { state: 'ready' });
    assert.deepEqual(classifyExactResourceCopySource(intent, []), {
      reason: 'source-missing',
      state: 'blocked',
    });
    const copiedResourceRef = `automerge:${transferId}`;
    const ready = classifyExactResourceCopy(intent, copiedResourceRef, [source]);
    assert.equal(ready.state, 'ready');
    const destination: FolderLinkRow = {
      ...copyDestinationLink(intent, copiedResourceRef),
      order: 12,
      sourceId: intent.destinationSourceId,
    };
    assert.deepEqual(classifyExactResourceCopy(intent, copiedResourceRef, [source, destination]), {
      state: 'complete',
    });
    assert.equal(destination.copyOf, source.resourceRef);
    assert.deepEqual(classifyExactResourceCopy(intent, copiedResourceRef, [{
      ...source,
      name: `${source.name}-changed`,
    }, destination]), {
      reason: 'source-changed',
      state: 'blocked',
    });
    assert.deepEqual(classifyExactResourceCopy(intent, copiedResourceRef, [source, {
      ...destination,
      resourceRef: `${copiedResourceRef}-collision`,
    }]), {
      reason: 'destination-collision',
      state: 'blocked',
    });
  }), { numRuns: 300 });
});
