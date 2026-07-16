import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFsDatabaseSource,
  createStaticFsDatabaseSource,
  fileRelation,
  fileSchemaArtifact,
  type FsEntry,
} from '@patchpit/fs';
import { prepareManualReadOnlyAttachment } from '@tarstate/core/attachment/adapter';
import type { AttachmentProjection } from '@tarstate/core/database';
import type { OwnedDatabaseSource } from '@tarstate/core/database/session';
import type { QueryLogicalValue, RelationInput } from '@tarstate/core/query';
import type { SourceSnapshot } from '@tarstate/core/source';
import {
  APP_FILE_AUTHORITY_SCOPE,
  snapshotFilesystemApp,
} from '@patchpit/sandbox-fs';

const contentSource = (
  sourceId: string,
  bytes: ArrayLike<number>,
  revision = 0,
  freshness: 'current' | 'stale' = 'current',
): OwnedDatabaseSource => fileSource({
  sourceId,
  revision,
  freshness,
  content: {
    kind: 'tarstate.value',
    type: 'bytes',
    value: Buffer.from(bytes).toString('base64url'),
  },
});

void test('app snapshot is exact, immutable, basis-bearing, and root-relative', async () => {
  const filesystem = createStaticFsDatabaseSource({
    sourceId: 'root',
    entries: [
      entry('app', null, 'folder', 'app', 'folder:app'),
      entry('index', 'app', 'file', 'index.html', 'automerge:index'),
      entry('assets', 'app', 'folder', 'assets', 'folder:assets'),
      entry('icon', 'assets', 'file', 'icon.svg', 'automerge:icon'),
      entry('outside', null, 'file', 'outside.txt', 'automerge:outside'),
    ],
  });
  const sources = new Map([
    ['automerge:index', contentSource('automerge:index', [1, 2], 2)],
    ['automerge:icon', contentSource('automerge:icon', [3], 4)],
  ]);
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
    openSource: ({ sourceId }) => sources.get(sourceId),
  });
  assert.equal(result.state, 'ready');
  if (result.state !== 'ready') throw new Error('Expected ready app snapshot');
  assert.deepEqual(await Promise.all(result.files.map(async ({ path, body }) => [
    path,
    [...new Uint8Array(await body.arrayBuffer())],
  ])), [
    [['assets', 'icon.svg'], [3]],
    [['index.html'], [1, 2]],
  ]);
  assert.deepEqual(result.sourceBases.map(({ sourceId }) => sourceId).sort(), [
    'automerge:icon', 'automerge:index', 'root',
  ]);
  assert.equal(Object.isFrozen(result.files), true);
  assert.equal(result.files[0]!.body instanceof Blob, true);
  assert.equal(JSON.stringify(result).includes('handle'), false);
});

void test('HTTPS app leaves are incomplete and never fetched implicitly', async () => {
  const filesystem = createStaticFsDatabaseSource({
    sourceId: 'root',
    entries: [
      entry('app', null, 'folder', 'app', 'folder:app'),
      entry('remote', 'app', 'file', 'index.html', 'https://example.test/remote.js'),
    ],
  });
  let resolutions = 0;
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
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

void test('an exact folder without direct index.html is not a launchable app snapshot', async () => {
  const result = await snapshotFilesystemApp({
    filesystem: createStaticFsDatabaseSource({
      sourceId: 'root:missing-entry',
      entries: [
        entry('app', null, 'folder', 'app', 'folder:app'),
        entry('main', 'app', 'file', 'main.html', 'automerge:main'),
      ],
    }),
    rootEntryId: 'app',
    openSource: ({ sourceId }) => contentSource(sourceId, [1]),
  });

  assert.equal(result.state, 'invalid');
  assert.equal(result.issues.some(({ code }) => code === 'patchpit.app.entry-missing'), true);
});

void test('exact stale content cannot launch', async () => {
  const result = await snapshotFilesystemApp({
    filesystem: createStaticFsDatabaseSource({
      sourceId: 'root',
      entries: [
        entry('app', null, 'folder', 'app', 'folder:app'),
        entry('index', 'app', 'file', 'index.html', 'automerge:index'),
      ],
    }),
    rootEntryId: 'app',
    openSource: ({ sourceId }) => contentSource(sourceId, [1], 0, 'stale'),
  });

  assert.equal(result.state, 'incomplete');
  assert.equal(result.completeness, 'exact');
});

void test('invalid content from a ready source invalidates the app snapshot', async () => {
  const filesystem = createStaticFsDatabaseSource({
    sourceId: 'root',
    entries: [
      entry('app', null, 'folder', 'app', 'folder:app'),
      entry('bad', 'app', 'file', 'bad.js', 'automerge:bad'),
    ],
  });
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
    openSource: ({ sourceId }) => fileSource({ sourceId, content: [1, 2, 3] }),
  });

  assert.equal(result.state, 'invalid');
  assert.equal(result.completeness, 'exact');
});

void test('snapshot byte bound counts repeated content at every mounted path', async () => {
  const shared = contentSource('automerge:shared', [1]);
  await assert.rejects(() => snapshotFilesystemApp({
    filesystem: createStaticFsDatabaseSource({
      sourceId: 'root',
      entries: [
        entry('app', null, 'folder', 'app', 'folder:app'),
        entry('index', 'app', 'file', 'index.html', 'automerge:shared'),
        ...Array.from({ length: 3 }, (_, index) =>
          entry(`copy-${index}`, 'app', 'file', `copy-${index}.bin`, 'automerge:shared')),
      ],
    }),
    byteLimit: 3,
    rootEntryId: 'app',
    openSource: () => shared,
  }), /too large/);
});

void test('filesystem authority changes during reads are retried before materialization', async () => {
  let entries = [
    entry('app', null, 'folder', 'app', 'folder:app'),
    entry('index', 'app', 'file', 'index.html', 'automerge:index'),
    entry('stale', 'app', 'file', 'stale.js', 'automerge:stale'),
  ];
  let revision = 0;
  const listeners = new Set<() => void>();
  const filesystem = createFsDatabaseSource({
    source: {
      sourceId: 'root:changing',
      snapshot: () => ({
        sourceId: 'root:changing',
        operationEpoch: 'root:changing:operations:1',
        basis: { incarnation: 'root:changing:1', revision },
        state: 'ready' as const,
        freshness: 'current' as const,
        storage: { entries },
        issues: [],
      }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    },
    project: (snapshot) => ({
      entries: snapshot.storage!.entries,
      occurrenceIds: snapshot.storage!.entries.map(({ entryId }) => entryId),
      completeness: 'exact',
      issues: [],
    }),
  });
  let opens = 0;
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
    openSource: ({ sourceId }) => {
      opens += 1;
      if (sourceId === 'automerge:stale') {
        entries = entries.filter(({ entryId }) => entryId !== 'stale');
        revision += 1;
        for (const listener of listeners) listener();
      }
      return contentSource(sourceId, [1]);
    },
  });

  assert.equal(opens, 3);
  assert.equal(result.state, 'ready');
  if (result.state === 'ready') assert.deepEqual(result.files.map(({ path }) => path), [['index.html']]);
});

const entry = (
  entryId: string,
  parentId: string | null,
  kind: FsEntry['kind'],
  name: string,
  resourceRef: string,
): FsEntry => ({ entryId, parentId, kind, name, resourceRef, order: 0 });

const fileSource = (input: {
  readonly sourceId: string;
  readonly content: QueryLogicalValue;
  readonly revision?: number;
  readonly freshness?: 'current' | 'stale';
}): OwnedDatabaseSource => {
  const { sourceId } = input;
  const snapshot: SourceSnapshot<{ readonly content: QueryLogicalValue }> = {
    sourceId,
    operationEpoch: `${sourceId}:operations:1`,
    basis: { incarnation: `${sourceId}:1`, revision: input.revision ?? 0 },
    state: 'ready',
    freshness: input.freshness ?? 'current',
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
              ? {
                  state: current.state === 'ready' ? 'failed' : current.state,
                  issues: current.issues,
                }
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
