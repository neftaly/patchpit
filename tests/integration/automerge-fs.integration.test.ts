import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import {
  commitFolderOperation,
  openFileDocumentTitleQuery,
  openFolderLinksQuery,
} from '@patchpit/fs';
import {
  createAutomergeFolderDocument,
  openAutomergeFileDatabase,
  openAutomergeFolderDatabase,
} from '@patchpit/automerge-fs';

void test('owned Automerge folders support relational rename, alias, and unlink', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create(createAutomergeFolderDocument('Root', [{
    linkId: 'readme',
    name: 'readme.md',
    order: 0,
    resourceRef: 'automerge:4hj6FJqozF7cLYqHi3FuK1SQhKc',
    typeHint: 'file',
  }]));
  const opened = await openAutomergeFolderDatabase(handle);
  assert.equal(opened.success, true);
  if (!opened.success) return;
  const folder = opened.value;
  const query = await openFolderLinksQuery([folder]);

  try {
    await commitFolderOperation(folder, {
      kind: 'folder.link.rename', linkId: 'readme', name: 'README.md',
    });
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
    assert.deepEqual(snapshot.current.rows.map(({ linkId, name }) => [linkId, name]), [
      ['readme-alias', 'guide.md'],
    ]);
    assert.deepEqual(handle.doc().docs.map(({ id, name }) => [id, name]), [
      ['readme-alias', 'guide.md'],
    ]);
  } finally {
    query.close();
    folder.close();
    await repo.shutdown();
  }
});

void test('foreign Patchwork folders project source-native link identity read-only', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create<object>({
    '@patchwork': { type: 'folder' },
    title: 'Foreign',
    docs: [{ name: 'readme.md', type: 'file', url: 'https://example.com/readme.md' }],
  });
  const opened = await openAutomergeFolderDatabase(handle);
  assert.equal(opened.success, true);
  if (!opened.success) return;
  const query = await openFolderLinksQuery([opened.value]);

  try {
    const snapshot = query.getSnapshot();
    assert.equal(snapshot.state, 'open');
    assert.equal(snapshot.current.rows[0]?.name, 'readme.md');
    assert.equal(typeof snapshot.current.rows[0]?.linkId, 'string');
  } finally {
    query.close();
    opened.value.close();
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
  const query = await openFileDocumentTitleQuery(opened.value);

  try {
    const snapshot = query.getSnapshot();
    assert.equal(snapshot.state, 'open');
    assert.equal(snapshot.current.readiness, 'ready');
    assert.deepEqual(snapshot.current.rows, [{ title: 'notes.txt' }]);
  } finally {
    query.close();
    opened.value.close();
    await repo.shutdown();
  }
});
