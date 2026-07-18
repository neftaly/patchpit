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
  openFolderLinksQuery,
} from '@patchpit/fs';
import {
  openAutomergeFileDatabase,
  openAutomergeFolderDatabase,
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

void test('pinned Patchwork histories satisfy their claimed compatibility levels', async () => {
  assert.equal(compatibilityMatrix.formatVersion, 1);
  assert.equal(Object.keys(compatibilityMatrix.profiles).length, 2);
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
  const folderFixture = folderProfile.fixtures[0];
  assert.ok(folderFixture);
  const { handle, repo } = await openFixture(folderFixture.file);
  const opened = await openAutomergeFolderDatabase(handle);
  assert.equal(opened.success, true);
  if (!opened.success) return;
  const query = await openFolderLinksQuery([opened.value]);

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
    const capabilities = opened.value.writeCapabilities(folderLinksRelation);
    assert.equal(capabilities.replaceableFields.includes('name'), false);
    const receipt = await commitFolderOperation(opened.value, {
      kind: 'folder.link.rename',
      linkId: snapshot.current.rows[0]?.linkId ?? '',
      name: 'rejected.txt',
    });
    assert.equal(receipt.outcome, 'rejected');
    assert.equal(receipt.issues.some(({ details }) =>
      isRecord(details)
      && details.reason === 'field_replacement_unavailable'
      && details.field === 'name'), true);
    const aliasReceipt = await commitFolderOperation(opened.value, {
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
    const unlinkReceipt = await commitFolderOperation(opened.value, {
      kind: 'folder.link.unlink', linkId: snapshot.current.rows[0]?.linkId ?? '',
    });
    assert.equal(unlinkReceipt.outcome, 'committed');
    const changedDocument = handle.doc() as typeof document;
    assert.equal(changedDocument.docs.length, 4);
    assert.equal(changedDocument.fixtureExtension.retained, true);
  } finally {
    query.close();
    opened.value.close();
    await repo.shutdown();
  }

  const fileProfile = compatibilityMatrix.profiles['foreign-file'];
  assert.deepEqual([
    fileProfile.identify,
    fileProfile.read,
    fileProfile.preserve,
    fileProfile.write,
    fileProfile.create,
  ], ['supported', 'exact', 'not-exercised', 'read-only', 'unsupported']);
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
    assert.deepEqual(fileOpened.value.writeCapabilities(fileRelation).replaceableFields, []);
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
