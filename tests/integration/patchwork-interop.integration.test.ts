import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { isImmutableString, Repo } from '@automerge/automerge-repo';
import {
  commitFolderOperation,
  fileRelation,
  folderLinksRelation,
  openFileDocumentTitleQuery,
  openFolderDocumentTitleQuery,
  openFolderLinksQuery,
} from '@patchpit/fs';
import {
  openAutomergeFileDatabase,
  openAutomergeFolderDatabase,
  type AutomergeFolderDatabase,
} from '@patchpit/automerge-fs';
import compatibilityMatrix from '../fixtures/patchwork/compatibility.json' with { type: 'json' };
import fixtureManifest from '../fixtures/patchwork/manifest.json' with { type: 'json' };

const fixtureDirectory = 'tests/fixtures/patchwork';
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const openFixture = async (file: string) => {
  const bytes = await readFile(`${fixtureDirectory}/${file}`);
  const repo = new Repo({ network: [] });
  const handle = repo.create<object>();
  handle.update(() => Automerge.load<object>(bytes));
  return { handle, repo };
};

const inspectFolderFixture = async (
  file: string,
  inspect: (
    handle: Awaited<ReturnType<typeof openFixture>>['handle'],
    database: AutomergeFolderDatabase,
  ) => Promise<void>,
) => {
  const fixture = await openFixture(file);
  try {
    const opened = await openAutomergeFolderDatabase(fixture.handle);
    assert.equal(opened.success, true);
    if (!opened.success) return;
    try {
      await inspect(fixture.handle, opened.value);
    } finally {
      opened.value.close();
    }
  } finally {
    await fixture.repo.shutdown();
  }
};

void test('pinned Patchwork histories satisfy their claimed compatibility levels', async () => {
  assert.equal(compatibilityMatrix.formatVersion, 1);
  assert.equal(Object.keys(compatibilityMatrix.profiles).length, 3);
  for (const fixture of fixtureManifest.fixtures) {
    const bytes = await readFile(`${fixtureDirectory}/${fixture.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
  }

  const folderProfile = compatibilityMatrix.profiles['foreign-folder'];
  assert.deepEqual([
    folderProfile.identify,
    folderProfile.read,
    folderProfile.preserve,
    folderProfile.write,
    folderProfile.create,
  ], ['supported', 'exact', 'unknown-fields', 'partial', 'unsupported']);
  assert.deepEqual(folderProfile.operations, {
    rename: 'unsupported', unlink: 'supported', alias: 'unsupported',
  });
  assert.equal(folderProfile.upstreamReopen, 'supported');
  const folderFixture = folderProfile.fixtures[0];
  assert.ok(folderFixture);
  await inspectFolderFixture(folderFixture.file, async (handle, database) => {
    const query = await openFolderLinksQuery([database]);
    try {
      const snapshot = query.getSnapshot();
      assert.equal(snapshot.state, 'open');
      assert.deepEqual(snapshot.current.rows.map(({ name }) => name), [
        'notes.txt',
        'README.txt',
        'duplicate.data',
        'duplicate.data',
        'unavailable.data',
      ]);
      assert.equal(new Set(snapshot.current.rows.map(({ linkId }) => linkId)).size, 5);
      assert.equal(
        snapshot.current.rows[0]?.resourceRef,
        snapshot.current.rows[1]?.resourceRef,
      );
      const capabilities = database.capabilities(folderLinksRelation);
      assert.equal(capabilities.fields.name?.replace, undefined);
      const receipt = await commitFolderOperation(database, {
        kind: 'folder.link.rename',
        linkId: snapshot.current.rows[0]?.linkId ?? '',
        name: 'rejected.txt',
      });
      assert.equal(receipt.outcome, 'rejected');
      assert.equal(receipt.issues.some(({ details }) =>
        isRecord(details)
        && details.reason === 'field_replacement_unavailable'
        && details.field === 'name'), true);
      const aliasReceipt = await commitFolderOperation(database, {
        kind: 'folder.link.alias',
        link: { linkId: 'alias', name: 'alias.txt', resourceRef: 'https://example.com', typeHint: 'file' },
      });
      assert.equal(aliasReceipt.outcome, 'rejected');
      const document = handle.doc() as {
        readonly docs: readonly Record<string, unknown>[];
        readonly fixtureExtension: { readonly retained: boolean };
      };
      assert.equal(document.fixtureExtension.retained, true);
      assert.equal(document.docs[0]?.fixtureLinkExtension, 'retained');
      assert.equal(document.docs[0]?.name, 'notes.txt');
      const unlinkReceipt = await commitFolderOperation(database, {
        kind: 'folder.link.unlink', linkId: snapshot.current.rows[0]?.linkId ?? '',
      });
      assert.equal(unlinkReceipt.outcome, 'committed');
      const changedDocument = handle.doc() as typeof document;
      assert.equal(changedDocument.docs.length, 4);
      assert.equal(changedDocument.fixtureExtension.retained, true);
    } finally {
      query.close();
    }
  });

  const roundTripFixture = folderProfile.roundTrips[0];
  assert.deepEqual(roundTripFixture, {
    file: 'folder-after-patchpit-unlink.am',
    operation: 'unlink',
  });
  await inspectFolderFixture(roundTripFixture.file, async (handle, database) => {
    const roundTripQuery = await openFolderLinksQuery([database]);
    try {
      const snapshot = roundTripQuery.getSnapshot();
      assert.deepEqual(snapshot.state === 'open'
        ? snapshot.current.rows.map(({ name }) => name)
        : [], [
        'README.txt',
        'duplicate.data',
        'duplicate.data',
        'unavailable.data',
      ]);
      const roundTripDocument = handle.doc() as {
        readonly fixtureExtension: { readonly retained: boolean };
      };
      assert.equal(roundTripDocument.fixtureExtension.retained, true);
    } finally {
      roundTripQuery.close();
    }
  });

  const ownedFolderProfile = compatibilityMatrix.profiles['owned-folder'];
  assert.deepEqual([
    ownedFolderProfile.identify,
    ownedFolderProfile.read,
    ownedFolderProfile.preserve,
    ownedFolderProfile.write,
    ownedFolderProfile.create,
    ownedFolderProfile.upstreamReopen,
  ], ['supported', 'exact', 'unknown-fields', 'supported', 'supported', 'supported']);
  const ownedFolderFixture = ownedFolderProfile.fixtures[0];
  assert.ok(ownedFolderFixture);
  await inspectFolderFixture(ownedFolderFixture.file, async (handle, database) => {
    const ownedFolderQuery = await openFolderLinksQuery([database]);
    try {
      const snapshot = ownedFolderQuery.getSnapshot();
      assert.equal(snapshot.state, 'open');
      assert.deepEqual(snapshot.state === 'open'
        ? snapshot.current.rows.map(({ name }) => name)
        : [], ['notes.txt']);
      const document = handle.doc() as {
        readonly '@patchpit': { readonly type: string };
        readonly '@patchwork': { readonly type: string };
      };
      assert.equal(document['@patchwork'].type, 'folder');
      assert.equal(document['@patchpit'].type, 'folder');
    } finally {
      ownedFolderQuery.close();
    }
  });

  const renamedOwnedFolderFixture = ownedFolderProfile.roundTrips[0];
  assert.deepEqual(renamedOwnedFolderFixture, {
    file: 'patchpit-folder-after-patchwork-rename.am',
    operation: 'rename',
  });
  await inspectFolderFixture(renamedOwnedFolderFixture.file, async (handle, database) => {
    const titleQuery = await openFolderDocumentTitleQuery(database);
    try {
      const titleSnapshot = titleQuery.getSnapshot();
      assert.deepEqual(titleSnapshot.state === 'open' ? titleSnapshot.current.rows : [], [{
        title: 'Patchwork renamed folder',
      }]);
      const document = handle.doc() as {
        readonly '@patchpit': { readonly type: string };
      };
      assert.equal(document['@patchpit'].type, 'folder');
    } finally {
      titleQuery.close();
    }
  });

  const fileProfile = compatibilityMatrix.profiles['foreign-file'];
  assert.deepEqual([
    fileProfile.identify,
    fileProfile.read,
    fileProfile.preserve,
    fileProfile.write,
    fileProfile.create,
    fileProfile.upstreamReopen,
  ], ['supported', 'exact', 'not-exercised', 'read-only', 'unsupported', 'not-applicable']);
  for (const fileCase of fileProfile.fixtures) {
    const fixture = await openFixture(fileCase.file);
    const fileOpened = await openAutomergeFileDatabase(fixture.handle, 'public');
    assert.equal(fileOpened.success, true, fileCase.file);
    if (!fileOpened.success) {
      await fixture.repo.shutdown();
      continue;
    }
    const databaseSnapshot = fileOpened.value.getSnapshot();
    assert.equal(databaseSnapshot.state, 'open');
    if (databaseSnapshot.state === 'open') {
      assert.equal(databaseSnapshot.current.readiness, 'ready', fileCase.file);
      assert.equal(databaseSnapshot.current.completeness, 'exact', fileCase.file);
    }
    assert.equal(Object.values(fileOpened.value.capabilities(fileRelation).fields)
      .some(({ replace }) => replace !== undefined), false);
    const titleQuery = await openFileDocumentTitleQuery(fileOpened.value);
    try {
      const snapshot = titleQuery.getSnapshot();
      assert.equal(snapshot.state, 'open');
      assert.deepEqual(snapshot.current.rows, [{ title: fileCase.title }]);
      const content = (fixture.handle.doc() as { readonly content: unknown }).content;
      assert.equal(
        fileCase.content === 'binary'
          ? content instanceof Uint8Array
          : fileCase.content === 'immutable'
            ? isImmutableString(content)
            : typeof content === 'string',
        true,
      );
    } finally {
      titleQuery.close();
      fileOpened.value.close();
      await fixture.repo.shutdown();
    }
  }
});
