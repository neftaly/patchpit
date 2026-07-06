import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFs } from 'just-bash/browser';
import {
  automergeMovesKey,
  ContainerMountKind,
  createSeedFilesystem,
  createTerminalStateResource,
  PatchpitType,
  terminalContainer,
  TerminalLineKind,
} from '@patchpit/system';
import {
  createPatchpitFilesystem,
  createTerminalFilesystemClient,
  serveTerminalFilesystemCapability,
  terminalFilesystemCapability,
  terminalFilesystemProtocol,
} from './filesystem.ts';
import { terminalAppSessions, terminalAppStateHandles } from './patchpit-app-runtime.ts';
import { PatchpitFs } from './patchpit-fs.ts';
import { createTerminalRuntime, runTerminalCommand } from './terminal-bash.ts';
import { createTerminalStateActions } from './terminal-state.ts';

void test('terminal app state handles follow the runtime app instance ledger', () => {
  const seed = createSeedFilesystem();
  const terminalState = createTerminalStateResource(seed, 'terminal-ledger-test');

  assert.deepEqual(terminalAppStateHandles(seed, seed.runtimeStateHandle.doc()), []);

  seed.runtimeStateHandle.change((doc) => {
    doc.appInstances.push({
      app: 'terminal',
      contextId: `terminal:${terminalState.url}`,
      stateType: PatchpitType.TerminalState,
      stateUrl: terminalState.url,
    });
  });

  assert.deepEqual(
    terminalAppStateHandles(seed, seed.runtimeStateHandle.doc()).map((handle) => handle.url),
    [terminalState.url],
  );
});

void test('terminal state actions commit semantic mutations through a writer capability', () => {
  const mutations = [];
  const actions = createTerminalStateActions({
    commit: (mutation) => mutations.push(mutation),
  });
  const execution = {
    command: 'pwd',
    cwd: '/home',
    env: { LANG: 'C' },
    stderr: '',
    stdout: '/home\n',
  };

  actions.appendPrompt();
  actions.clear();
  actions.commitExecution(execution);

  assert.deepEqual(mutations, [
    { type: 'appendPrompt' },
    { type: 'clear' },
    { execution, type: 'commitExecution' },
  ]);
});

void test('terminal app sessions persist mutations through the runtime writer boundary', () => {
  const seed = createSeedFilesystem();
  const terminalState = createTerminalStateResource(seed, 'terminal-session-writer-test');
  const sessions = terminalAppSessions({
    handles: [terminalState],
    runtime: { status: 'opening' },
    states: {},
  });
  const session = sessions[terminalState.url];
  assert.ok(session);

  session.actions.commitExecution({
    command: 'printf ok',
    cwd: '/home/project',
    env: { PWD: '/home/project' },
    stderr: 'warn\n',
    stdout: 'ok\n',
  });

  assert.equal(terminalState.doc().cwd, '/home/project');
  assert.deepEqual(terminalState.doc().env, { PWD: '/home/project' });
  assert.deepEqual(terminalState.doc().history, ['printf ok']);
  assert.deepEqual(terminalState.doc().lines, [
    {
      kind: TerminalLineKind.Input,
      prompt: '/home$ ',
      text: 'printf ok',
    },
    {
      kind: TerminalLineKind.Output,
      text: 'ok',
    },
    {
      kind: TerminalLineKind.Error,
      text: 'warn',
    },
  ]);
});

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

void test('mv relinks a file without changing its Automerge document identity', async () => {
  const { fs, seed } = createTestFilesystem();

  await fs.mkdir('/home/source');
  await fs.mkdir('/home/dest');
  await fs.writeFile('/home/source/note.txt', 'hello');
  const originalUrl = urlAt(seed, '/home/source/note.txt');
  const originalHandle = seed.documentHandles[originalUrl];

  await fs.mv('/home/source/note.txt', '/home/dest/renamed.md');

  assert.equal(await fs.exists('/home/source/note.txt'), false);
  assert.equal(await fs.readFile('/home/dest/renamed.md'), 'hello');
  assert.equal(urlAt(seed, '/home/dest/renamed.md'), originalUrl);
  assert.equal(seed.documentHandles[originalUrl], originalHandle);
  assert.equal(originalHandle.doc().name, 'renamed.md');
  assert.equal(originalHandle.doc().extension, 'md');
  assert.equal(originalHandle.doc().mimeType, 'text/markdown');
  assert.deepEqual(Object.values(originalHandle.doc()[automergeMovesKey]), [{
    from: ['home', 'source', 'note.txt'],
    to: ['home', 'dest', 'renamed.md'],
  }]);
  assertIndexRowsPresent(seed, [originalUrl]);
  assertIndexRow(seed, originalUrl, {
    content: 'hello',
    mimeType: 'text/markdown',
  });
  assertIndexFolderLacksEntry(seed, '/home/source', 'note.txt');
  assertIndexFolderHasEntry(seed, '/home/dest', {
    name: 'renamed.md',
    url: originalUrl,
  });
});

void test('mv relinks a folder subtree without changing document identities', async () => {
  const { fs, seed } = createTestFilesystem();

  await fs.mkdir('/home/source/folder', { recursive: true });
  await fs.mkdir('/home/dest');
  await fs.writeFile('/home/source/folder/child.txt', 'child');
  const originalFolderUrl = urlAt(seed, '/home/source/folder');
  const originalFolderHandle = seed.documentHandles[originalFolderUrl];
  const originalChildUrl = urlAt(seed, '/home/source/folder/child.txt');
  const originalChildHandle = seed.documentHandles[originalChildUrl];

  await fs.mv('/home/source/folder', '/home/dest/renamed');

  assert.equal(await fs.exists('/home/source/folder'), false);
  assert.equal(await fs.readFile('/home/dest/renamed/child.txt'), 'child');
  assert.equal(urlAt(seed, '/home/dest/renamed'), originalFolderUrl);
  assert.equal(urlAt(seed, '/home/dest/renamed/child.txt'), originalChildUrl);
  assert.equal(seed.documentHandles[originalFolderUrl], originalFolderHandle);
  assert.equal(seed.documentHandles[originalChildUrl], originalChildHandle);
  assert.equal(originalFolderHandle.doc().name, 'renamed');
  assert.equal(originalFolderHandle.doc().title, 'renamed');
  assert.deepEqual(Object.values(originalFolderHandle.doc()[automergeMovesKey]), [{
    from: ['home', 'source', 'folder'],
    to: ['home', 'dest', 'renamed'],
  }]);
  assertIndexRowsPresent(seed, [originalFolderUrl, originalChildUrl]);
  assertIndexFolderLacksEntry(seed, '/home/source', 'folder');
  assertIndexFolderHasEntry(seed, '/home/dest', {
    name: 'renamed',
    url: originalFolderUrl,
  });
});

void test('mv treats existing directories as containers and safely replaces files', async () => {
  const { fs, seed } = createTestFilesystem();

  await fs.mkdir('/home/existing-dir');
  await fs.writeFile('/home/source.txt', 'source');
  const sourceUrl = urlAt(seed, '/home/source.txt');

  await fs.mv('/home/source.txt', '/home/existing-dir');

  assert.equal(await fs.exists('/home/source.txt'), false);
  assert.equal(await fs.readFile('/home/existing-dir/source.txt'), 'source');
  assert.equal(urlAt(seed, '/home/existing-dir/source.txt'), sourceUrl);

  await fs.writeFile('/home/replacement.txt', 'replacement');
  await fs.writeFile('/home/existing-dir/source.txt', 'old target');
  const replacementUrl = urlAt(seed, '/home/replacement.txt');
  const oldTargetUrl = sourceUrl;

  await fs.mv('/home/replacement.txt', '/home/existing-dir/source.txt');

  assert.equal(await fs.exists('/home/replacement.txt'), false);
  assert.equal(await fs.readFile('/home/existing-dir/source.txt'), 'replacement');
  assert.equal(urlAt(seed, '/home/existing-dir/source.txt'), replacementUrl);
  assertHandlesRemoved(seed, [oldTargetUrl]);
  assertIndexRowsRemoved(seed, [oldTargetUrl]);
  assertIndexRowsPresent(seed, [replacementUrl]);
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
  const terminalStateHandle = createTerminalStateResource(seed, 'terminal-test');
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
    terminalStateHandle.doc(),
  );

  const rootResult = await runTerminalCommand(runtime, terminalStateHandle.doc(), 'cat /home/root.txt');
  const overlayResult = await runTerminalCommand(runtime, terminalStateHandle.doc(), 'cat /mnt/project/note.txt');

  assert.equal(rootResult.stderr, '');
  assert.equal(rootResult.stdout, 'root\n');
  assert.equal(overlayResult.stderr, '');
  assert.equal(overlayResult.stdout, 'overlay\n');
  assert.deepEqual(openedRoots, [rootUrl, overlayUrl]);
});

void test('terminal filesystem capability serves operations over a port', async () => {
  const { client, close, seed } = openSeedFilesystemCapability();
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
    close();
  }
});

void test('terminal filesystem capability rejects pending requests on close', async () => {
  const { client, closeServer, seed } = openSeedFilesystemCapability();
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
  const { client, closeServer } = openTerminalFilesystemCapability({ filesystem, grant });
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
  const { client, close } = openTerminalFilesystemCapability({
    filesystem: countingFilesystem,
    grant: terminalFilesystemGrant(seed, filesystem, initialPaths),
  });
  const fs = client.openRoot(seed.rootUrl);

  try {
    await fs.writeFile('/home/no-refresh.txt', 'no full walk');

    assert.equal(fullTreeWalks, 0);
    assert.equal(fs.getAllPaths().includes('/home/no-refresh.txt'), true);
  } finally {
    close();
  }
});

void test('terminal filesystem capability requires read and write for copy and move', async () => {
  const seed = createSeedFilesystem();
  const filesystem = createSeedPatchpitFilesystem(seed);
  const grant = {
    ...terminalFilesystemGrant(seed, filesystem),
    verbs: ['write'],
  };
  const { client, close } = openTerminalFilesystemCapability({ filesystem, grant });
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
    close();
  }
});

function createTestFilesystem() {
  const seed = createSeedFilesystem();
  return {
    fs: new PatchpitFs(seedFilesystemOptions(seed)),
    seed,
  };
}

function seedFilesystemOptions(seed) {
  return {
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  };
}

function createSeedPatchpitFilesystem(seed) {
  return createPatchpitFilesystem(seedFilesystemOptions(seed));
}

function openSeedFilesystemCapability() {
  const seed = createSeedFilesystem();
  const filesystem = createSeedPatchpitFilesystem(seed);
  return {
    seed,
    ...openTerminalFilesystemCapability({
      filesystem,
      grant: terminalFilesystemGrant(seed, filesystem),
    }),
  };
}

function openTerminalFilesystemCapability({ filesystem, grant }) {
  const { port1, port2 } = new MessageChannel();
  const closeServer = serveTerminalFilesystemCapability({ filesystem, grant, port: port1 });
  const client = createTerminalFilesystemClient({ close: () => port2.close(), grant, port: port2 });
  return {
    client,
    close: () => {
      closeServer();
      client.close?.();
    },
    closeServer,
  };
}

function terminalFilesystemGrant(seed, filesystem, initialPaths = filesystem.openRoot(seed.rootUrl).getAllPaths()) {
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

function assertIndexFolderHasEntry(seed, path, expected) {
  const row = seed.indexHandle.doc().filesystemIndex.documents.find((candidate) => candidate.url === urlAt(seed, path));
  assert.ok(row, `Missing index row for ${path}`);
  assert.ok(Array.isArray(row.entries), `Missing folder entries for ${path}`);
  assert.ok(row.entries.some((entry) => entry.name === expected.name && entry.url === expected.url));
}

function assertIndexRow(seed, url, expected) {
  const row = seed.indexHandle.doc().filesystemIndex.documents.find((candidate) => candidate.url === url);
  assert.ok(row, `Missing index row for ${url}`);
  for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value);
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
