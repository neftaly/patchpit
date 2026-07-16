import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStaticFolderDatabaseSource,
  fileRelation,
  fileSchemaArtifact,
  type FolderLink,
} from '@patchpit/fs';
import { prepareManualReadOnlyAttachment } from '@tarstate/core/attachment/adapter';
import type { AttachmentProjection } from '@tarstate/core/database';
import type { OwnedDatabaseSource } from '@tarstate/core/database/session';
import type { QueryLogicalValue, RelationInput } from '@tarstate/core/query';
import type { SourceSnapshot } from '@tarstate/core/source';
import { toPortableBytes } from '@tarstate/core/values';
import {
  APP_FILE_AUTHORITY_SCOPE,
  snapshotFilesystemApp,
} from '@patchpit/sandbox-fs';

void test('app snapshot is exact, immutable, basis-bearing, and root-relative', async () => {
  const root = folderSource('folder:app', [
    link('index', 'index.html', 'file', 'automerge:index'),
    link('assets', 'assets', 'folder', 'folder:assets'),
  ]);
  const sources = new Map<string, OwnedDatabaseSource>([
    ['folder:assets', folderSource('folder:assets', [link('icon', 'icon.svg', 'file', 'automerge:icon')])],
    ['automerge:index', contentSource('automerge:index', [1, 2], 2)],
    ['automerge:icon', contentSource('automerge:icon', [3], 4)],
  ]);
  const result = await snapshotFilesystemApp({
    root,
    rootFolderRef: 'folder:app',
    openSource: ({ sourceId }) => sources.get(sourceId),
  });
  assert.equal(result.state, 'ready', JSON.stringify(result));
  if (result.state !== 'ready') throw new Error('Expected ready app snapshot');
  assert.deepEqual(await Promise.all(result.files.map(async ({ path, body }) => [
    path,
    [...new Uint8Array(await body.arrayBuffer())],
  ])), [
    [['assets', 'icon.svg'], [3]],
    [['index.html'], [1, 2]],
  ]);
  assert.deepEqual(result.sourceBases.map(({ sourceId }) => sourceId).sort(), [
    'automerge:icon', 'automerge:index', 'folder:app', 'folder:assets',
  ]);
  assert.equal(Object.isFrozen(result.files), true);
  assert.equal(JSON.stringify(result).includes('handle'), false);
});

void test('HTTPS app leaves remain incomplete and are never fetched implicitly', async () => {
  const root = folderSource('folder:remote', [
    link('remote', 'index.html', 'file', 'https://example.test/remote.js'),
  ]);
  let resolutions = 0;
  const result = await snapshotFilesystemApp({
    root,
    rootFolderRef: 'folder:remote',
    openSource: ({ sourceId }) => {
      resolutions += 1;
      assert.equal(sourceId, 'https://example.test/remote.js');
      return undefined;
    },
  });
  assert.equal(resolutions, 1);
  assert.equal(result.state, 'incomplete');
  assert.equal(result.completeness, 'unknown');
});

void test('an exact folder without direct index.html is invalid', async () => {
  const result = await snapshotFilesystemApp({
    root: folderSource('folder:missing', [link('main', 'main.html', 'file', 'automerge:main')]),
    rootFolderRef: 'folder:missing',
    openSource: ({ sourceId }) => contentSource(sourceId, [1]),
  });
  assert.equal(result.state, 'invalid', JSON.stringify(result));
  assert.equal(result.issues.some(({ code }) => code === 'patchpit.app.entry-missing'), true);
});

void test('snapshot byte bound counts aliases at every mounted path', async () => {
  const shared = contentSource('automerge:shared', [1]);
  await assert.rejects(() => snapshotFilesystemApp({
    root: folderSource('folder:aliases', [
      link('index', 'index.html', 'file', 'automerge:shared'),
      link('copy-1', 'copy-1.bin', 'file', 'automerge:shared'),
      link('copy-2', 'copy-2.bin', 'file', 'automerge:shared'),
      link('copy-3', 'copy-3.bin', 'file', 'automerge:shared'),
    ]),
    byteLimit: 3,
    rootFolderRef: 'folder:aliases',
    openSource: () => shared,
  }), /too large/);
});

const link = (
  linkId: string,
  name: string,
  typeHint: string,
  resourceRef: string,
): FolderLink => ({ linkId, name, order: 0, resourceRef, typeHint });

const folderSource = (sourceId: string, links: readonly FolderLink[]): OwnedDatabaseSource =>
  Object.assign(createStaticFolderDatabaseSource(
    { sourceId, title: sourceId, links },
    APP_FILE_AUTHORITY_SCOPE,
  ), {
    close: () => undefined,
  });

const contentSource = (
  sourceId: string,
  bytes: ArrayLike<number>,
  revision = 0,
): OwnedDatabaseSource => fileSource({
  sourceId,
  revision,
  content: toPortableBytes(Uint8Array.from(bytes)),
});

const fileSource = (input: {
  readonly sourceId: string;
  readonly content: QueryLogicalValue;
  readonly revision?: number;
}): OwnedDatabaseSource => {
  const { sourceId } = input;
  const snapshot: SourceSnapshot<{ readonly content: QueryLogicalValue }> = {
    sourceId,
    operationEpoch: `${sourceId}:operations:1`,
    basis: { incarnation: `${sourceId}:1`, revision: input.revision ?? 0 },
    state: 'ready',
    freshness: 'current',
    storage: { content: input.content },
    issues: [],
  };
  const source = {
    sourceId,
    snapshot: () => snapshot,
    subscribe: () => () => undefined,
  };
  return {
    close: () => undefined,
    mount: (catalog, options) => {
      const discoveryEdges = options?.discoveryEdges ?? [];
      const lease = catalog.attach({
        attachmentId: sourceId,
        incarnation: `${sourceId}:attachment:1`,
        sourceId,
        source,
        authorityScope: APP_FILE_AUTHORITY_SCOPE,
        discoveryEdges,
        preparation: prepareManualReadOnlyAttachment<
          { readonly content: QueryLogicalValue },
          readonly RelationInput[]
        >({
          schemaViewIds: [fileSchemaArtifact.id],
          project: (current): AttachmentProjection<readonly RelationInput[]> =>
            current.state !== 'ready' || current.storage === undefined
              ? { state: current.state === 'ready' ? 'failed' : current.state, issues: current.issues }
              : {
                  state: 'ready',
                  value: [{
                    relation: fileRelation,
                    rows: [{
                      id: 'file',
                      contentKind: 'binary',
                      binaryContent: current.storage.content,
                      extension: 'bin',
                      mimeType: 'text/plain',
                      name: 'file.bin',
                    }],
                    occurrenceIds: ['file'],
                    completeness: 'exact',
                    sourceId,
                    attachmentId: sourceId,
                    basis: current.basis,
                  }],
                  issues: current.issues,
                },
        }),
      });
      return {
        attachmentId: sourceId,
        sourceId,
        discoveryEdges,
        close: () => lease.close(),
      };
    },
  };
};
