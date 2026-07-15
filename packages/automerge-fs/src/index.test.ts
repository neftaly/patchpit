import assert from 'node:assert/strict';
import test from 'node:test';
import { Repo } from '@automerge/automerge-repo';
import { openFsEntries } from '@patchpit/fs';
import { automergeRepoSourceRuntime } from '@tarstate/automerge';
import {
  automergeFsDocumentMetadata,
  automergeFsPackageFromFiles,
  openAutomergeFsFolder,
} from './index.ts';

void test('automerge filesystem package keeps bytes separate from folder resource refs', () => {
  const htmlBytes = new Uint8Array([60, 104, 49, 62]);
  const packaged = automergeFsPackageFromFiles([
    {
      bytes: htmlBytes,
      contentType: 'text/html',
      entryId: 'index',
      name: 'index.html',
      order: 0,
      parentId: null,
      resourceRef: 'automerge:index',
    },
    {
      bytes: new Uint8Array(),
      contentType: 'image/svg+xml',
      entryId: 'tiger',
      name: 'ghostscript-tiger.svg',
      order: 1,
      parentId: null,
      resourceRef: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
    },
  ]);

  assert.deepEqual(packaged.folder, {
    '@patchpit': automergeFsDocumentMetadata,
    entries: {
      index: { kind: 'file', name: 'index.html', order: 0, parentId: null, resourceRef: 'automerge:index' },
      tiger: { kind: 'file', name: 'ghostscript-tiger.svg', order: 1, parentId: null, resourceRef: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg' },
    },
  });
  assert.deepEqual(packaged.files.map(([resourceRef]) => resourceRef), [
    'automerge:index',
  ]);

  const [firstFile] = packaged.files;
  htmlBytes[0] = 0;
  assert.deepEqual(firstFile?.[1].bytes, new Uint8Array([60, 104, 49, 62]));
});

void test('Repo-backed filesystem observes one live handle', async () => {
  const packaged = automergeFsPackageFromFiles([{
    bytes: new Uint8Array(),
    entryId: 'readme',
    name: 'readme.md',
    order: 0,
    parentId: null,
    resourceRef: 'content:readme',
  }]);
  const handle = new Repo({ network: [] }).create(packaged.folder);
  const runtime = automergeRepoSourceRuntime({ handle });
  const folder = await openAutomergeFsFolder(runtime);
  const query = openFsEntries([folder.attachment]);

  assert.match(handle.url, /^automerge:/);
  handle.change((doc) => { (doc.entries.readme as { name: string }).name = 'external.md'; });
  let snapshot = query.observer.getSnapshot();
  assert.equal(snapshot.state === 'open' && snapshot.current.rows[0]?.name, 'external.md');

  query.close();
  handle.change((doc) => { (doc.entries.readme as { name: string }).name = 'handle-still-open.md'; });
  assert.equal(handle.doc().entries.readme?.name, 'handle-still-open.md');
  assert.throws(() => runtime.snapshot(), /closed/i);
});
