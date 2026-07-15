import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAutomergeUrl, Repo } from '@automerge/automerge-repo';
import type { AutomergeFileContentDoc, AutomergeFsFolderDoc } from '@patchpit/automerge-fs';
import { createRoot, openRoot } from './patchpit-runtime.ts';

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
      files: [
      {
        bytes: [60, 104, 49, 62],
        contentType: 'text/html',
        entryId: 'index.html',
        name: 'index.html',
        order: 0,
        resourceRef: 'sandbox-compat:index.html',
      },
      {
        bytes: [1, 2, 3],
        contentType: 'image/svg+xml',
        entryId: 'tiger.svg',
        name: 'tiger.svg',
        order: 1,
        resourceRef: externalUrl,
      },
      ],
    }],
  });
  const rootHandle = await repo.find<AutomergeFsFolderDoc>(runtime.rootUrl);
  const resourceSnapshot = runtime.resources.observer.getSnapshot();
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
  assert.equal(await runtime.resolve(externalUrl), undefined);

  const contentHandle = (await runtime.resolve(index.resourceRef))!;
  assert.deepEqual((contentHandle.doc() as AutomergeFileContentDoc).bytes, new Uint8Array([60, 104, 49, 62]));
  contentHandle.change((doc) => {
    (doc as unknown as { bytes: Uint8Array }).bytes = new Uint8Array([7, 8]);
  });
  assert.deepEqual(((await runtime.resolve(index.resourceRef))!.doc() as AutomergeFileContentDoc).bytes, new Uint8Array([7, 8]));

  const addedHandle = repo.create<AutomergeFileContentDoc>({
    bytes: new Uint8Array([10]),
    kind: 'patchpit.file-content@1',
  });
  rootHandle.change((doc) => {
    doc.entries.added = {
      kind: 'file',
      name: 'added.txt',
      order: 2,
      parentId: null,
      resourceRef: addedHandle.url,
    };
  });
  assert.equal(await runtime.resolve(addedHandle.url), addedHandle);
  rootHandle.change((doc) => { delete doc.entries.added; });
  assert.equal(await runtime.resolve(addedHandle.url), undefined);

  rootHandle.change((doc) => {
    (doc.entries['sandbox-compat:index.html'] as { name: string }).name = 'main.html';
    (doc.entries.workspace as { name: string; parentId: string | null }).name = 'session.am';
    (doc.entries.workspace as { name: string; parentId: string | null }).parentId = 'sandbox-compat';
    (doc.entries['sandbox-compat'] as { name: string }).name = 'apps';
  });
  const renamedSnapshot = runtime.resources.observer.getSnapshot();
  assert.equal(renamedSnapshot.state, 'open');
  if (renamedSnapshot.state !== 'open') throw new Error('Resource query closed');
  assert.equal(renamedSnapshot.current.rows
    .find(({ entryId }) => entryId === index.entryId)?.name, 'main.html');
  await runtime.workspace.act({
    kind: 'workspace.context.open',
    contextId: 'notes',
    url: 'viewer.html#{"src":"notes"}',
    targetPaneId: 'right',
    missingSplitId: 'unused',
    mode: 'open',
  });

  runtime.close();
  assert.equal(await runtime.resolve(index.resourceRef), undefined);
  assert.equal(rootHandle.isReady(), true);
  assert.equal(contentHandle.isReady(), true);
  contentHandle.change((doc) => {
    (doc as unknown as { bytes: Uint8Array }).bytes = new Uint8Array([9]);
  });

  const reopened = await openRoot({ repo, rootUrl: runtime.rootUrl });
  const reopenedSnapshot = reopened.resources.observer.getSnapshot();
  assert.equal(reopenedSnapshot.state, 'open');
  if (reopenedSnapshot.state !== 'open') throw new Error('Resource query closed');
  assert.equal(reopenedSnapshot.current.rows
    .find(({ entryId }) => entryId === index.entryId)?.name, 'main.html');
  assert.equal(reopenedSnapshot.current.rows
    .find(({ entryId }) => entryId === workspace.entryId)?.name, 'session.am');
  assert.deepEqual(
    ((await reopened.resolve(index.resourceRef))!.doc() as AutomergeFileContentDoc).bytes,
    new Uint8Array([9]),
  );
  const workspaceProjection = reopened.workspace.getSnapshot();
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
    /filesystem schema is invalid/,
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
        bytes: [1, 2, 3],
        contentType: 'application/octet-stream',
        entryId: 'index.html',
        name: 'index.html',
        order: 0,
        resourceRef: 'sandbox-compat:index.html',
      }],
    }],
  });
  const ready = await runtime.snapshotApp('sandbox-compat');
  assert.equal(ready.state, 'ready');
  if (ready.state !== 'ready') throw new Error('Expected ready app snapshot');
  assert.deepEqual(
    [...new Uint8Array(await ready.files[0]!.body.arrayBuffer())],
    [1, 2, 3],
  );

  const resources = runtime.resources.observer.getSnapshot();
  assert.equal(resources.state, 'open');
  if (resources.state !== 'open') throw new Error('Resource query closed');
  const resourceRef = resources.current.rows.find(({ entryId }) =>
    entryId === 'sandbox-compat:index.html')!.resourceRef;
  const handle = (await runtime.resolve(resourceRef))!;
  handle.change((doc) => {
    (doc as unknown as { bytes: unknown }).bytes = [4, 5];
  });
  assert.equal((await runtime.snapshotApp('sandbox-compat')).state, 'invalid');

  runtime.close();
  await repo.shutdown();
});
