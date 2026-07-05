import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFs } from 'just-bash/browser';
import {
  ContainerMountKind,
  createSeedFilesystem,
  PatchpitType,
  terminalContainer,
} from '@patchpit/system';
import {
  terminalFilesystemCapability,
  terminalFilesystemProtocol,
} from '@patchpit/system/runtime';
import {
  createPatchpitFilesystem,
  createTerminalFilesystemClient,
  serveTerminalFilesystemCapability,
} from './filesystem.ts';
import { PatchpitFs } from './patchpit-fs.ts';
import { createTerminalRuntime, runTerminalCommand } from './terminal-bash.ts';

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

void test('terminal runtime opens roots through a scoped filesystem adapter', async () => {
  const seed = createSeedFilesystem();
  const rootUrl = 'automerge:root';
  const overlayUrl = 'automerge:overlay';
  const openedRoots = [];
  const runtime = createTerminalRuntime(
    {
      filesystem: {
        cacheKey: 'test-filesystem',
        rootUrl,
        openRoot: (url) => {
          openedRoots.push(url);
          return new InMemoryFs(url === overlayUrl
            ? { '/note.txt': 'overlay\n' }
            : { '/home/root.txt': 'root\n' });
        },
      },
    },
    {
      mounts: [
        ...terminalContainer(rootUrl).mounts,
        { kind: ContainerMountKind.Automerge, path: '/mnt/project', url: overlayUrl },
      ],
    },
    seed.terminalStateHandle.doc(),
  );

  const rootResult = await runTerminalCommand(runtime, seed.terminalStateHandle.doc(), 'cat /home/root.txt');
  const overlayResult = await runTerminalCommand(runtime, seed.terminalStateHandle.doc(), 'cat /mnt/project/note.txt');

  assert.equal(rootResult.stderr, '');
  assert.equal(rootResult.stdout, 'root\n');
  assert.equal(overlayResult.stderr, '');
  assert.equal(overlayResult.stdout, 'overlay\n');
  assert.deepEqual(openedRoots, [rootUrl, overlayUrl]);
});

void test('terminal filesystem capability serves operations over a port', async () => {
  const seed = createSeedFilesystem();
  const filesystem = createPatchpitFilesystem({
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  });
  const initialPaths = filesystem.openRoot(seed.rootUrl).getAllPaths();
  const grant = {
    capability: terminalFilesystemCapability,
    capabilityId: 'terminal-filesystem:test',
    endpoint: {
      protocol: terminalFilesystemProtocol,
      rootUrl: seed.rootUrl,
      rootUrls: [seed.rootUrl],
      initialPaths,
      initialPathsByRoot: { [seed.rootUrl]: initialPaths },
    },
    verbs: ['read', 'write', 'stat', 'list', 'mount'],
  };
  const { port1, port2 } = new MessageChannel();
  const closeServer = serveTerminalFilesystemCapability({ filesystem, grant, port: port1 });
  const client = createTerminalFilesystemClient({ close: () => port2.close(), grant, port: port2 });
  const fs = client.openRoot(seed.rootUrl);

  try {
    assert.equal(fs.getAllPaths().includes('/'), true);

    await fs.writeFile('/home/capability.txt', 'hello from capability');

    assert.equal(await fs.readFile('/home/capability.txt'), 'hello from capability');
    assert.equal((await fs.stat('/home/capability.txt')).isFile, true);
    assert.equal(fs.getAllPaths().includes('/home/capability.txt'), true);
    await assert.rejects(
      () => client.openRoot('automerge:outside-grant').exists('/'),
      { code: 'EPERM' },
    );
  } finally {
    closeServer();
    client.close?.();
  }
});

void test('terminal filesystem capability rejects pending requests on close', async () => {
  const seed = createSeedFilesystem();
  const filesystem = createPatchpitFilesystem({
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  });
  const grant = terminalFilesystemGrant(seed, filesystem);
  const { port1, port2 } = new MessageChannel();
  const closeServer = serveTerminalFilesystemCapability({ filesystem, grant, port: port1 });
  const client = createTerminalFilesystemClient({ close: () => port2.close(), grant, port: port2 });
  const pending = client.openRoot(seed.rootUrl).readFile('/README.md');

  client.close?.();
  closeServer();

  await assert.rejects(pending, { code: 'ECLOSED' });
});

void test('terminal filesystem capability rejects pending requests when the server closes', async () => {
  const rootUrl = 'automerge:root';
  const grant = {
    capability: terminalFilesystemCapability,
    capabilityId: 'terminal-filesystem:test',
    endpoint: {
      protocol: terminalFilesystemProtocol,
      rootUrl,
      rootUrls: [rootUrl],
      initialPaths: ['/'],
      initialPathsByRoot: { [rootUrl]: ['/'] },
    },
    verbs: ['read'],
  };
  const filesystem = {
    cacheKey: 'pending-filesystem',
    rootUrl,
    openRoot: () => ({
      readFile: () => new Promise(() => {}),
    }),
  };
  const { port1, port2 } = new MessageChannel();
  const closeServer = serveTerminalFilesystemCapability({ filesystem, grant, port: port1 });
  const client = createTerminalFilesystemClient({ close: () => port2.close(), grant, port: port2 });
  const pending = client.openRoot(rootUrl).readFile('/pending.txt');

  closeServer();

  try {
    await assert.rejects(pending, { code: 'ECLOSED' });
  } finally {
    client.close?.();
  }
});

void test('terminal filesystem capability updates path cache without a full tree refresh on writes', async () => {
  const seed = createSeedFilesystem();
  const filesystem = createPatchpitFilesystem({
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  });
  const initialPaths = filesystem.openRoot(seed.rootUrl).getAllPaths();
  let fullTreeWalks = 0;
  const countingFilesystem = {
    cacheKey: 'counting-filesystem',
    rootUrl: seed.rootUrl,
    openRoot: (rootUrl) => {
      const fs = filesystem.openRoot(rootUrl);
      return new Proxy(fs, {
        get(target, key) {
          if (key === 'getAllPaths') {
            return () => {
              fullTreeWalks += 1;
              return target.getAllPaths();
            };
          }
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
  const grant = {
    capability: terminalFilesystemCapability,
    capabilityId: 'terminal-filesystem:test',
    endpoint: {
      protocol: terminalFilesystemProtocol,
      rootUrl: seed.rootUrl,
      rootUrls: [seed.rootUrl],
      initialPaths,
      initialPathsByRoot: { [seed.rootUrl]: initialPaths },
    },
    verbs: ['read', 'write', 'stat', 'list', 'mount'],
  };
  const { port1, port2 } = new MessageChannel();
  const closeServer = serveTerminalFilesystemCapability({ filesystem: countingFilesystem, grant, port: port1 });
  const client = createTerminalFilesystemClient({ close: () => port2.close(), grant, port: port2 });
  const fs = client.openRoot(seed.rootUrl);

  try {
    await fs.writeFile('/home/no-refresh.txt', 'no full walk');

    assert.equal(fullTreeWalks, 0);
    assert.equal(fs.getAllPaths().includes('/home/no-refresh.txt'), true);
  } finally {
    closeServer();
    client.close?.();
  }
});

void test('terminal filesystem capability requires read and write for copy and move', async () => {
  const seed = createSeedFilesystem();
  const filesystem = createPatchpitFilesystem({
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  });
  const grant = {
    ...terminalFilesystemGrant(seed, filesystem),
    verbs: ['write'],
  };
  const { port1, port2 } = new MessageChannel();
  const closeServer = serveTerminalFilesystemCapability({ filesystem, grant, port: port1 });
  const client = createTerminalFilesystemClient({ close: () => port2.close(), grant, port: port2 });
  const fs = client.openRoot(seed.rootUrl);

  try {
    await fs.writeFile('/home/source.txt', 'source');
    await assert.rejects(
      () => fs.cp('/home/source.txt', '/home/copied.txt'),
      { code: 'EPERM' },
    );
    await assert.rejects(
      () => fs.mv('/home/source.txt', '/home/moved.txt'),
      { code: 'EPERM' },
    );
  } finally {
    closeServer();
    client.close?.();
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

function terminalFilesystemGrant(seed, filesystem) {
  const initialPaths = filesystem.openRoot(seed.rootUrl).getAllPaths();
  return {
    capability: terminalFilesystemCapability,
    capabilityId: 'terminal-filesystem:test',
    endpoint: {
      protocol: terminalFilesystemProtocol,
      rootUrl: seed.rootUrl,
      rootUrls: [seed.rootUrl],
      initialPaths,
      initialPathsByRoot: { [seed.rootUrl]: initialPaths },
    },
    verbs: ['read', 'write', 'stat', 'list', 'mount'],
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
