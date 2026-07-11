import assert from 'node:assert/strict';
import test from 'node:test';
import { openFsEntries } from '@patchpit/fs';
import { automergeFsPackageFromFiles, openAutomergeFsFolder } from './index.ts';

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
    entries: {
      index: { kind: 'file', name: 'index.html', order: 0, parentId: null, resourceRef: 'automerge:index' },
      tiger: { kind: 'file', name: 'ghostscript-tiger.svg', order: 1, parentId: null, resourceRef: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg' },
    },
    kind: 'patchpit.fs-folder@1',
  });
  assert.deepEqual(packaged.files.map(([resourceRef]) => resourceRef), [
    'automerge:index',
    'https://upload.wikimedia.org/wikipedia/commons/f/fd/Ghostscript_Tiger.svg',
  ]);

  const [firstFile] = packaged.files;
  htmlBytes[0] = 0;
  assert.deepEqual(firstFile?.[1].bytes, new Uint8Array([60, 104, 49, 62]));
});

void test('Tarstate-coordinated rename flows through the shared filesystem query', async () => {
  const packaged = automergeFsPackageFromFiles([{
    bytes: new Uint8Array(),
    entryId: 'readme',
    name: 'readme.md',
    order: 0,
    parentId: null,
    resourceRef: 'content:readme',
  }]);
  const folder = openAutomergeFsFolder('shared', packaged.folder);
  const query = openFsEntries([folder.attachment]);
  const before = query.observer.getSnapshot();
  const readmeKey = before.state === 'open' ? before.current.resultKeys[0] : undefined;

  const committed = await folder.renameEntry({
    entryId: 'readme',
    name: 'notes.md',
    operationId: 'rename-readme',
  });
  const after = query.observer.getSnapshot();

  assert.equal(committed.outcome, 'committed');
  assert.equal(after.state, 'open');
  assert.deepEqual(after.current.rows, [{
    entryId: 'readme',
    kind: 'file',
    name: 'notes.md',
    order: 0,
    parentId: null,
    resourceRef: 'content:readme',
    sourceId: 'shared',
  }]);
  assert.equal(after.current.resultKeys[0], readmeKey);

  query.close();
});
