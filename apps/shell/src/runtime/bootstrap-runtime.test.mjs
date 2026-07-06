import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appLaunchIntentBoundary,
  filePickerIntentBoundary,
  createSeedFilesystem,
  PatchpitType,
  projectFilesystem,
  routeIntentBoundary,
  SurfaceRole,
  syncFilesystemIndexResources,
  windowIntentBoundary,
} from '@patchpit/system';
import {
  appLaunchIntent,
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  filesystemTreeNodesRelation,
  filesystemTreeProjection,
  filesystemTreeSchemaId,
  routeOpenIntent,
  submitRuntimeIntent,
  windowFocusIntent,
} from '@patchpit/system/runtime';
import { relationRows } from '@patchpit/system/runtime/relations';
import { coreAppsFromFilesystem } from './installed-apps.ts';
import {
  createSandboxPackageLoadPlan,
  sandboxFilesystemAppEntry,
} from '../app-host/sandbox-package-loader.ts';
import {
  createSandboxAppServiceBridge,
  sandboxAppProtocol,
} from '../app-host/sandbox-service-bridge.ts';
import { createBootstrapRuntimeClient } from './bootstrap-runtime.ts';

void test('bootstrap runtime exposes the seeded filesystem through a live tree projection', () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const root = seededFilesystemRoot(seed);

  assert.deepEqual(root.entries.map((entry) => entry.name), ['apps', 'home', 'system']);
  assert.equal(nodeAtPath(root, '/home/docs/README.md')?.kind, 'file');
  assert.equal(nodeAtPath(root, '/home/README.md')?.kind, 'file');
  assert.equal(nodeAtPath(root, '/home/ghostscript-tiger.svg')?.kind, 'file');

  const events = [];
  const subscription = runtime.subscribeProjection(
    {
      projection: filesystemTreeProjection,
      schemaId: filesystemTreeSchemaId,
      basis: { kind: 'live' },
    },
    (event) => events.push(event),
  );

  try {
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'snapshot');

    const rows = relationRows(events[0].snapshot.relations, filesystemTreeNodesRelation);
    assert.ok(rows.some((row) => row.url === seed.rootUrl && row.isRoot === true));
    assert.ok(rows.some((row) => row.url === nodeAtPath(root, '/apps/viewer/index.html')?.url));
    assert.ok(rows.some((row) => row.url === nodeAtPath(root, '/home/docs/README.md')?.url));
  } finally {
    subscription.close();
  }
});

void test('bootstrap runtime commits route, file-picker, and window workflow intents', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const routeTarget = createFakeRouteResource(seed, 'runtime-intent-target', 'text/plain');
  const routeUrl = routeTarget.url;
  const viewerContextId = `viewer:${routeUrl}`;

  const routeResult = await submitRuntimeIntent(runtime, {
    boundary: routeIntentBoundary,
    intent: routeOpenIntent,
    row: {
      id: 'route-open-test',
      title: 'Runtime Intent Target',
      url: routeUrl,
    },
  });
  assert.equal(routeResult.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().surfaces.main.activeContext, viewerContextId);
  assert.equal(seed.windowManagerHandle.doc().contexts[viewerContextId].title, 'Runtime Intent Target');

  const selectResult = await submitRuntimeIntent(runtime, {
    boundary: filePickerIntentBoundary,
    intent: filePickerSelectUrlIntent,
    row: {
      id: 'file-picker-select-test',
      url: routeUrl,
    },
  });
  assert.equal(selectResult.status, 'committed');
  assert.equal(seed.filePickerStateHandle.doc().activeUrl, routeUrl);
  assert.deepEqual(seed.filePickerStateHandle.doc().selectedUrls, [routeUrl]);

  const toggleResult = await submitRuntimeIntent(runtime, {
    boundary: filePickerIntentBoundary,
    intent: filePickerToggleFolderIntent,
    row: {
      id: 'file-picker-toggle-test',
      url: seed.rootUrl,
    },
  });
  assert.equal(toggleResult.status, 'committed');
  assert.equal(seed.filePickerStateHandle.doc().openFolders[seed.rootUrl], false);

  const focusResult = await submitRuntimeIntent(runtime, {
    boundary: windowIntentBoundary,
    intent: windowFocusIntent,
    row: {
      contextId: 'file-picker',
      id: 'window-focus-test',
      surfaceId: 'files',
    },
  });
  assert.equal(focusResult.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().focus, 'files');
});

void test('bootstrap runtime route-opened Viewer resolves sandbox resource views', async () => {
  const seed = createSeedFilesystem();
  const root = seededFilesystemRoot(seed);
  const readme = nodeAtPath(root, '/home/docs/README.md');
  const docs = nodeAtPath(root, '/home/docs');
  const tiger = nodeAtPath(root, '/home/ghostscript-tiger.svg');
  assert.equal(readme?.kind, 'file');
  assert.equal(docs?.kind, 'folder');
  assert.equal(tiger?.kind, 'file');

  const file = await routeViewerResourceThroughSandbox(seed, readme.url, 'Docs README');
  assert.equal(file.context.app, 'viewer');
  assert.equal(file.context.url, readme.url);
  assert.equal(file.loadPlan.kind, 'html');
  assert.deepEqual(file.response.result.resource, {
    kind: 'file',
    mediaType: 'text/markdown',
    name: 'README.md',
    sourceUrl: null,
    text: readme.text,
    title: 'README.md',
    url: readme.url,
  });

  const folder = await routeViewerResourceThroughSandbox(seed, docs.url, 'Docs Folder');
  assert.equal(folder.response.ok, true);
  assert.equal(folder.response.result.view, 'resource');
  assert.equal(folder.response.result.resource.kind, 'file');
  assert.equal(folder.response.result.resource.mediaType, 'application/vnd.automerge');
  assert.equal(folder.response.result.resource.name, 'docs');
  assert.equal(folder.response.result.resource.url, docs.url);
  assert.doesNotThrow(() => JSON.parse(folder.response.result.resource.text));

  const image = await routeViewerResourceThroughSandbox(seed, tiger.url, 'Ghostscript Tiger');
  assert.equal(image.response.ok, true);
  assert.deepEqual(image.response.result.resource, {
    kind: 'file',
    mediaType: 'image/svg+xml',
    name: 'ghostscript-tiger.svg',
    sourceUrl: tiger.sourceUrl,
    text: '',
    title: 'ghostscript-tiger.svg',
    url: tiger.url,
  });
});

void test('bootstrap runtime launches seeded core apps', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);

  const filePickerResult = await launchApp(runtime, {
    app: 'file-picker',
    behavior: 'open-context',
    id: 'file-picker-contextless-launch-test',
    role: SurfaceRole.WorkspaceView,
  });
  assert.equal(filePickerResult.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().contexts['file-picker'].app, 'file-picker');
  assert.equal(seed.windowManagerHandle.doc().surfaces.files.activeContext, 'file-picker');

  const helloResult = await launchApp(runtime, {
    app: 'hello-world',
    behavior: 'open-context',
    id: 'hello-world-contextless-launch-test',
    role: SurfaceRole.DocumentSet,
  });
  assert.equal(helloResult.status, 'committed');
  const helloContext = Object.values(seed.windowManagerHandle.doc().contexts).find((candidate) => (
    candidate.app === 'hello-world'
  ));
  assert.ok(helloContext);
  assert.equal(helloContext.title, 'Hello World');
  assert.equal(seed.documentHandles[helloContext.url]?.doc().name, 'index.html');

  const viewerResult = await launchApp(runtime, {
    app: 'viewer',
    behavior: 'open-context',
    id: 'viewer-contextless-launch-test',
    role: SurfaceRole.DocumentSet,
  });
  assert.equal(viewerResult.status, 'committed');
  const viewerContext = Object.values(seed.windowManagerHandle.doc().contexts).find((candidate) => (
    candidate.app === 'viewer' && candidate.id !== `viewer:${seed.rootUrl}`
  ));
  assert.ok(viewerContext);
  assert.equal(viewerContext.title, 'Viewer');
  assert.equal(seed.documentHandles[viewerContext.url]?.doc().name, 'index.html');
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
});

void test('bootstrap runtime carries app launch delegation into sandbox launch view', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);

  const result = await launchApp(runtime, {
    app: 'hello-world',
    behavior: 'open-context',
    delegation: 'delegation:test-token',
    id: 'hello-world-delegation-launch-test',
    role: SurfaceRole.DocumentSet,
  });

  assert.equal(result.status, 'committed');
  const context = Object.values(seed.windowManagerHandle.doc().contexts).find((candidate) => (
    candidate.app === 'hello-world'
    && candidate.delegation === 'delegation:test-token'
  ));
  assert.ok(context);

  const bridge = createSandboxAppServiceBridge({
    appId: 'hello-world',
    session: {
      app: context.app,
      delegation: context.delegation,
      id: context.id,
      url: context.url,
    },
  });

  assert.deepEqual(bridge.respond({
    id: 'request-1',
    payload: { name: 'launch' },
    protocol: sandboxAppProtocol,
    service: 'view',
    type: 'serviceRequest',
  }), {
    id: 'request-1',
    ok: true,
    protocol: sandboxAppProtocol,
    result: {
      appId: 'hello-world',
      session: {
        app: 'hello-world',
        delegation: 'delegation:test-token',
        id: context.id,
        url: context.url,
      },
      view: 'launch',
    },
    type: 'serviceResponse',
  });
});

function bootstrapRuntime(seed) {
  return createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
}

function launchApp(runtime, row) {
  return submitRuntimeIntent(runtime, {
    boundary: appLaunchIntentBoundary,
    intent: appLaunchIntent,
    row,
  });
}

function createFakeRouteResource(seed, name, mimeType) {
  const handle = seed.repo.create({
    '@patchpit': { type: PatchpitType.File },
    content: name,
    extension: 'test',
    mimeType,
    name: `${name}.test`,
  });
  seed.documentHandles[handle.url] = handle;
  syncFilesystemIndexResources(seed.indexHandle, [handle]);
  return handle;
}

async function routeViewerResourceThroughSandbox(seed, url, title) {
  const runtime = bootstrapRuntime(seed);
  const result = await submitRuntimeIntent(runtime, {
    boundary: routeIntentBoundary,
    intent: routeOpenIntent,
    row: {
      id: `viewer-sandbox-resource-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
      title,
      url,
    },
  });
  assert.equal(result.status, 'committed');

  const contextId = `viewer:${url}`;
  const context = seed.windowManagerHandle.doc().contexts[contextId];
  assert.ok(context);
  assert.equal(seed.windowManagerHandle.doc().surfaces.main.activeContext, contextId);

  const root = seededFilesystemRoot(seed);
  const viewer = coreAppsFromFilesystem(root).find((app) => app.id === 'viewer');
  assert.ok(viewer);
  assert.equal(viewer.entryPath, 'index.html');
  assert.equal(viewer.entryKind, 'html');
  assert.equal(viewer.entry?.kind, 'file');

  const sandboxEntry = sandboxFilesystemAppEntry({
    entry: viewer.entry,
    entryKind: viewer.entryKind,
    entryPath: viewer.entryPath,
    packageRoot: viewer.packageRoot,
  });
  const loadPlan = createSandboxPackageLoadPlan(sandboxEntry);

  const bridge = createSandboxAppServiceBridge({
    appId: viewer.id,
    resourceRoot: root,
    session: { app: context.app, id: context.id, url: context.url },
  });
  const response = bridge.respond({
    id: 'request-1',
    payload: { name: 'resource' },
    protocol: sandboxAppProtocol,
    service: 'view',
    type: 'serviceRequest',
  });

  return { context, loadPlan, response };
}

function seededFilesystemRoot(seed) {
  const filesystem = projectFilesystem(seed.indexHandle.doc(), seed.rootUrl);
  assert.deepEqual(filesystem.diagnostics, []);
  assert.ok(filesystem.root);
  return filesystem.root;
}

function nodeAtPath(root, path) {
  if (path === '/') return root;
  const parts = path.split('/').filter(Boolean);
  let node = root;
  for (const part of parts) {
    if (node.kind !== 'folder') return undefined;
    node = node.entries.find((entry) => entry.name === part);
    if (node === undefined) return undefined;
  }
  return node;
}

function systemAppUrls(seed) {
  return new Set(seed.systemAppsHandle.doc().docs.map((entry) => entry.url));
}
