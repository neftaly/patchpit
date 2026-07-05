import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedFilesystem, PatchpitType } from '@patchpit/system';
import { PatchpitFs } from './patchpit-fs.ts';

void test('recursive rm drops descendant handles and filesystem index rows', async () => {
  const { fs, seed } = createTestFilesystem();

  await fs.mkdir('/home/remove/me/deeper', { recursive: true });
  await fs.writeFile('/home/remove/root.txt', 'root');
  await fs.writeFile('/home/remove/me/child.txt', 'child');
  await fs.writeFile('/home/remove/me/deeper/grandchild.txt', 'grandchild');

  const removedUrls = subtreeUrls(seed, '/home/remove');
  assert.equal(removedUrls.length, 6);

  await fs.rm('/home/remove', { recursive: true });

  assert.equal(await fs.exists('/home/remove'), false);
  assertHandlesRemoved(seed, removedUrls);
  assertIndexRowsRemoved(seed, removedUrls);
  assertFolderLacksEntry(seed, '/home', 'remove');
  assertIndexFolderLacksEntry(seed, '/home', 'remove');
});

void test('rm preserves non-recursive directory-not-empty behavior', async () => {
  const { fs, seed } = createTestFilesystem();

  await fs.mkdir('/home/not-empty');
  await fs.writeFile('/home/not-empty/file.txt', 'content');
  const urls = subtreeUrls(seed, '/home/not-empty');

  await assert.rejects(
    () => fs.rm('/home/not-empty'),
    { code: 'ENOTEMPTY', message: "ENOTEMPTY: directory not empty, rm '/home/not-empty'" },
  );

  assert.equal(await fs.exists('/home/not-empty/file.txt'), true);
  assertHandlesPresent(seed, urls);
  assertIndexRowsPresent(seed, urls);
});

void test('recursive rm cleanup survives generated nested trees', async () => {
  for (let run = 0; run < 16; run += 1) {
    const { fs, seed } = createTestFilesystem();
    const base = `/home/fuzz-${run}`;

    for (const path of generatedTreePaths(run + 1)) {
      if (path.kind === 'folder') {
        await fs.mkdir(`${base}/${path.name}`, { recursive: true });
      } else {
        await fs.mkdir(`${base}/${path.dir}`, { recursive: true });
        await fs.writeFile(`${base}/${path.dir}/${path.name}`, `run ${run} ${path.name}`);
      }
    }

    const removedUrls = subtreeUrls(seed, base);
    await fs.rm(base, { recursive: true });

    assert.equal(await fs.exists(base), false);
    assertHandlesRemoved(seed, removedUrls);
    assertIndexRowsRemoved(seed, removedUrls);
    assertFolderLacksEntry(seed, '/home', `fuzz-${run}`);
  }
});

function createTestFilesystem() {
  const seed = createSeedFilesystem();
  return {
    fs: new PatchpitFs({
      documentHandles: seed.documentHandles,
      indexHandle: seed.indexHandle,
      repo: seed.repo,
      rootUrl: seed.rootUrl,
    }),
    seed,
  };
}

function generatedTreePaths(seed) {
  const next = mulberry32(seed);
  const folders = new Set(['branch']);
  const files = [];

  for (let index = 0; index < 8; index += 1) {
    const depth = 1 + Math.floor(next() * 4);
    const parts = ['branch'];
    for (let segment = 0; segment < depth; segment += 1) {
      parts.push(`d${segment}-${Math.floor(next() * 4)}`);
      folders.add(parts.join('/'));
    }
    files.push({
      dir: parts.join('/'),
      kind: 'file',
      name: `file-${index}-${Math.floor(next() * 1000)}.txt`,
    });
  }

  return [
    ...[...folders].map((name) => ({ kind: 'folder', name })),
    ...files,
  ];
}

function subtreeUrls(seed, path) {
  const urls = new Set();
  visit(urlAt(seed, path));
  return [...urls];

  function visit(url) {
    if (urls.has(url)) return;
    urls.add(url);

    const doc = seed.documentHandles[url]?.doc();
    if (doc?.['@patchpit'].type !== PatchpitType.Folder) return;

    for (const entry of doc.docs) visit(entry.url);
  }
}

function urlAt(seed, path) {
  let url = seed.rootUrl;
  for (const name of pathSegments(path)) {
    const doc = seed.documentHandles[url]?.doc();
    assert.equal(doc?.['@patchpit'].type, PatchpitType.Folder, `Expected folder at ${url}`);

    const entry = doc.docs.find((candidate) => candidate.name === name);
    assert.ok(entry, `Missing path segment '${name}' in '${path}'`);
    url = entry.url;
  }
  return url;
}

function pathSegments(path) {
  return path.split('/').filter(Boolean);
}

function assertHandlesPresent(seed, urls) {
  for (const url of urls) {
    assert.equal(Object.hasOwn(seed.documentHandles, url), true, `${url} handle should exist`);
  }
}

function assertHandlesRemoved(seed, urls) {
  for (const url of urls) {
    assert.equal(Object.hasOwn(seed.documentHandles, url), false, `${url} handle should be removed`);
  }
}

function assertIndexRowsPresent(seed, urls) {
  const indexUrls = new Set(seed.indexHandle.doc().filesystemIndex.documents.map((row) => row.url));
  for (const url of urls) assert.equal(indexUrls.has(url), true, `${url} index row should exist`);
}

function assertIndexRowsRemoved(seed, urls) {
  const indexUrls = new Set(seed.indexHandle.doc().filesystemIndex.documents.map((row) => row.url));
  for (const url of urls) assert.equal(indexUrls.has(url), false, `${url} index row should be removed`);
}

function assertFolderLacksEntry(seed, path, name) {
  const doc = seed.documentHandles[urlAt(seed, path)].doc();
  assert.equal(doc.docs.some((entry) => entry.name === name), false);
}

function assertIndexFolderLacksEntry(seed, path, name) {
  const row = seed.indexHandle.doc().filesystemIndex.documents.find((candidate) => candidate.url === urlAt(seed, path));
  assert.ok(row, `Missing index row for ${path}`);
  assert.ok(Array.isArray(row.entries), `Missing folder entries for ${path}`);
  assert.equal(row.entries.some((entry) => entry.name === name), false);
}

function mulberry32(seedValue) {
  return () => {
    seedValue |= 0;
    seedValue = seedValue + 0x6D2B79F5 | 0;
    let value = Math.imul(seedValue ^ seedValue >>> 15, 1 | seedValue);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
