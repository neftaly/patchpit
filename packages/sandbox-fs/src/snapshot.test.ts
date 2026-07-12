import assert from 'node:assert/strict';
import test from 'node:test';
import { createFsAttachment, staticFsAttachment, type FsEntry } from '@patchpit/fs';
import type { SourceSnapshot } from '@tarstate/core';
import {
  snapshotFilesystemApp,
  type AppFileContent,
} from './snapshot.ts';

const content = (
  sourceId: string,
  bytes: ArrayLike<number>,
  revision = 0,
  freshness: 'current' | 'stale' = 'current',
): SourceSnapshot<AppFileContent> => ({
  sourceId,
  operationEpoch: `${sourceId}:operations:1`,
  basis: { incarnation: `${sourceId}:1`, revision },
  state: 'ready',
  freshness,
  storage: { bytes: Uint8Array.from(bytes), contentType: 'text/plain', kind: 'patchpit.file-content@1' },
  issues: [],
});

void test('app snapshot is exact, immutable, basis-bearing, and root-relative', async () => {
  const filesystem = staticFsAttachment({
    sourceId: 'root',
    entries: [
      entry('app', null, 'folder', 'app', 'folder:app'),
      entry('index', 'app', 'file', 'index.html', 'automerge:index'),
      entry('assets', 'app', 'folder', 'assets', 'folder:assets'),
      entry('icon', 'assets', 'file', 'icon.svg', 'automerge:icon'),
      entry('outside', null, 'file', 'outside.txt', 'automerge:outside'),
    ],
  });
  const reads = new Map([
    ['automerge:index', content('automerge:index', [1, 2], 2)],
    ['automerge:icon', content('automerge:icon', [3], 4)],
  ]);
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
    read: async (ref) => reads.get(ref)!,
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
  const filesystem = staticFsAttachment({
    sourceId: 'root',
    entries: [
      entry('app', null, 'folder', 'app', 'folder:app'),
      entry('remote', 'app', 'file', 'remote.js', 'https://example.test/remote.js'),
    ],
  });
  let reads = 0;
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
    read: async () => {
      reads += 1;
      throw new Error('must not fetch');
    },
  });

  assert.equal(reads, 0);
  assert.equal(result.state, 'incomplete');
  assert.equal(result.completeness, 'unknown');
});

void test('exact stale content cannot launch', async () => {
  const result = await snapshotFilesystemApp({
    filesystem: staticFsAttachment({
      sourceId: 'root',
      entries: [
        entry('app', null, 'folder', 'app', 'folder:app'),
        entry('index', 'app', 'file', 'index.html', 'automerge:index'),
      ],
    }),
    rootEntryId: 'app',
    read: async () => content('automerge:index', [1], 0, 'stale'),
  });

  assert.equal(result.state, 'incomplete');
  assert.equal(result.completeness, 'exact');
});

void test('invalid content from a ready source invalidates the app snapshot', async () => {
  const filesystem = staticFsAttachment({
    sourceId: 'root',
    entries: [
      entry('app', null, 'folder', 'app', 'folder:app'),
      entry('bad', 'app', 'file', 'bad.js', 'automerge:bad'),
    ],
  });
  const invalid = {
    ...content('automerge:bad', []),
    storage: { bytes: [1, 2, 3] },
  } as unknown as SourceSnapshot<AppFileContent>;
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
    read: async () => invalid,
  });

  assert.equal(result.state, 'invalid');
  assert.equal(result.completeness, 'unknown');
});

void test('snapshot byte bound counts repeated content at every mounted path', async () => {
  const shared = content('automerge:shared', new Uint8Array(65 * 1024 * 1024));
  await assert.rejects(() => snapshotFilesystemApp({
    filesystem: staticFsAttachment({
      sourceId: 'root',
      entries: [
        entry('app', null, 'folder', 'app', 'folder:app'),
        ...Array.from({ length: 4 }, (_, index) =>
          entry(`copy-${index}`, 'app', 'file', `copy-${index}.bin`, 'automerge:shared')),
      ],
    }),
    rootEntryId: 'app',
    read: async () => shared,
  }), /too large/);
});

void test('filesystem authority changes during reads are retried before materialization', async () => {
  let entries = [
    entry('app', null, 'folder', 'app', 'folder:app'),
    entry('stale', 'app', 'file', 'stale.js', 'automerge:stale'),
  ];
  let revision = 0;
  const listeners = new Set<() => void>();
  const filesystem = createFsAttachment({
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
  let reads = 0;
  const result = await snapshotFilesystemApp({
    filesystem,
    rootEntryId: 'app',
    read: async () => {
      reads += 1;
      entries = entries.filter(({ entryId }) => entryId !== 'stale');
      revision += 1;
      for (const listener of listeners) listener();
      return content('automerge:stale', [1]);
    },
  });

  assert.equal(reads, 1);
  assert.equal(result.state, 'ready');
  if (result.state === 'ready') assert.deepEqual(result.files, []);
});

void test('nested app snapshot behavior fuzz remains inside the selected root', async () => {
  for (let depth = 1; depth <= 12; depth += 1) {
    const entries: FsEntry[] = [entry('app', null, 'folder', 'app', 'folder:app')];
    let parent = 'app';
    for (let index = 0; index < depth; index += 1) {
      const folder = `folder-${index}`;
      entries.push(entry(folder, parent, 'folder', `d${index}`, `folder:${index}`));
      parent = folder;
    }
    entries.push(entry('leaf', parent, 'file', 'leaf.txt', 'automerge:leaf'));
    entries.push(entry('outside', null, 'file', 'outside.txt', 'automerge:outside'));
    const result = await snapshotFilesystemApp({
      filesystem: staticFsAttachment({ sourceId: `root:${depth}`, entries }),
      rootEntryId: 'app',
      read: async () => content('automerge:leaf', [depth], depth),
    });
    assert.equal(result.state, 'ready');
    if (result.state !== 'ready') continue;
    assert.deepEqual(result.files[0]!.path, [
      ...Array.from({ length: depth }, (_, index) => `d${index}`),
      'leaf.txt',
    ]);
    assert.deepEqual([...new Uint8Array(await result.files[0]!.body.arrayBuffer())], [depth]);
  }
});

const entry = (
  entryId: string,
  parentId: string | null,
  kind: FsEntry['kind'],
  name: string,
  resourceRef: string,
): FsEntry => ({ entryId, parentId, kind, name, resourceRef, order: 0 });
