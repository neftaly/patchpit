import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import { mappedRelationRows } from '@tarstate/automerge';
import {
  commitFolderOperation,
  commitTextFileSplice,
  fileRelation,
  openFileDocumentTitlesQuery,
  openFolderLinksQuery,
} from '@patchpit/fs';
import {
  createAutomergeFolderDocument,
  createAutomergeTextFileDocument,
  openAutomergeFileDatabase,
  openAutomergeFolderDatabase,
} from '@patchpit/automerge-fs';

void test('owned text files commit basis-aware semantic splices', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createAutomergeTextFileDocument('Hello world', {
    name: 'notes.md',
    mimeType: 'text/markdown',
  }));
  const opened = await openAutomergeFileDatabase(handle, 'public');
  assert.equal(opened.success, true);
  if (!opened.success) return;
  const database = opened.value;

  try {
    const snapshot = database.getSnapshot();
    assert.equal(snapshot.state, 'open');
    if (snapshot.state !== 'open') return;
    assert.equal(snapshot.current.readiness, 'ready');
    assert.deepEqual(mappedRelationRows(snapshot.current, fileRelation), [{
      contentKind: 'text',
      textContent: 'Hello world',
      extension: 'md',
      mimeType: 'text/markdown',
      name: 'notes.md',
    }]);
    const relationCapabilities = database.capabilities(fileRelation);
    assert.deepEqual(relationCapabilities.keyFields, ['contentKind']);
    const capabilities = relationCapabilities.fields.textContent;
    assert.equal(capabilities?.replace, undefined);
    assert.deepEqual(capabilities?.textSplice, {
      concurrency: 'merge-captured-intent',
      dependentComposition: 'bounded-before-publish',
      indexUnit: 'utf16-code-unit',
    });
    const operation = {
      kind: 'file.text.splice',
      index: 6,
      deleteCount: 5,
      insert: 'Tarstate',
    } as const;
    const options = { observedBasis: snapshot.current.basis };
    handle.change((document) => {
      Automerge.splice(document, ['content'], document.content.length, 0, '!');
    });
    const receipt = await commitTextFileSplice(database, operation, options);
    assert.equal(receipt.outcome, 'committed');
    assert.equal(handle.doc().content, 'Hello Tarstate!');
  } finally {
    database.close();
    await repo.shutdown();
  }
});

void test('owned Automerge folders support relational rename, alias, and unlink', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createAutomergeFolderDocument('Root', [{
    linkId: 'readme',
    name: 'readme.md',
    order: 0,
    resourceRef: 'automerge:4hj6FJqozF7cLYqHi3FuK1SQhKc',
    typeHint: 'file',
  }]));
  handle.change((document) => {
    (document as Record<string, unknown>).fixtureExtension = { retained: true };
    (document.docs[0] as unknown as Record<string, unknown>).fixtureLinkExtension = 'retained';
  });
  const opened = await openAutomergeFolderDatabase(handle);
  assert.equal(opened.success, true);
  if (!opened.success) return;
  const folder = opened.value;
  const query = await openFolderLinksQuery([folder]);

  try {
    await commitFolderOperation(folder, {
      kind: 'folder.link.rename', linkId: 'readme', name: 'README.md',
    });
    assert.equal(
      (handle.doc().docs[0] as unknown as Record<string, unknown>).fixtureLinkExtension,
      'retained',
    );
    await commitFolderOperation(folder, {
      kind: 'folder.link.alias',
      link: {
        linkId: 'readme-alias',
        name: 'guide.md',
        resourceRef: 'automerge:4hj6FJqozF7cLYqHi3FuK1SQhKc',
        typeHint: 'file',
      },
    });
    await commitFolderOperation(folder, { kind: 'folder.link.unlink', linkId: 'readme' });
    const snapshot = query.getSnapshot();
    assert.equal(snapshot.state, 'open');
    assert.equal(snapshot.current.readiness, 'ready');
    assert.equal(snapshot.current.completeness, 'exact');
    assert.deepEqual(snapshot.current.rows.map(({ linkId, name }) => [linkId, name]), [
      ['readme-alias', 'guide.md'],
    ]);
    assert.deepEqual(handle.doc().docs.map(({ id, name }) => [id, name]), [
      ['readme-alias', 'guide.md'],
    ]);
    assert.equal(handle.doc()['@patchwork'].type, 'folder');
    assert.equal(
      (handle.doc() as unknown as { readonly fixtureExtension: { readonly retained: boolean } })
        .fixtureExtension.retained,
      true,
    );
  } finally {
    query.close();
    folder.close();
    await repo.shutdown();
  }
});

void test('focused foreign-file queries ignore conflicts in unobserved fields', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create<object>({
    '@patchwork': { type: 'file' },
    content: 'base',
    extension: 'txt',
    mimeType: 'text/plain',
    name: 'notes.txt',
  });
  const base = handle.doc() as Automerge.Doc<object>;
  const left = Automerge.change(
    Automerge.clone(base, { actor: '1'.repeat(64) }),
    (document) => { (document as { content: string }).content = 'left'; },
  );
  const right = Automerge.change(
    Automerge.clone(base, { actor: '2'.repeat(64) }),
    (document) => { (document as { content: string }).content = 'right'; },
  );
  handle.update(() => Automerge.merge(left, right));
  assert.notEqual(Automerge.getConflicts(handle.doc(), 'content'), undefined);

  const opened = await openAutomergeFileDatabase(handle, 'public');
  assert.equal(opened.success, true);
  if (!opened.success) return;
  const fullSnapshot = opened.value.getSnapshot();
  assert.equal(fullSnapshot.state, 'open');
  assert.equal(fullSnapshot.current.readiness, 'incomplete');
  const query = await openFileDocumentTitlesQuery([opened.value]);

  try {
    const snapshot = query.getSnapshot();
    assert.equal(snapshot.state, 'open');
    assert.equal(snapshot.current.readiness, 'ready');
    assert.deepEqual(snapshot.current.rows, [{ resourceRef: handle.url, title: 'notes.txt' }]);
  } finally {
    query.close();
    opened.value.close();
    await repo.shutdown();
  }
});
