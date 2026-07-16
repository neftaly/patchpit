import assert from 'node:assert/strict';
import test from 'node:test';
import { Repo } from '@automerge/automerge-repo';
import { commitFolderOperation, openFolderLinksQuery } from '@patchpit/fs';
import {
  createAutomergeFolderDocument,
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
