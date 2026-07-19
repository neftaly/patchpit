import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { isValidAutomergeUrl, Repo, type AutomergeUrl } from '@automerge/automerge-repo';
import {
  automergeBinaryFileDocumentMetadata,
  automergeTextFileDocumentMetadata,
  createAutomergeBinaryFileDocument,
  type AutomergeBinaryFileDocument,
  type AutomergeFolderDocument,
  type AutomergeTextFileDocument,
} from '@patchpit/automerge-fs';
import { projectResourceFileView } from '../../src/content/resource-file-view.ts';
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
        contentType: 'text/markdown',
        linkId: 'demo.md',
        name: 'demo.md',
        order: 1,
        text: '# Demo',
      }, {
        linkId: 'tiger.svg',
        name: 'tiger.svg',
        order: 2,
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
  const demo = rows.find(({ linkId, sourceId }) =>
    linkId === 'demo.md' && sourceId === sandbox.resourceRef)!;
  const tiger = rows.find(({ linkId, sourceId }) =>
    linkId === 'tiger.svg' && sourceId === sandbox.resourceRef)!;

  assert.equal(isValidAutomergeUrl(runtime.rootUrl), true);
  assert.equal(isValidAutomergeUrl(workspace.resourceRef), true);
  assert.equal(isValidAutomergeUrl(sandbox.resourceRef), true);
  assert.equal(isValidAutomergeUrl(index.resourceRef), true);
  assert.equal(tiger.resourceRef, externalUrl);
  assert.equal(await runtime.resolveResourceDocument(externalUrl), undefined);

  const titles = await runtime.openResourceTitles([sandbox.resourceRef, index.resourceRef]);
  assert.deepEqual(titles?.getSnapshot(), new Map([
    [sandbox.resourceRef, 'sandbox-compat'],
    [index.resourceRef, 'index.html'],
  ]));
  titles?.close();

  const contentHandle = (await runtime.resolveResourceDocument(index.resourceRef))!;
  const contentDocument = contentHandle.doc() as AutomergeBinaryFileDocument;
  assert.equal(contentDocument['@patchpit'].type, 'file');
  assert.deepEqual(contentDocument['@patchpit'].schema, automergeBinaryFileDocumentMetadata.schema);
  assert.equal(contentDocument['@patchwork'].type, 'file');
  assert.equal(contentDocument.name, 'index.html');
  assert.equal(contentDocument.mimeType, 'text/html');

  const indexFileResult = await runtime.openResourceFileQuery(index.resourceRef);
  assert.equal(indexFileResult.state, 'ready');
  if (indexFileResult.state !== 'ready') return;
  const indexFile = indexFileResult.query;
  await indexFile.whenSettled();
  assert.deepEqual(projectResourceFileView(indexFile.getSnapshot()), {
    content: '<h1>',
    state: 'ready',
  });
  indexFile.close();

  const demoHandle = (await runtime.resolveResourceDocument(demo.resourceRef))!;
  const demoDocument = demoHandle.doc() as AutomergeTextFileDocument;
  assert.deepEqual(demoDocument['@patchpit'].schema, automergeTextFileDocumentMetadata.schema);
  assert.equal(demoDocument.content, '# Demo');
  assert.equal(demoDocument.mimeType, 'text/markdown');

  const demoFileResult = await runtime.openResourceFileQuery(demo.resourceRef);
  assert.equal(demoFileResult.state, 'ready');
  if (demoFileResult.state !== 'ready') return;
  const demoFile = demoFileResult.query;
  const projectedDemo = await demoFile.whenSettled();
  assert.equal(projectedDemo.readiness, 'ready');
  assert.equal(projectedDemo.completeness, 'exact');
  assert.equal(projectedDemo.freshness, 'current');
  assert.deepEqual(projectedDemo.rows, [{
    contentKind: 'text',
    extension: 'md',
    mimeType: 'text/markdown',
    name: 'demo.md',
    textContent: '# Demo',
  }]);
  const projectedUpdate = new Promise<void>((resolve) => {
    const unsubscribe = demoFile.subscribe(() => {
      const snapshot = demoFile.getSnapshot();
      if (snapshot.state === 'open' && snapshot.current.rows[0]?.textContent === '# Tumeke') {
        unsubscribe();
        resolve();
      }
    });
  });
  demoHandle.change((document) => {
    (document as { content: string }).content = '# Tumeke';
  });
  await projectedUpdate;
  demoFile.close();

  const abandonedOpen = new AbortController();
  const abandonedSession = runtime.openAppTextDocument(
    sandbox.resourceRef,
    ['demo.md'],
    abandonedOpen.signal,
  );
  abandonedOpen.abort();
  const survivingSession = runtime.openAppTextDocument(sandbox.resourceRef, ['demo.md']);
  await assert.rejects(abandonedSession, { name: 'AbortError' });
  const editorSession = await survivingSession;
  assert.equal(editorSession.getSnapshot().state, 'ready');
  editorSession.close();

  const folderHandle = await repo.find<AutomergeFolderDocument>(sandbox.resourceRef as AutomergeUrl);
  const addedHandle = repo.create(createAutomergeBinaryFileDocument(new Uint8Array([10]), { name: 'added.bin' }));
  folderHandle.change((doc) => {
    (doc.docs as unknown as MutableFolderLink[]).push({
      id: 'added', name: 'added.txt', type: 'file', url: addedHandle.url,
    });
  });
  assert.equal(await runtime.resolveResourceDocument(addedHandle.url), addedHandle);
  const invalidHandle = repo.create({ '@patchpit': { type: 'file' } });
  folderHandle.change((doc) => {
    (doc.docs as unknown as MutableFolderLink[]).push({
      id: 'invalid', name: 'invalid.txt', type: 'file', url: invalidHandle.url,
    });
  });
  assert.equal((await runtime.openResourceFileQuery(invalidHandle.url)).state, 'invalid');
  folderHandle.change((doc) => {
    const docs = doc.docs as unknown as MutableFolderLink[];
    const added = docs.findIndex(({ id }) => id === 'added');
    docs.splice(added, 1);
    const invalid = docs.findIndex(({ id }) => id === 'invalid');
    docs.splice(invalid, 1);
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
  const conflictedFile = await reopened.openResourceFileQuery(resourceRef);
  assert.equal(conflictedFile.state, 'ready');
  if (conflictedFile.state === 'ready') {
    assert.notEqual((await conflictedFile.query.whenSettled()).readiness, 'ready');
    conflictedFile.query.close();
  }

  reopened.close();
  await repo.shutdown();
});

void test('Patchpit copies file history and relocates links through explicit source sequences', async () => {
  const repo = new Repo({ network: [] });
  const runtime = await createRoot({
    repo,
    initialContext: 'files.html',
    folders: [{
      folderId: 'source-folder',
      name: 'source',
      order: 1,
      files: [{
        contentType: 'text/markdown',
        linkId: 'notes',
        name: 'notes.md',
        order: 0,
        text: '# Notes',
      }],
    }, {
      folderId: 'destination-folder',
      name: 'destination',
      order: 2,
      files: [],
    }],
  });
  try {
    const initial = await runtime.resourceQuery.whenSettled();
    const sourceFolder = initial.rows.find(({ linkId, sourceId }) =>
      linkId === 'source-folder' && sourceId === runtime.rootUrl)!;
    const destinationFolder = initial.rows.find(({ linkId, sourceId }) =>
      linkId === 'destination-folder' && sourceId === runtime.rootUrl)!;
    const notes = initial.rows.find(({ linkId, sourceId }) =>
      linkId === 'notes' && sourceId === sourceFolder.resourceRef)!;
    const notesHandle = (await runtime.resolveResourceDocument(notes.resourceRef))!;
    notesHandle.change((document) => {
      (document as Record<string, unknown>).unknownExtension = { retained: true };
    });

    const relocation = {
      destinationLinkId: 'relocated-notes',
      destinationSourceId: destinationFolder.resourceRef,
      source: notes,
      transferId: crypto.randomUUID(),
    };
    const relocated = await runtime.relocateResource(relocation);
    assert.equal(relocated.state, 'complete', JSON.stringify(relocated));
    const relocationRetry = await runtime.relocateResource(relocation);
    assert.equal(relocationRetry.state, 'complete', JSON.stringify(relocationRetry));
    const afterRelocation = await runtime.resourceQuery.whenSettled();
    assert.equal(afterRelocation.rows.some(({ linkId, sourceId }) =>
      linkId === notes.linkId && sourceId === sourceFolder.resourceRef), false);
    const relocatedLink = afterRelocation.rows.find(({ linkId, sourceId }) =>
      linkId === relocation.destinationLinkId && sourceId === destinationFolder.resourceRef)!;
    assert.equal(relocatedLink.resourceRef, notes.resourceRef);

    const prepared = await runtime.prepareResourceCopy({
      destinationLinkId: 'copied-notes',
      destinationSourceId: sourceFolder.resourceRef,
      source: relocatedLink,
      transferId: crypto.randomUUID(),
    });
    assert.equal(prepared.state, 'ready', JSON.stringify(prepared));
    if (prepared.state !== 'ready') return;
    const copied = await runtime.copyResource(prepared.intent);
    assert.equal(copied.state, 'complete', JSON.stringify(copied));
    const copyRetry = await runtime.copyResource(prepared.intent);
    assert.equal(copyRetry.state, 'complete', JSON.stringify(copyRetry));
    const afterCopy = await runtime.resourceQuery.whenSettled();
    const copyLinks = afterCopy.rows.filter(({ linkId, sourceId }) =>
      linkId === prepared.intent.destinationLinkId && sourceId === sourceFolder.resourceRef);
    assert.equal(copyLinks.length, 1);
    const copyLink = copyLinks[0]!;
    assert.notEqual(copyLink.resourceRef, notes.resourceRef);
    assert.equal(copyLink.copyOf, notes.resourceRef);
    const copiedHandle = (await runtime.resolveResourceDocument(copyLink.resourceRef))!;
    const copiedDocument = copiedHandle.doc() as Record<string, unknown>;
    assert.deepEqual(copiedDocument.unknownExtension, { retained: true });
    assert.equal(copiedDocument.content, '# Notes');

    const colliding = await runtime.prepareResourceCopy({
      destinationLinkId: prepared.intent.destinationLinkId,
      destinationSourceId: sourceFolder.resourceRef,
      source: relocatedLink,
      transferId: crypto.randomUUID(),
    });
    assert.equal(colliding.state, 'ready', JSON.stringify(colliding));
    if (colliding.state === 'ready') {
      const partial = await runtime.copyResource(colliding.intent);
      assert.equal(partial.state, 'partial', JSON.stringify(partial));
      if (partial.state === 'partial') {
        assert.equal(partial.receipt.orphanedSourceIds.length, 1);
        assert.equal(partial.receipt.steps[1]?.outcome, 'failed');
      }
    }
    const concurrentLifecycle = await openRoot({ repo, rootUrl: runtime.rootUrl });
    try {
      const expired = await concurrentLifecycle.copyResource(prepared.intent);
      assert.equal(expired.state, 'blocked');
      if (expired.state === 'blocked') assert.equal(expired.reason, 'operation-expired');
    } finally {
      concurrentLifecycle.close();
    }
  } finally {
    runtime.close();
    await repo.shutdown();
  }
});
