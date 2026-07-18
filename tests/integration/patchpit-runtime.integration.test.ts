import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { isValidAutomergeUrl, Repo, type AutomergeUrl } from '@automerge/automerge-repo';
import {
  automergeBinaryFileDocumentMetadata,
  createAutomergeBinaryFileDocument,
  type AutomergeBinaryFileDocument,
  type AutomergeFolderDocument,
} from '@patchpit/automerge-fs';
import { createRoot, openRoot } from '../../src/root/runtime.ts';

void test('Patchpit root reopens one live graph of Automerge folder documents', async () => {
  const repo = new Repo({ network: [] });
  const externalUrl = 'https://example.com/tiger.svg';
  const runtime = await createRoot({
    repo,
    initialContext: 'files.html',
    documentContextFolderId: 'sandbox-compat',
    folders: [{
      folderId: 'sandbox-compat',
      name: 'sandbox-compat',
      order: 1,
      files: [{
        bytes: new Uint8Array([60, 104, 49, 62]),
        contentType: 'text/html',
        linkId: 'index.html',
        name: 'index.html',
        order: 0,
      }, {
        linkId: 'tiger.svg',
        name: 'tiger.svg',
        order: 1,
        resourceUrl: externalUrl,
      }],
    }],
  });
  const rows = (await runtime.resourceQuery.whenSettled()).rows;
  const workspace = rows.find(({ linkId, sourceId }) =>
    linkId === 'workspace' && sourceId === runtime.rootUrl)!;
  const sandbox = rows.find(({ linkId, sourceId }) =>
    linkId === 'sandbox-compat' && sourceId === runtime.rootUrl)!;
  const index = rows.find(({ linkId, sourceId }) =>
    linkId === 'index.html' && sourceId === sandbox.resourceRef)!;
  const tiger = rows.find(({ linkId, sourceId }) =>
    linkId === 'tiger.svg' && sourceId === sandbox.resourceRef)!;

  assert.equal(isValidAutomergeUrl(runtime.rootUrl), true);
  assert.equal(isValidAutomergeUrl(workspace.resourceRef), true);
  assert.equal(isValidAutomergeUrl(sandbox.resourceRef), true);
  assert.equal(isValidAutomergeUrl(index.resourceRef), true);
  assert.equal(tiger.resourceRef, externalUrl);
  assert.equal(await runtime.resolveResourceDocument(externalUrl), undefined);

  const folderTitle = await runtime.openResourceTitle(sandbox.resourceRef);
  const fileTitle = await runtime.openResourceTitle(index.resourceRef);
  assert.deepEqual(folderTitle?.getSnapshot(), { state: 'ready', title: 'sandbox-compat' });
  assert.deepEqual(fileTitle?.getSnapshot(), { state: 'ready', title: 'index.html' });
  folderTitle?.close();
  fileTitle?.close();

  const contentHandle = (await runtime.resolveResourceDocument(index.resourceRef))!;
  const contentDocument = contentHandle.doc() as AutomergeBinaryFileDocument;
  assert.equal(contentDocument['@patchpit'].type, 'file');
  assert.deepEqual(contentDocument['@patchpit'].schema, automergeBinaryFileDocumentMetadata.schema);
  assert.equal(contentDocument['@patchwork'].type, 'file');
  assert.equal(contentDocument.name, 'index.html');
  assert.equal(contentDocument.mimeType, 'text/html');

  const folderHandle = await repo.find<AutomergeFolderDocument>(sandbox.resourceRef as AutomergeUrl);
  const addedHandle = repo.create(createAutomergeBinaryFileDocument(new Uint8Array([10]), { name: 'added.bin' }));
  folderHandle.change((doc) => {
    (doc.docs as unknown as MutableFolderLink[]).push({
      id: 'added', name: 'added.txt', type: 'file', url: addedHandle.url,
    });
  });
  assert.equal(await runtime.resolveResourceDocument(addedHandle.url), addedHandle);
  folderHandle.change((doc) => {
    const docs = doc.docs as unknown as MutableFolderLink[];
    const added = docs.findIndex(({ id }) => id === 'added');
    docs.splice(added, 1);
    const indexLink = docs.find(({ id }) => id === 'index.html');
    if (indexLink !== undefined) indexLink.name = 'main.html';
  });
  assert.equal(await runtime.resolveResourceDocument(addedHandle.url), undefined);

  await runtime.workspaceRuntime.commitOperation({
    kind: 'workspace.context.pin',
    contextId: 'notes',
    url: 'viewer.html#{"resourceRef":"notes"}',
    targetPaneId: 'right',
    beforeContext: null,
  });
  runtime.close();

  const reopened = await openRoot({ repo, rootUrl: runtime.rootUrl });
  const reopenedRows = (await reopened.resourceQuery.whenSettled()).rows;
  assert.equal(reopenedRows.find(({ linkId }) => linkId === index.linkId)?.name, 'main.html');
  const workspaceProjection = reopened.workspaceRuntime.getSnapshot();
  assert.equal(workspaceProjection.state, 'ready');
  if (workspaceProjection.state === 'ready') {
    const right = workspaceProjection.workspace.nodes.right;
    assert.equal(right?.kind === 'pane' && right.contexts.includes('notes'), true);
  }
  reopened.close();
  await repo.shutdown();
});

type MutableFolderLink = {
  id: string;
  name: string;
  type: string;
  url: string;
};

void test('Patchpit runtime snapshots valid app bytes and retains invalid content evidence', async () => {
  const repo = new Repo({ network: [] });
  const runtime = await createRoot({
    repo,
    initialContext: 'files.html',
    folders: [{
      folderId: 'sandbox-compat',
      name: 'sandbox-compat',
      order: 1,
      files: [{
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'application/octet-stream',
        linkId: 'index.html',
        name: 'index.html',
        order: 0,
      }],
    }],
  });
  const rows = (await runtime.resourceQuery.whenSettled()).rows;
  const folderRef = rows.find(({ linkId, sourceId }) =>
    linkId === 'sandbox-compat' && sourceId === runtime.rootUrl)!.resourceRef;
  const resourceRef = rows.find(({ linkId, sourceId }) =>
    linkId === 'index.html' && sourceId === folderRef)!.resourceRef;
  const ready = await runtime.createAppSnapshot(folderRef);
  assert.equal(ready.state, 'ready', JSON.stringify(ready));
  if (ready.state === 'ready') {
    assert.deepEqual([...new Uint8Array(await ready.files[0]!.body.arrayBuffer())], [1, 2, 3]);
  }

  runtime.close();
  const reopened = await openRoot({ repo, rootUrl: runtime.rootUrl });
  assert.equal((await reopened.createAppSnapshot(folderRef)).state, 'ready');
  const handle = (await reopened.resolveResourceDocument(resourceRef))!;
  const base = handle.doc() as Automerge.Doc<AutomergeBinaryFileDocument>;
  const left = Automerge.change(
    Automerge.clone(base, { actor: '6'.repeat(64) }),
    (doc) => { (doc as { content: Uint8Array }).content = new Uint8Array([4]); },
  );
  const right = Automerge.change(
    Automerge.clone(base, { actor: '7'.repeat(64) }),
    (doc) => { (doc as { content: Uint8Array }).content = new Uint8Array([5]); },
  );
  handle.update(() => Automerge.merge(left, right) as Automerge.Doc<object>);
  assert.equal((await reopened.createAppSnapshot(folderRef)).state, 'invalid');

  reopened.close();
  await repo.shutdown();
});
