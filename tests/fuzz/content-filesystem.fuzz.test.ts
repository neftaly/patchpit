import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  createStaticFsDatabaseSource,
  openFsSubtreeQuery,
  type FsEntryRow,
} from '@patchpit/fs';
import {
  hasAppEntry,
  projectAppFilePaths,
  selectAppFiles,
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
    nonEmptyString,
    fc.array(fc.string({ maxLength: 40 }), { minLength: 1, maxLength: 4 }),
    fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
    fc.string({ maxLength: 300 }),
    (sourceId, entryId, sync, delegation, arbitraryInput) => {
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
      assert.doesNotThrow(() => parseContentInvocation(arbitraryInput));
      assert.doesNotThrow(() => parseRootInvocationHash(arbitraryInput, () => false));
    },
  ), { numRuns: 300 });
});

void test('resource hierarchy projection preserves every source-scoped identity exactly once', () => {
  fc.assert(fc.property(
    fc.boolean(),
    fc.array(fc.record({
      source: fc.integer({ min: 0, max: 3 }),
      parentSeed: fc.nat(100),
      order: fc.integer({ min: -5, max: 20 }),
      name: nonEmptyString,
    }), { maxLength: 80 }),
    (wellFormed, descriptions) => {
      const priorBySource = new Map<string, string[]>();
      const sourceIds = descriptions.map(({ source }) => `source-${source}`);
      const idsBySource = new Map([...new Set(sourceIds)].map((sourceId) => [
        sourceId,
        sourceIds.flatMap((candidate, index) => candidate === sourceId ? [`entry-${index}`] : []),
      ]));
      const resources = descriptions.map((description, index): FsEntryRow => {
        const sourceId = `source-${description.source}`;
        const prior = priorBySource.get(sourceId) ?? [];
        const allSourceIds = idsBySource.get(sourceId) ?? [];
        const parentId = description.parentSeed % 3 === 0
          ? null
          : wellFormed
            ? prior[description.parentSeed % prior.length] ?? null
            : description.parentSeed % 3 === 1
              ? allSourceIds[description.parentSeed % allSourceIds.length] ?? null
              : `missing-${description.parentSeed}`;
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
      const projected = projectResourceTree(resources);
      const depthByIdentity = new Map(projected.rows.map(({ depth, resource }) => [resourceIdentity(resource), depth]));
      assert.equal(projected.rows.length, resources.length);
      assert.equal(depthByIdentity.size, resources.length);
      assert.equal(projected.byIdentity.size, resources.length);
      for (const resource of resources) {
        const identity = resourceIdentity(resource);
        assert.equal(projected.byIdentity.get(identity), resource);
        const depth = depthByIdentity.get(identity);
        assert.notEqual(depth, undefined);
        assert.ok(depth! >= 0);
        if (wellFormed && resource.parentId !== null) {
          assert.equal(
            depth,
            (depthByIdentity.get(JSON.stringify([resource.sourceId, resource.parentId])) ?? -1) + 1,
          );
        }
      }
    },
  ), { numRuns: 100 });
});

void test('filesystem app projection preserves root-relative unique paths', async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 0, max: 20 }),
    fc.integer({ min: 1, max: 40 }),
    async (depth, fileCount) => {
      const root = appEntry('root', null, 'folder', 'app', 'root');
      const folders = Array.from({ length: depth }, (_, index) => appEntry(
        `folder-${index}`,
        index === 0 ? root.entryId : `folder-${index - 1}`,
        'folder',
        `folder-${index}`,
        `folder-${index}`,
      ));
      const parents = [root.entryId, ...folders.map(({ entryId }) => entryId)];
      const files = Array.from({ length: fileCount }, (_, index) => appEntry(
        `file-${index}`,
        parents[index % parents.length]!,
        'file',
        index === 0 ? 'index.html' : `file-${index}.txt`,
        `content-${index % 4}`,
      ));
      const outside = appEntry('outside', null, 'file', 'outside.txt', 'outside');
      const query = await openFsSubtreeQuery(createStaticFsDatabaseSource({
        sourceId: 'source',
        entries: [root, ...folders, ...files, outside].map(({ sourceId: _sourceId, ...entry }) => entry),
      }), root.entryId);
      try {
        const snapshot = query.getSnapshot();
        assert.equal(snapshot.state, 'open');
        if (snapshot.state !== 'open') return;
        const selection = selectAppFiles(snapshot.current.rows, root.entryId);
        const paths = projectAppFilePaths(selection.root, selection.entries);
        assert.equal(selection.entries.some(({ entryId }) => entryId === outside.entryId), false);
        assert.equal(selection.files.length, files.length);
        assert.equal(hasAppEntry(selection.files, paths), true);
        assert.equal(new Set(files.map(({ entryId }) => JSON.stringify(paths.get(entryId)))).size, files.length);
        for (const file of files) assert.equal(paths.get(file.entryId)?.at(-1), file.name);
      } finally {
        query.close();
      }
    },
  ), { numRuns: 50 });
});

const appEntry = (
  entryId: string,
  parentId: string | null,
  kind: FsEntryRow['kind'],
  name: string,
  resourceRef: string,
): FsEntryRow => ({ entryId, parentId, kind, name, resourceRef, order: 0, sourceId: 'source' });
