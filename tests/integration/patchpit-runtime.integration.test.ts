import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { isValidAutomergeUrl, Repo } from '@automerge/automerge-repo';
import {
  automergeBinaryFileDocumentMetadata,
  createAutomergeBinaryFileDocument,
  type AutomergeBinaryFileDocument,
  type AutomergeFsDocument,
} from '@patchpit/automerge-fs';
import { createRoot, openRoot } from '../../src/root/runtime.ts';

void test('Patchpit root reopens one live Automerge document tree', async () => {
  const repo = new Repo({ network: [] });
  const externalUrl = 'https://example.com/tiger.svg';
  const runtime = await createRoot({
    repo,
    initialContext: 'files.html',
    documentContext: 'sandbox-compat/index.html',
    folders: [{
      entryId: 'sandbox-compat',
      name: 'sandbox-compat',
      order: 1,
      files: [{
        bytes: new Uint8Array([60, 104, 49, 62]),
        contentType: 'text/html',
        entryId: 'index.html',
        name: 'index.html',
        order: 0,
      }, {
        entryId: 'tiger.svg',
        name: 'tiger.svg',
        order: 1,
        resourceUrl: externalUrl,
      }],
    }],
  });
  const rootHandle = await repo.find<AutomergeFsDocument>(runtime.rootUrl);
  const resourceSnapshot = runtime.resourceQuery.getSnapshot();
  assert.equal(resourceSnapshot.state, 'open');
  const rows = resourceSnapshot.current.rows;
  const workspace = rows.find(({ entryId }) => entryId === 'workspace')!;
  const sandbox = rows.find(({ entryId }) => entryId === 'sandbox-compat')!;
  const index = rows.find(({ entryId }) => entryId === 'sandbox-compat:index.html')!;
  const tiger = rows.find(({ entryId }) => entryId === 'sandbox-compat:tiger.svg')!;

  assert.equal(isValidAutomergeUrl(runtime.rootUrl), true);
  assert.equal(isValidAutomergeUrl(workspace.resourceRef), true);
  assert.equal(isValidAutomergeUrl(index.resourceRef), true);
  assert.deepEqual([sandbox.parentId, index.parentId, tiger.parentId], [null, sandbox.entryId, sandbox.entryId]);
  assert.equal(sandbox.resourceRef, runtime.rootUrl);
  assert.equal(tiger.resourceRef, externalUrl);
  assert.equal(await runtime.resolveResourceDocument(externalUrl), undefined);

  const contentHandle = (await runtime.resolveResourceDocument(index.resourceRef))!;
  const contentDocument = contentHandle.doc() as AutomergeBinaryFileDocument;
  assert.equal(contentDocument['@patchpit'].type, 'file');
  assert.deepEqual(contentDocument['@patchpit'].schema, automergeBinaryFileDocumentMetadata.schema);
  assert.equal(contentDocument['@patchwork'].type, 'file');
  assert.equal(contentDocument.name, 'index.html');
  assert.equal(contentDocument.extension, 'html');
  assert.equal(contentDocument.mimeType, 'text/html');
  assert.deepEqual(contentDocument.content, new Uint8Array([60, 104, 49, 62]));
  contentHandle.change((doc) => {
    (doc as unknown as { content: Uint8Array }).content = new Uint8Array([7, 8]);
  });
  assert.deepEqual(
    ((await runtime.resolveResourceDocument(index.resourceRef))!.doc() as AutomergeBinaryFileDocument).content,
    new Uint8Array([7, 8]),
  );

  const addedHandle = repo.create(createAutomergeBinaryFileDocument(
    new Uint8Array([10]),
    { name: 'added.bin' },
  ));
  rootHandle.change((doc) => {
    doc.entries.added = {
      kind: 'file',
      name: 'added.txt',
      order: 2,
      parentId: null,
      resourceRef: addedHandle.url,
    };
  });
  assert.equal(await runtime.resolveResourceDocument(addedHandle.url), addedHandle);
  rootHandle.change((doc) => { delete doc.entries.added; });
  assert.equal(await runtime.resolveResourceDocument(addedHandle.url), undefined);

  rootHandle.change((doc) => {
    (doc.entries['sandbox-compat:index.html'] as { name: string }).name = 'main.html';
    (doc.entries.workspace as { name: string; parentId: string | null }).name = 'session.am';
    (doc.entries.workspace as { name: string; parentId: string | null }).parentId = 'sandbox-compat';
    (doc.entries['sandbox-compat'] as { name: string }).name = 'apps';
  });
  const renamedSnapshot = runtime.resourceQuery.getSnapshot();
  assert.equal(renamedSnapshot.state, 'open');
  if (renamedSnapshot.state !== 'open') throw new Error('Resource query closed');
  assert.equal(renamedSnapshot.current.rows
    .find(({ entryId }) => entryId === index.entryId)?.name, 'main.html');
  await runtime.workspaceRuntime.commitOperation({
    kind: 'workspace.context.pin',
    contextId: 'notes',
    url: 'viewer.html#{"entryId":"notes"}',
    targetPaneId: 'right',
    beforeContext: null,
  });

  runtime.close();
  assert.equal(await runtime.resolveResourceDocument(index.resourceRef), undefined);
  assert.equal(rootHandle.isReady(), true);
  assert.equal(contentHandle.isReady(), true);
  contentHandle.change((doc) => {
    (doc as unknown as { content: Uint8Array }).content = new Uint8Array([9]);
  });

  const reopened = await openRoot({ repo, rootUrl: runtime.rootUrl });
  const reopenedSnapshot = reopened.resourceQuery.getSnapshot();
  assert.equal(reopenedSnapshot.state, 'open');
  if (reopenedSnapshot.state !== 'open') throw new Error('Resource query closed');
  assert.equal(reopenedSnapshot.current.rows
    .find(({ entryId }) => entryId === index.entryId)?.name, 'main.html');
  assert.equal(reopenedSnapshot.current.rows
    .find(({ entryId }) => entryId === workspace.entryId)?.name, 'session.am');
  assert.deepEqual(
    ((await reopened.resolveResourceDocument(index.resourceRef))!.doc() as AutomergeBinaryFileDocument).content,
    new Uint8Array([9]),
  );
  const workspaceProjection = reopened.workspaceRuntime.getSnapshot();
  assert.equal(workspaceProjection.state, 'ready');
  if (workspaceProjection.state !== 'ready') throw new Error('Workspace projection is unavailable');
  const right = workspaceProjection.workspace.nodes.right;
  assert.equal(right?.kind === 'pane' && right.contexts.includes('notes'), true);

  reopened.close();
  assert.equal(rootHandle.isReady(), true);
  rootHandle.change((doc) => {
    const metadata = doc['@patchpit'] as unknown as {
      schemas: Record<string, { body: { relations: object } }>;
    };
    metadata.schemas[doc['@patchpit'].schema.id]!.body.relations = {};
  });
  await assert.rejects(
    openRoot({ repo, rootUrl: runtime.rootUrl }),
    /filesystem attachment is unavailable/,
  );
  await repo.shutdown();
});

void test('Patchpit runtime snapshots valid app bytes and preserves invalid content evidence', async () => {
  const repo = new Repo({ network: [] });
  const runtime = await createRoot({
    repo,
    initialContext: 'files.html',
    folders: [{
      entryId: 'sandbox-compat',
      name: 'sandbox-compat',
      order: 1,
      files: [{
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'application/octet-stream',
        entryId: 'index.html',
        name: 'index.html',
        order: 0,
      }],
    }],
  });
  const ready = await runtime.createAppSnapshot('sandbox-compat');
  assert.equal(ready.state, 'ready');
  if (ready.state !== 'ready') throw new Error('Expected ready app snapshot');
  assert.deepEqual(
    [...new Uint8Array(await ready.files[0]!.body.arrayBuffer())],
    [1, 2, 3],
  );

  const resources = runtime.resourceQuery.getSnapshot();
  assert.equal(resources.state, 'open');
  if (resources.state !== 'open') throw new Error('Resource query closed');
  const resourceRef = resources.current.rows.find(({ entryId }) =>
    entryId === 'sandbox-compat:index.html')!.resourceRef;
  const handle = (await runtime.resolveResourceDocument(resourceRef))!;
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
  const conflictedSnapshot = await runtime.createAppSnapshot('sandbox-compat');
  assert.equal(conflictedSnapshot.state, 'invalid');

  handle.change((doc) => {
    (doc as unknown as { content: unknown }).content = [4, 5];
  });
  assert.equal((await runtime.createAppSnapshot('sandbox-compat')).state, 'invalid');
  handle.change((doc) => {
    (doc as unknown as { content: Uint8Array }).content = new Uint8Array([6]);
  });

  const foreign = repo.create({
    '@patchwork': { type: 'file' },
    content: new Automerge.ImmutableString('<h1>foreign</h1>'),
    extension: 'html',
    mimeType: 'text/html',
    name: 'foreign.html',
  });
  const root = await repo.find<AutomergeFsDocument>(runtime.rootUrl);
  root.change((doc) => {
    doc.entries.foreign = {
      kind: 'file',
      name: 'foreign.html',
      order: 2,
      parentId: 'sandbox-compat',
      resourceRef: foreign.url,
    };
  });
  const foreignSnapshot = await runtime.createAppSnapshot('sandbox-compat');
  assert.equal(foreignSnapshot.state, 'ready');
  if (foreignSnapshot.state !== 'ready') throw new Error('Expected foreign content snapshot');
  const foreignFile = foreignSnapshot.files.find(({ path }) => path.at(-1) === 'foreign.html');
  assert.equal(await foreignFile?.body.text(), '<h1>foreign</h1>');

  const falselyOwned = repo.create({
    '@patchpit': { ...automergeBinaryFileDocumentMetadata, type: 'other' },
    '@patchwork': { type: 'file' },
    content: new Uint8Array([1]),
    extension: 'txt',
    mimeType: 'text/plain',
    name: 'falsely-owned.txt',
  });
  root.change((doc) => {
    doc.entries['falsely-owned'] = {
      kind: 'file',
      name: 'falsely-owned.txt',
      order: 3,
      parentId: 'sandbox-compat',
      resourceRef: falselyOwned.url,
    };
  });
  assert.equal((await runtime.createAppSnapshot('sandbox-compat')).state, 'invalid');

  runtime.close();
  await repo.shutdown();
});
