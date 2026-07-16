import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import type { FolderLinkRow } from '@patchpit/fs';
import {
  hasAppEntry,
  projectAppFiles,
} from '../../packages/sandbox-fs/src/app-files.ts';
import {
  appContentUrl,
  parseContentInvocation,
  viewerContentUrl,
} from '../../src/content/invocation.ts';
import { projectResourceTree, resourceIdentity } from '../../src/content/resource-projection.ts';
import {
  canonicalRootInvocationHash,
  parseRootInvocationHash,
  type RootInvocation,
} from '../../src/root/invocation.ts';

const nonEmptyString = fc.string({ minLength: 1, maxLength: 80 });
const validSrc = 'automerge:4NMNnkMhL8jXrdJ9jamS58PAVdXu';

void test('content and root invocation parsing is total and round-trips recognized values', () => {
  fc.assert(fc.property(
    nonEmptyString,
    fc.array(fc.string({ maxLength: 40 }), { minLength: 1, maxLength: 4 }),
    fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
    fc.string({ maxLength: 300 }),
    (resourceRef, sync, delegation, arbitraryInput) => {
      assert.deepEqual(parseContentInvocation(viewerContentUrl(resourceRef)), {
        kind: 'viewer',
        resourceRef,
      });
      assert.deepEqual(parseContentInvocation(appContentUrl(resourceRef)), {
        kind: 'app',
        resourceRef,
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
      assert.doesNotThrow(() => parseContentInvocation(arbitraryInput));
      assert.doesNotThrow(() => parseRootInvocationHash(arbitraryInput, () => false));
    },
  ), { numRuns: 300 });
});

void test('resource graph projection preserves every source-scoped link exactly once', () => {
  fc.assert(fc.property(
    fc.array(fc.record({
      source: fc.integer({ min: 0, max: 3 }),
      target: fc.integer({ min: 0, max: 3 }),
      order: fc.integer({ min: -5, max: 20 }),
      name: nonEmptyString,
      folder: fc.boolean(),
    }), { maxLength: 80 }),
    (descriptions) => {
      const resources = descriptions.map((description, index): FolderLinkRow => ({
        sourceId: `source-${description.source}`,
        linkId: `link-${index}`,
        name: description.name,
        order: description.order,
        resourceRef: description.folder ? `source-${description.target}` : `content-${index}`,
        typeHint: description.folder ? 'folder' : 'file',
      }));
      const projected = projectResourceTree(resources, 'source-0');
      assert.equal(projected.rows.length, resources.length);
      assert.equal(projected.byIdentity.size, resources.length);
      resources.forEach((resource) => {
        assert.equal(projected.byIdentity.get(resourceIdentity(resource)), resource);
      });
    },
  ), { numRuns: 150 });
});

void test('app projection preserves root-relative unique paths through folder documents', () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 20 }),
    fc.integer({ min: 1, max: 40 }),
    (depth, fileCount) => {
      const folderSources = Array.from({ length: depth + 1 }, (_, index) => `folder-${index}`);
      const folderLinks = folderSources.slice(1).map((target, index): FolderLinkRow => ({
        sourceId: folderSources[index]!,
        linkId: `folder-link-${index}`,
        name: target,
        order: 0,
        resourceRef: target,
        typeHint: 'folder',
      }));
      const files = Array.from({ length: fileCount }, (_, index): FolderLinkRow => ({
        sourceId: folderSources[index % folderSources.length]!,
        linkId: `file-${index}`,
        name: index === 0 ? 'index.html' : `file-${index}.txt`,
        order: index + 1,
        resourceRef: `content-${index % 4}`,
        typeHint: 'file',
      }));
      const projected = projectAppFiles([...folderLinks, ...files], 'folder-0');
      assert.equal(projected.length, files.length);
      assert.equal(hasAppEntry(projected), true);
      assert.equal(new Set(projected.map(({ path }) => JSON.stringify(path))).size, files.length);
      projected.forEach(({ path, resource }) => assert.equal(path.at(-1), resource.name));
    },
  ), { numRuns: 80 });
});
