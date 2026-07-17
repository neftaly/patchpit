import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStaticFolderDatabaseSource,
  openFolderGraphQuery,
  openFolderLinksQuery,
} from '@patchpit/fs';

void test('folder links keep source-scoped identities when placement names repeat', async () => {
  const query = await openFolderLinksQuery([
    createStaticFolderDatabaseSource({
      sourceId: 'personal',
      title: 'Personal',
      links: [{ linkId: 'readme', name: 'readme.md', order: 0, resourceRef: 'content:personal', typeHint: 'file' }],
    }),
    createStaticFolderDatabaseSource({
      sourceId: 'shared',
      title: 'Shared',
      links: [
        { linkId: 'readme', name: 'readme.md', order: 0, resourceRef: 'content:shared', typeHint: 'file' },
        { linkId: 'copy', name: 'copy.md', order: 1, resourceRef: 'content:shared', typeHint: 'file' },
        { linkId: 'other', name: 'readme.md', order: 2, resourceRef: 'content:other', typeHint: 'file' },
      ],
    }),
  ]);

  try {
    const snapshot = query.getSnapshot();
    assert.equal(snapshot.state, 'open');
    assert.deepEqual(
      [...snapshot.current.rows].sort((left, right) =>
        left.sourceId.localeCompare(right.sourceId) || left.linkId.localeCompare(right.linkId)),
      [
        { linkId: 'readme', name: 'readme.md', order: 0, resourceRef: 'content:personal', sourceId: 'personal', typeHint: 'file' },
        { linkId: 'copy', name: 'copy.md', order: 1, resourceRef: 'content:shared', sourceId: 'shared', typeHint: 'file' },
        { linkId: 'other', name: 'readme.md', order: 2, resourceRef: 'content:other', sourceId: 'shared', typeHint: 'file' },
        { linkId: 'readme', name: 'readme.md', order: 0, resourceRef: 'content:shared', sourceId: 'shared', typeHint: 'file' },
      ],
    );
    assert.equal(new Set(snapshot.current.resultKeys).size, 4);
  } finally {
    query.close();
  }
});

void test('folder graph discovers nested folder documents without following file links', async () => {
  const nested = createStaticFolderDatabaseSource({
    sourceId: 'folder:nested',
    title: 'Nested',
    links: [{ linkId: 'icon', name: 'icon.svg', order: 0, resourceRef: 'content:icon', typeHint: 'file' }],
  });
  const root = createStaticFolderDatabaseSource({
    sourceId: 'folder:root',
    title: 'Root',
    links: [
      { linkId: 'nested', name: 'assets', order: 0, resourceRef: 'folder:nested', typeHint: 'folder' },
      { linkId: 'outside', name: 'outside.txt', order: 1, resourceRef: 'content:outside', typeHint: 'file' },
    ],
  });
  const query = await openFolderGraphQuery({
    root,
    openSource: ({ sourceId }) => sourceId === 'folder:nested'
      ? Object.assign(nested, { close: () => undefined })
      : undefined,
  });

  try {
    const snapshot = await query.whenSettled();
    assert.equal(snapshot.readiness, 'ready');
    assert.equal(snapshot.completeness, 'exact');
    assert.deepEqual(snapshot.rows.map(({ linkId, sourceId }) => [linkId, sourceId]), [
      ['icon', 'folder:nested'],
      ['nested', 'folder:root'],
      ['outside', 'folder:root'],
    ]);
  } finally {
    query.close();
  }
});
