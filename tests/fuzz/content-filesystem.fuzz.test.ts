import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import * as Automerge from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import {
  openAutomergeFileDatabase,
  openAutomergeFilesystemDatabase,
  openAutomergeFolderDatabase,
} from '@patchpit/automerge-fs';
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
import {
  projectResourceTree,
  resourceIdentity,
  resourceTransferDestinations,
} from '../../src/content/resource-projection.ts';
import {
  canonicalRootInvocationHash,
  parseRootInvocationHash,
  type RootInvocation,
} from '../../src/root/invocation.ts';
import { selectFilesystemDocumentKind } from '../../packages/automerge-fs/src/document-selection.ts';

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
      const expandedFolders = new Set(['source-0']);
      const activeFolders: string[] = [];
      projected.rows.forEach(({ depth, folderTraversal, resource }) => {
        activeFolders.length = depth + 1;
        activeFolders[depth] = resource.sourceId;
        expandedFolders.add(resource.sourceId);
        if (folderTraversal !== undefined) {
          assert.equal(resource.typeHint, 'folder');
          assert.equal(expandedFolders.has(resource.resourceRef), true);
          assert.equal(
            activeFolders.includes(resource.resourceRef),
            folderTraversal === 'cycle',
          );
        } else if (resource.typeHint === 'folder') {
          expandedFolders.add(resource.resourceRef);
        }
      });
      resources.forEach((resource) => {
        assert.equal(projected.byIdentity.get(resourceIdentity(resource)), resource);
      });
      const destinations = resourceTransferDestinations(projected, 'source-0');
      const expectedDestinationIds = new Set([
        'source-0',
        ...resources.filter(({ typeHint }) => typeHint === 'folder')
          .map(({ resourceRef }) => resourceRef),
      ]);
      assert.deepEqual(new Set(destinations.map(({ sourceId }) => sourceId)), expectedDestinationIds);
      assert.equal(new Set(destinations.map(({ label }) => label)).size, destinations.length);
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

void test('filesystem adapter selection obeys owned metadata, nominations, and unambiguous shapes', () => {
  fc.assert(fc.property(
    fc.constantFrom('absent', 'folder', 'file', 'unknown'),
    fc.constantFrom('absent', 'folder', 'file', 'unknown'),
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
    nonEmptyString,
    (patchpitKind, patchworkKind, folderShape, fileShape, patchpitConflicted, label) => {
      const document: Record<string, unknown> = {};
      if (folderShape) Object.assign(document, { title: label, docs: [] });
      if (fileShape) Object.assign(document, {
        content: label,
        extension: 'txt',
        mimeType: 'text/plain',
        name: `${label}.txt`,
      });
      if (patchworkKind !== 'absent') document['@patchwork'] = { type: patchworkKind };
      if (!patchpitConflicted && patchpitKind !== 'absent') {
        document['@patchpit'] = { type: patchpitKind };
      }

      const expectedKind = expectedFilesystemKind({
        fileShape,
        folderShape,
        patchpitConflicted,
        patchpitKind,
        patchworkKind,
      });
      const base = Automerge.from(document, { actor: 'c'.repeat(64) });
      const input = patchpitConflicted ? withConflictedPatchpitMetadata(base) : base;
      const selected = selectFilesystemDocumentKind(input, 'fuzz:document');
      assert.equal(selected.success, expectedKind !== undefined);
      if (selected.success) {
        assert.equal(selected.value, expectedKind);
      } else if (patchpitConflicted) {
        assert.equal(selected.issues.some(({ code }) =>
          code === 'patchpit.filesystem.metadata-conflicted'), true);
      } else if (patchpitKind === 'absent' && patchworkKind !== 'folder'
        && patchworkKind !== 'file' && folderShape && fileShape) {
        assert.equal(selected.issues.some(({ code }) =>
          code === 'patchpit.filesystem.adapter-ambiguous'), true);
        if (patchworkKind === 'unknown') {
          assert.equal(selected.issues.some(({ code }) =>
            code === 'patchpit.filesystem.interop-metadata-invalid'), true);
        }
      }
    },
  ), { numRuns: 100 });
});

void test('typed filesystem openers cannot bypass adapter selection', async () => {
  const folderShape = { title: 'Folder', docs: [] };
  const fileShape = { content: 'text', extension: 'txt', mimeType: 'text/plain', name: 'file.txt' };
  const cases = [
    { document: { ...folderShape, ...fileShape }, expected: undefined },
    { document: { '@patchwork': { type: 'file' }, ...folderShape, ...fileShape }, expected: 'file' },
    { document: { '@patchwork': { type: 'folder' }, ...folderShape, ...fileShape }, expected: 'folder' },
    { document: { '@patchwork': { type: 'file' }, ...folderShape }, expected: undefined },
    { document: { '@patchwork': { type: 'folder' }, ...fileShape }, expected: undefined },
  ] as const;
  const repo = new Repo({ network: [] });
  try {
    for (const { document, expected } of cases) {
      const handle = repo.create<Record<string, unknown>>(document);
      const opened = await openAutomergeFilesystemDatabase(handle);
      assert.equal(opened.success ? opened.value.kind : undefined, expected);
      if (opened.success) opened.value.database.close();
      const folder = await openAutomergeFolderDatabase(handle);
      assert.equal(folder.success, expected === 'folder');
      if (folder.success) folder.value.close();
      const file = await openAutomergeFileDatabase(handle, 'public');
      assert.equal(file.success, expected === 'file');
      if (file.success) file.value.close();
    }
  } finally {
    await repo.shutdown();
  }
});

const withConflictedPatchpitMetadata = (base: Automerge.Doc<Record<string, unknown>>) => {
  const folder = Automerge.change(
    Automerge.clone(base, { actor: 'a'.repeat(64) }),
    (draft) => { draft['@patchpit'] = { type: 'folder' }; },
  );
  const file = Automerge.change(
    Automerge.clone(base, { actor: 'b'.repeat(64) }),
    (draft) => { draft['@patchpit'] = { type: 'file' }; },
  );
  return Automerge.merge(folder, file);
};

const expectedFilesystemKind = ({ fileShape, folderShape, patchpitConflicted, patchpitKind, patchworkKind }: {
  readonly fileShape: boolean;
  readonly folderShape: boolean;
  readonly patchpitConflicted: boolean;
  readonly patchpitKind: 'absent' | 'folder' | 'file' | 'unknown';
  readonly patchworkKind: 'absent' | 'folder' | 'file' | 'unknown';
}): 'folder' | 'file' | undefined => {
  if (patchpitConflicted) return undefined;
  if (patchpitKind === 'unknown') return undefined;
  if (patchpitKind === 'folder' || patchpitKind === 'file') {
    return patchpitKind;
  }
  if (patchworkKind === 'folder' || patchworkKind === 'file') {
    return patchworkKind;
  }
  if (folderShape === fileShape) return undefined;
  return folderShape ? 'folder' : 'file';
};
