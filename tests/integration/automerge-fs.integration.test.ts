import assert from 'node:assert/strict';
import test from 'node:test';
import * as Automerge from '@automerge/automerge';
import { Repo } from '@automerge/automerge-repo';
import { openFsEntriesQuery } from '@patchpit/fs';
import {
  automergeFsDocumentMetadata,
  openAutomergeFsDocument,
  type AutomergeFsDocument,
} from '@patchpit/automerge-fs';

void test('Repo-backed filesystem observes one live handle', async () => {
  const document: AutomergeFsDocument = {
    '@patchpit': automergeFsDocumentMetadata,
    entries: {
      readme: {
        kind: 'file',
        name: 'readme.md',
        order: 0,
        parentId: null,
        resourceRef: 'content:readme',
      },
    },
  };
  const repo = new Repo({ network: [] });
  const handle = repo.create(document);
  const filesystem = await openAutomergeFsDocument(handle);
  const query = await openFsEntriesQuery([filesystem]);

  try {
    assert.match(handle.url, /^automerge:/);
    handle.change((doc) => { (doc.entries.readme as { name: string }).name = 'external.md'; });
    const snapshot = query.getSnapshot();
    assert.equal(snapshot.state === 'open' && snapshot.current.rows[0]?.name, 'external.md');

    query.close();
    handle.change((doc) => { (doc.entries.readme as { name: string }).name = 'handle-still-open.md'; });
    assert.equal(handle.doc().entries.readme?.name, 'handle-still-open.md');
    filesystem.close();
  } finally {
    query.close();
    filesystem.close();
    await repo.shutdown();
  }
});

void test('Repo-backed filesystem rejects conflicted Patchpit metadata', async () => {
  const repo = new Repo({ network: [] });
  const handle = repo.create<AutomergeFsDocument>({
    '@patchpit': automergeFsDocumentMetadata,
    entries: {},
  });
  handle.change((doc) => {
    (doc['@patchpit'].schema as { contentHash: string }).contentHash = 'sha256:neutral';
  });
  const base = handle.doc();
  const left = Automerge.change(
    Automerge.clone(base, { actor: '8'.repeat(64) }),
    (doc) => { (doc['@patchpit'].schema as { contentHash: string }).contentHash = 'sha256:other'; },
  );
  const right = Automerge.change(
    Automerge.clone(base, { actor: '9'.repeat(64) }),
    (doc) => {
      (doc['@patchpit'].schema as { contentHash: string }).contentHash =
        automergeFsDocumentMetadata.schema.contentHash;
    },
  );
  handle.update(() => Automerge.merge(left, right));

  try {
    await assert.rejects(openAutomergeFsDocument(handle), /filesystem metadata is invalid/);
  } finally {
    await repo.shutdown();
  }
});
