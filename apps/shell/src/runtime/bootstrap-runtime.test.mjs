import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendFolderEntry,
  automergeExtension,
  automergeFileName,
  automergeMimeType,
  appLaunchIntentBoundary,
  filePickerIntentBoundary,
  folderEntry,
  createSeedFilesystem,
  patchpitDocMetadata,
  PatchpitType,
  projectFilesystem,
  rootContainer,
  routeIntentBoundary,
  SplitDirection,
  SurfaceRole,
  syncFilesystemIndexResources,
  windowIntentBoundary,
  WindowManagerNodeKind,
} from '@patchpit/system';
import {
  appLaunchIntent,
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  filesystemTreeNodesRelation,
  filesystemTreeProjection,
  filesystemTreeSchemaId,
  parseProjectionVirtualFileUrl,
  projectionVirtualDirectoryUrl,
  projectionVirtualFileUrl,
  projectionVirtualRootUrl,
  projectionVirtualServiceRootUrl,
  routeOpenIntent,
  runtimeProjectionsProjection,
  runtimeProjectionsRelation,
  runtimeProjectionsSchemaId,
  submitRuntimeIntent,
  windowCloseContextIntent,
  windowFocusIntent,
  workspaceContextsRelation,
  workspaceLayoutProjection,
  workspaceProjectionFromRelationSet,
  workspaceProjectionSchemaId,
  workspaceStateRelation,
  workspaceSurfacesRelation,
} from '@patchpit/system/runtime';
import {
  relationRows,
  relationSetNames,
} from '@patchpit/system/runtime/relations';
import { installedAppsFromFilesystem } from '../app-host/installed-apps.ts';
import {
  createSandboxPackageLoadPlan,
  sandboxFilesystemAppEntry,
} from '../app-host/sandbox-package-loader.ts';
import {
  createSandboxAppServiceBridge,
  sandboxAppProtocol,
} from '../app-host/sandbox-service-bridge.ts';
import { createBootstrapRuntimeClient } from './bootstrap-runtime.ts';

const fakeCapability = 'fake.capability';
const fakeCapabilityProtocol = 'patchpit.test.fakeCapability@1';

void test('bootstrap runtime serves a live filesystem tree projection', () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
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
    const snapshotEvent = events[0];
    assert.equal(snapshotEvent.type, 'snapshot');

    const snapshot = snapshotEvent.snapshot;
    assert.equal(snapshot.projection, filesystemTreeProjection);
    assert.equal(snapshot.schemaId, filesystemTreeSchemaId);
    assert.equal(snapshot.schema?.schemaId, filesystemTreeSchemaId);
    assert.match(snapshot.schemaHash, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(snapshot.storageHeads ?? {}), [seed.indexHandle.url]);
    assert.deepEqual(relationSetNames(snapshot.relations), [filesystemTreeNodesRelation]);

    const rows = relationRows(snapshot.relations, filesystemTreeNodesRelation);
    const rootRows = rows.filter((row) => row.url === seed.rootUrl);
    assert.equal(rootRows.length, 1);
    assert.equal(rootRows[0].isRoot, true);
    assert.equal(rootRows[0].parentUrl, null);

    const srvRow = rows.find((row) => row.url === projectionVirtualServiceRootUrl);
    assert.equal(srvRow?.parentUrl, seed.rootUrl);
    assert.equal(srvRow?.kind, 'folder');
    assert.equal(srvRow?.name, 'srv');
    assert.equal(rows.find((row) => row.url === projectionVirtualRootUrl)?.parentUrl, projectionVirtualServiceRootUrl);

    for (const projection of [runtimeProjectionsProjection, workspaceLayoutProjection]) {
      const projectionUrl = projectionVirtualDirectoryUrl(projection);
      const projectionRow = rows.find((row) => row.url === projectionUrl);
      assert.equal(projectionRow?.parentUrl, projectionVirtualRootUrl);
      assert.equal(projectionRow?.name, projection);
      assert.match(projectionRow?.name ?? '', /\./);
      for (const file of ['meta.json', 'schema.json', 'summary.json']) {
        const row = rows.find((candidate) => candidate.url === projectionVirtualFileUrl(projection, file));
        assert.equal(row?.kind, 'file');
        assert.equal(row?.parentUrl, projectionUrl);
        assert.equal(row?.mediaType, 'application/json');
        assert.doesNotThrow(() => JSON.parse(row.text));
      }
    }

    const runtimeMeta = JSON.parse(rows.find((row) => (
      row.url === projectionVirtualFileUrl(runtimeProjectionsProjection, 'meta.json')
    )).text);
    const runtimeSchema = JSON.parse(rows.find((row) => (
      row.url === projectionVirtualFileUrl(runtimeProjectionsProjection, 'schema.json')
    )).text);
    const runtimeSummary = JSON.parse(rows.find((row) => (
      row.url === projectionVirtualFileUrl(runtimeProjectionsProjection, 'summary.json')
    )).text);
    assert.equal(runtimeMeta.name, runtimeProjectionsProjection);
    assert.equal(runtimeMeta.schemaId, runtimeProjectionsSchemaId);
    assert.match(runtimeMeta.schemaHash, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(runtimeMeta.basisKinds, ['live']);
    assert.equal(runtimeMeta.owner, '@patchpit/system/runtime');
    assert.equal(runtimeMeta.readOnly, true);
    assert.equal(runtimeSchema.schemaId, runtimeProjectionsSchemaId);
    assert.equal(runtimeSummary.projection, runtimeProjectionsProjection);
    assert.equal(runtimeSummary.schemaId, runtimeProjectionsSchemaId);
    assert.equal(runtimeSummary.relationCounts[runtimeProjectionsRelation], 3);
  } finally {
    subscription.close();
  }

  const diagnostics = runtime.diagnostics.getSnapshot().projectionSubscriptions[0];
  assert.equal(diagnostics.projection, filesystemTreeProjection);
  assert.equal(diagnostics.status, 'closed');
  assert.deepEqual(diagnostics.counters, {
    errors: 0,
    patches: 0,
    resets: 0,
    snapshots: 1,
  });
});

void test('seeded filesystem mounts fixture docs under home', () => {
  const seed = createSeedFilesystem();
  const root = seededFilesystemRoot(seed);

  assert.deepEqual(root.entries.map((entry) => entry.name), ['apps', 'home', 'system']);
  assert.equal(nodeAtPath(root, '/apps')?.kind, 'folder');
  assert.equal(nodeAtPath(root, '/home')?.kind, 'folder');
  assert.equal(nodeAtPath(root, '/system')?.kind, 'folder');
  assert.equal(nodeAtPath(root, '/home/docs')?.kind, 'folder');
  assert.equal(nodeAtPath(root, '/home/docs/README.md')?.kind, 'file');
  assert.equal(nodeAtPath(root, '/home/README.md')?.kind, 'file');
  assert.equal(nodeAtPath(root, '/home/ghostscript-tiger.svg')?.kind, 'file');
  assert.equal(nodeAtPath(root, '/docs'), undefined);
  assert.equal(nodeAtPath(root, '/home/home'), undefined);
});

void test('bootstrap runtime serves a runtime projection catalog including itself', () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const events = [];
  const subscription = runtime.subscribeProjection(
    {
      projection: runtimeProjectionsProjection,
      schemaId: runtimeProjectionsSchemaId,
      basis: { kind: 'live' },
    },
    (event) => events.push(event),
  );

  try {
    assert.equal(events.length, 1);
    const snapshotEvent = events[0];
    assert.equal(snapshotEvent.type, 'snapshot');

    const snapshot = snapshotEvent.snapshot;
    assert.equal(snapshot.projection, runtimeProjectionsProjection);
    assert.equal(snapshot.schemaId, runtimeProjectionsSchemaId);
    assert.equal(snapshot.schema?.schemaId, runtimeProjectionsSchemaId);
    assert.match(snapshot.schemaHash, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(snapshot.storageHeads ?? {}), []);
    assert.deepEqual(relationSetNames(snapshot.relations), [runtimeProjectionsRelation]);

    const rows = relationRows(snapshot.relations, runtimeProjectionsRelation);
    assert.deepEqual(rows.map((row) => row.name), [
      filesystemTreeProjection,
      runtimeProjectionsProjection,
      workspaceLayoutProjection,
    ]);
    for (const row of rows) {
      assert.equal(typeof row.schemaId, 'string');
      assert.match(row.schemaHash, /^sha256:[a-f0-9]{64}$/);
      assert.deepEqual(row.basisKinds, ['live']);
      assert.equal(row.readOnly, true);
    }
    assert.equal(
      rows.find((row) => row.name === filesystemTreeProjection)?.schemaId,
      filesystemTreeSchemaId,
    );
    assert.equal(
      rows.find((row) => row.name === workspaceLayoutProjection)?.schemaId,
      workspaceProjectionSchemaId,
    );
    assert.equal(
      rows.find((row) => row.name === runtimeProjectionsProjection)?.schemaId,
      runtimeProjectionsSchemaId,
    );
  } finally {
    subscription.close();
  }
});

void test('bootstrap runtime emits filesystem resets from index changes', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
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
    seed.indexHandle.change((doc) => {
      doc.filesystemIndex.documents.push({
        content: 'projection test',
        mimeType: 'text/plain',
        type: 'file',
        url: 'automerge:projection-test',
      });
    });

    await waitFor(() => events.length >= 2);
    assert.equal(events[1].type, 'reset');
    assert.equal(events[1].reason, 'source-change');
    assert.equal(events[1].snapshot.storageHeads?.[seed.indexHandle.url]?.length > 0, true);
  } finally {
    subscription.close();
  }

  const diagnostics = runtime.diagnostics.getSnapshot().projectionSubscriptions[0];
  assert.equal(diagnostics.status, 'closed');
  assert.equal(diagnostics.counters.resets, 1);
});

void test('bootstrap runtime exposes read-only resource snapshots', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);

  assert.equal(runtime.resources.rootUrl, seed.rootUrl);
  assert.equal(runtime.resources.documentUrls.filePickerState, seed.filePickerStateHandle.url);
  assert.equal(
    runtime.resources.getDocument(runtime.resources.documentUrls.filePickerState),
    seed.filePickerStateHandle.doc(),
  );
  assert.equal(runtime.resources.getDocument('automerge:missing-resource'), undefined);

  const documentEvents = [];
  const unsubscribeDocument = runtime.resources.subscribeDocument(
    runtime.resources.documentUrls.filePickerState,
    () => documentEvents.push(runtime.resources.getDocument(runtime.resources.documentUrls.filePickerState)),
  );
  try {
    seed.filePickerStateHandle.change((doc) => {
      doc.activeUrl = seed.rootUrl;
    });
    await waitFor(() => documentEvents.length === 1);
    assert.equal(documentEvents[0].activeUrl, seed.rootUrl);
  } finally {
    unsubscribeDocument();
  }
});

void test('bootstrap runtime commits route, file-picker, and window intents', async () => {
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
  assert.deepEqual(Object.keys(routeResult.heads), [seed.windowManagerHandle.url]);
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
  assert.deepEqual(Object.keys(selectResult.heads), [seed.filePickerStateHandle.url]);
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
  assert.deepEqual(Object.keys(focusResult.heads), [seed.windowManagerHandle.url]);
  assert.equal(seed.windowManagerHandle.doc().focus, 'files');

  assert.deepEqual(
    runtime.diagnostics.getSnapshot().intentLog.map((entry) => [entry.intent, entry.status]),
    [
      [routeOpenIntent, 'committed'],
      [filePickerSelectUrlIntent, 'committed'],
      [filePickerToggleFolderIntent, 'committed'],
      [windowFocusIntent, 'committed'],
    ],
  );
  assert.deepEqual(
    runtime.diagnostics.getSnapshot().sessionEvents.map((entry) => [entry.source, entry.kind, entry.intent, entry.status]),
    [
      ['runtime', 'intent.started', routeOpenIntent, 'pending'],
      ['runtime', 'intent.finished', routeOpenIntent, 'committed'],
      ['runtime', 'intent.started', filePickerSelectUrlIntent, 'pending'],
      ['runtime', 'intent.finished', filePickerSelectUrlIntent, 'committed'],
      ['runtime', 'intent.started', filePickerToggleFolderIntent, 'pending'],
      ['runtime', 'intent.finished', filePickerToggleFolderIntent, 'committed'],
      ['runtime', 'intent.started', windowFocusIntent, 'pending'],
      ['runtime', 'intent.finished', windowFocusIntent, 'committed'],
    ],
  );

  runtime.diagnostics.recordSessionEvent({
    appId: 'file-picker',
    contextId: 'file-picker',
    data: { service: 'view', payload: { view: 'file-picker' } },
    kind: 'sandbox.service.request',
    requestId: '1',
    sessionUrl: seed.filePickerStateHandle.url,
    source: 'sandbox',
    surfaceId: 'files',
  });
  assert.deepEqual(runtime.diagnostics.getSnapshot().sessionEvents.at(-1), {
    appId: 'file-picker',
    contextId: 'file-picker',
    data: { service: 'view', payload: { view: 'file-picker' } },
    kind: 'sandbox.service.request',
    observedAt: runtime.diagnostics.getSnapshot().sessionEvents.at(-1)?.observedAt,
    requestId: '1',
    sequence: 9,
    sessionUrl: seed.filePickerStateHandle.url,
    source: 'sandbox',
    surfaceId: 'files',
  });
});

void test('bootstrap runtime routes documents through installed manifest handlers', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const target = createFakeRouteResource(seed, 'manifest-route-target', 'text/x-patchpit-test');
  installFakeAppManifest(seed, {
    app: 'fake-viewer',
    handles: [
      { accepts: ['text/x-patchpit-test'], intent: 'open', port: 'view' },
    ],
  });

  const result = await submitRuntimeIntent(runtime, {
    boundary: routeIntentBoundary,
    intent: routeOpenIntent,
    row: {
      id: 'manifest-route-open-test',
      title: 'Manifest Route Target',
      url: target.url,
    },
  });

  const contextId = `fake-viewer:${target.url}`;
  assert.equal(result.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().surfaces.main.activeContext, contextId);
  assert.equal(seed.windowManagerHandle.doc().contexts[contextId].app, 'fake-viewer');
  assert.equal(seed.windowManagerHandle.doc().contexts[contextId].title, 'Manifest Route Target');
});

void test('bootstrap runtime routes projection virtual JSON files without Automerge handles', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const url = projectionVirtualFileUrl(runtimeProjectionsProjection, 'summary.json');

  assert.equal(url, 'patchpit-srv:/projections/runtime.projections/summary.json');
  assert.deepEqual(parseProjectionVirtualFileUrl(url), {
    file: 'summary.json',
    projection: runtimeProjectionsProjection,
  });
  assert.equal(parseProjectionVirtualFileUrl('patchpit-srv:/projections/unknown.projection/summary.json'), undefined);
  assert.equal(parseProjectionVirtualFileUrl('patchpit-srv:/projections/appManifests.handlers/summary.json'), undefined);
  assert.equal(Object.hasOwn(seed.documentHandles, url), false);

  const result = await submitRuntimeIntent(runtime, {
    boundary: routeIntentBoundary,
    intent: routeOpenIntent,
    row: {
      id: 'projection-virtual-route-open-test',
      title: 'runtime.projections summary',
      url,
    },
  });

  const contextId = `viewer:${url}`;
  assert.equal(result.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().surfaces.main.activeContext, contextId);
  assert.equal(seed.windowManagerHandle.doc().contexts[contextId].app, 'viewer');
  assert.equal(seed.windowManagerHandle.doc().contexts[contextId].url, url);
});

void test('bootstrap runtime route-opened Viewer resolves sandbox resource views for files and folders', async () => {
  const seed = createSeedFilesystem();
  const root = seededFilesystemRoot(seed);
  const readme = nodeAtPath(root, '/home/docs/README.md');
  const docs = nodeAtPath(root, '/home/docs');
  assert.equal(readme?.kind, 'file');
  assert.equal(docs?.kind, 'folder');

  const file = await routeViewerResourceThroughSandbox(seed, readme.url, 'Docs README');
  assert.equal(file.context.app, 'viewer');
  assert.equal(file.context.url, readme.url);
  assert.equal(file.loadPlan.kind, 'module');
  assert.deepEqual(file.response, {
    id: 'request-1',
    ok: true,
    protocol: sandboxAppProtocol,
    result: {
      resource: {
        kind: 'file',
        mediaType: 'text/markdown',
        name: 'README.md',
        sourceUrl: null,
        text: readme.text,
        title: 'README.md',
        url: readme.url,
      },
      view: 'resource',
    },
    type: 'serviceResponse',
  });

  const folder = await routeViewerResourceThroughSandbox(seed, docs.url, 'Docs Folder');
  assert.equal(folder.context.app, 'viewer');
  assert.equal(folder.context.url, docs.url);
  assert.equal(folder.loadPlan.kind, 'module');
  assert.equal(folder.response.ok, true);
  assert.equal(folder.response.result.view, 'resource');
  assert.equal(folder.response.result.resource.kind, 'folder');
  assert.equal(folder.response.result.resource.name, 'docs');
  assert.equal(folder.response.result.resource.url, docs.url);
  assert.equal(folder.response.result.resource.children.some((child) => (
    child.kind === 'file'
    && child.mediaType === 'text/markdown'
    && child.name === 'README.md'
    && child.url === readme.url
  )), true);
});

void test('bootstrap runtime rejects route targets missing from seeded handles', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);

  const result = await submitRuntimeIntent(runtime, {
    boundary: routeIntentBoundary,
    intent: routeOpenIntent,
    row: {
      id: 'missing-route-target-test',
      title: 'Missing Route Target',
      url: 'automerge:missing-route-target',
    },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'not_found');
  assert.match(result.error.message, /Route target automerge:missing-route-target/);
});

void test('bootstrap runtime ignores direct app manifest files under apps folder', async () => {
  const seed = createSeedFilesystem();
  const target = createFakeRouteResource(seed, 'direct-manifest-route-target', 'text/x-direct-manifest-test');
  clearInstalledApps(seed);
  installDirectAppManifest(seed, {
    app: 'direct-manifest-viewer',
    handles: [
      { accepts: ['text/x-direct-manifest-test'], intent: 'open', port: 'view' },
    ],
  });
  const runtime = bootstrapRuntime(seed);

  const result = await submitRuntimeIntent(runtime, {
    boundary: routeIntentBoundary,
    intent: routeOpenIntent,
    row: {
      id: 'direct-manifest-route-open-test',
      title: 'Direct Manifest Route Target',
      url: target.url,
    },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'missing_handler');
});

void test('bootstrap runtime reuses existing matching context for contextless file picker launch', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);
  const context = seed.windowManagerHandle.doc().contexts['file-picker'];

  const result = await launchApp(runtime, {
    app: 'file-picker',
    behavior: 'open-context',
    id: 'file-picker-contextless-launch-test',
    role: SurfaceRole.WorkspaceView,
  });

  assert.equal(result.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().contexts['file-picker'].url, context.url);
  assert.equal(seed.windowManagerHandle.doc().surfaces.files.activeContext, 'file-picker');
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
});

void test('bootstrap runtime resolves contextless toggle launches to existing file picker context', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);

  const result = await launchApp(runtime, {
    app: 'file-picker',
    behavior: 'toggle-surface',
    id: 'file-picker-contextless-toggle-test',
    role: SurfaceRole.WorkspaceView,
  });

  assert.equal(result.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().contexts['file-picker'].app, 'file-picker');
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
});

void test('bootstrap runtime creates stateless package context for contextless module app launch', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);

  const result = await launchApp(runtime, {
    app: 'hello-world',
    behavior: 'open-context',
    id: 'hello-world-contextless-launch-test',
    role: SurfaceRole.DocumentSet,
  });

  assert.equal(result.status, 'committed');
  const context = Object.values(seed.windowManagerHandle.doc().contexts).find((candidate) => (
    candidate.app === 'hello-world'
  ));
  assert.ok(context);
  assert.equal(context.title, 'Hello World');
  assert.match(context.id, /^hello-world:automerge:/);
  assert.equal(seed.documentHandles[context.url]?.doc().name, 'app.js');
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
});

void test('bootstrap runtime rejects contextless package launches with invalid app entry paths', async () => {
  const seed = createSeedFilesystem();
  clearInstalledApps(seed);
  const outside = seed.repo.create({
    '@patchpit': patchpitDocMetadata(PatchpitType.File),
    content: '',
    extension: 'html',
    mimeType: 'text/html',
    name: 'escape.html',
  });
  seed.documentHandles[outside.url] = outside;
  const appsHandle = appsFolderHandle(seed);
  appsHandle.change((doc) => {
    appendFolderEntry(doc, folderEntry('escape.html', PatchpitType.File, outside.url));
  });
  syncFilesystemIndexResources(seed.indexHandle, [appsHandle, outside]);
  installFakeAppManifest(seed, {
    app: 'invalid-entry-app',
    entry: '../escape.html',
  });
  const runtime = bootstrapRuntime(seed);

  const result = await launchApp(runtime, {
    app: 'invalid-entry-app',
    behavior: 'open-context',
    id: 'invalid-entry-app-contextless-launch-test',
    role: SurfaceRole.DocumentSet,
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'missing_handler');
  assert.equal(result.error.message, 'App invalid-entry-app entry ../escape.html is not installed.');
});

void test('bootstrap runtime carries inert app launch delegation into sandbox launch view', async () => {
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

  assert.deepEqual(bridge.capabilities, {
    act: false,
    open: false,
    view: true,
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

void test('bootstrap runtime creates stateless package context for contextless viewer app launch', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);

  const result = await launchApp(runtime, {
    app: 'viewer',
    behavior: 'open-context',
    id: 'viewer-contextless-launch-test',
    role: SurfaceRole.DocumentSet,
  });

  assert.equal(result.status, 'committed');
  const context = Object.values(seed.windowManagerHandle.doc().contexts).find((candidate) => (
    candidate.app === 'viewer'
  ));
  assert.ok(context);
  assert.equal(context.title, 'Viewer');
  assert.match(context.id, /^viewer:automerge:/);
  assert.equal(seed.documentHandles[context.url]?.doc().name, 'app.js');
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
});

void test('bootstrap runtime leaves explicit-context app documents in place after close', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const context = {
    app: 'viewer',
    container: rootContainer(seed.rootUrl),
    id: 'viewer-explicit-context-test',
    title: 'Runtime State',
    url: seed.runtimeStateHandle.url,
  };

  const launchResult = await launchApp(runtime, {
    app: context.app,
    behavior: 'open-context',
    context,
    id: 'viewer-launch-test',
    role: SurfaceRole.DocumentSet,
  });
  assert.equal(launchResult.status, 'committed');

  const closeResult = await closeWindowContext(runtime, seed, context, 'viewer-close-test');

  assert.equal(closeResult.status, 'committed');
  assert.deepEqual(Object.keys(closeResult.heads), [seed.windowManagerHandle.url]);
  assert.equal(seed.windowManagerHandle.doc().contexts[context.id], undefined);
  assert.equal(indexUrls(seed).has(context.url), true);
  assert.equal(Object.hasOwn(seed.documentHandles, context.url), true);
});

void test('bootstrap runtime opens a registered capability provider', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed, { capabilityProviders: [fakeCapabilityProvider()] });
  const capability = await runtime.openCapability({
    capability: fakeCapability,
    verbs: ['read', 'list', 'unsupported'],
  });

  try {
    assert.equal(capability.grant.capability, fakeCapability);
    assert.deepEqual(capability.grant.verbs, ['read', 'list']);
    assert.equal(capability.grant.endpoint?.protocol, fakeCapabilityProtocol);
  } finally {
    capability.close();
  }
});

void test('bootstrap runtime rejects duplicate capability providers', () => {
  const seed = createSeedFilesystem();

  assert.throws(
    () => bootstrapRuntime(seed, {
      capabilityProviders: [fakeCapabilityProvider(), fakeCapabilityProvider()],
    }),
    (error) => {
      assert.equal(error.code, 'bad_request');
      assert.match(error.message, /Duplicate capability provider/);
      return true;
    },
  );
});

void test('bootstrap runtime rejects unregistered capabilities', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);

  await assert.rejects(
    () => runtime.openCapability({ capability: fakeCapability }),
    { code: 'unknown_capability' },
  );
});

void test('bootstrap runtime serves a live workspace layout projection', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const events = [];
  const subscription = runtime.subscribeProjection(
    {
      projection: workspaceLayoutProjection,
      schemaId: workspaceProjectionSchemaId,
      basis: { kind: 'live' },
    },
    (event) => events.push(event),
  );

  try {
    assert.equal(events.length, 1);
    const snapshotEvent = events[0];
    assert.equal(snapshotEvent.type, 'snapshot');

    const snapshot = snapshotEvent.snapshot;
    assert.equal(snapshot.projection, workspaceLayoutProjection);
    assert.equal(snapshot.schemaId, workspaceProjectionSchemaId);
    assert.equal(snapshot.schema?.schemaId, workspaceProjectionSchemaId);
    assert.match(snapshot.schemaHash, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(snapshot.storageHeads ?? {}), [seed.windowManagerHandle.url]);
    assert.deepEqual(relationRows(snapshot.relations, workspaceStateRelation), [
      {
        focus: 'files',
        id: 'window-manager',
        layout: {
          direction: SplitDirection.Row,
          first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
          kind: WindowManagerNodeKind.Split,
          ratio: 0.32,
          second: { kind: WindowManagerNodeKind.Surface, surfaceId: 'main' },
        },
      },
    ]);
    assert.equal(relationRows(snapshot.relations, workspaceContextsRelation).length, 1);
    assert.equal(relationRows(snapshot.relations, workspaceSurfacesRelation).length, 2);

    seed.windowManagerHandle.change((doc) => {
      doc.surfaces.secondary = {
        contexts: [],
        id: 'secondary',
        role: SurfaceRole.DocumentSet,
      };
      doc.layout = {
        direction: SplitDirection.Row,
        first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
        kind: WindowManagerNodeKind.Split,
        ratio: 0.7,
        second: { kind: WindowManagerNodeKind.Surface, surfaceId: 'secondary' },
      };
    });

    await waitFor(() => events.length >= 2);
    const resetEvent = events[1];
    assert.equal(resetEvent.type, 'reset');
    assert.equal(resetEvent.reason, 'source-change');
    assert.equal(resetEvent.snapshot.storageHeads?.[seed.windowManagerHandle.url]?.length > 0, true);
    assert.equal(relationRows(resetEvent.snapshot.relations, workspaceSurfacesRelation).length, 3);
  } finally {
    subscription.close();
  }
});

void test('bootstrap runtime rejects workspace projection schema mismatches', () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const events = [];
  const subscription = runtime.subscribeProjection(
    {
      projection: workspaceLayoutProjection,
      schemaId: 'patchpit.filesystem.tree@1',
      basis: { kind: 'live' },
    },
    (event) => events.push(event),
  );

  try {
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'error');
    assert.equal(events[0].error.code, 'schema_mismatch');
  } finally {
    subscription.close();
  }
});

void test('bootstrap runtime rejects unknown projections and unsupported bases', () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const unknownEvents = [];
  const unknown = runtime.subscribeProjection(
    {
      projection: 'appManifests.handlers',
      schemaId: 'patchpit.system.appManifest@1',
      basis: { kind: 'live' },
    },
    (event) => unknownEvents.push(event),
  );
  const historicalEvents = [];
  const historical = runtime.subscribeProjection(
    {
      projection: workspaceLayoutProjection,
      schemaId: workspaceProjectionSchemaId,
      basis: { kind: 'heads', heads: {} },
    },
    (event) => historicalEvents.push(event),
  );

  try {
    assert.equal(unknownEvents.length, 1);
    assert.equal(unknownEvents[0].type, 'error');
    assert.equal(unknownEvents[0].error.code, 'unknown_projection');
    assert.equal(historicalEvents.length, 1);
    assert.equal(historicalEvents[0].type, 'error');
    assert.equal(historicalEvents[0].error.code, 'unsupported_basis');
  } finally {
    unknown.close();
    historical.close();
  }

  const diagnostics = runtime.diagnostics.getSnapshot().projectionSubscriptions;
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].status, 'error');
  assert.equal(diagnostics[0].counters.errors, 1);
  assert.equal(diagnostics[0].closedAt !== undefined, true);
  assert.equal(diagnostics[1].status, 'error');
  assert.equal(diagnostics[1].counters.errors, 1);
  assert.equal(diagnostics[1].closedAt !== undefined, true);
});

void test('workspace projection decoder rejects inconsistent workspace relations', () => {
  const projection = workspaceProjectionFromRelationSet({
    relations: {
      [workspaceStateRelation]: [
        {
          focus: 'missing-focus',
          id: 'window-manager',
          layout: {
            direction: SplitDirection.Row,
            first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
            kind: WindowManagerNodeKind.Split,
            ratio: 0.5,
            second: { kind: WindowManagerNodeKind.Surface, surfaceId: 'missing-layout' },
          },
        },
      ],
      [workspaceContextsRelation]: [
        workspaceContext('file-picker'),
        workspaceContext('active-orphan'),
      ],
      [workspaceSurfacesRelation]: [
        {
          activeContext: 'active-orphan',
          contexts: ['file-picker', 'missing-pinned'],
          id: 'files',
          previewContext: 'missing-preview',
          role: SurfaceRole.WorkspaceView,
        },
        {
          activeContext: 'missing-active',
          contexts: [],
          id: 'main',
          role: SurfaceRole.DocumentSet,
        },
      ],
    },
  });

  assert.equal(projection.status, 'failed');
  assert.equal(projection.failure.message, 'The workspace projection rows are not internally consistent.');
  assert.deepEqual(projection.failure.details, [
    'Workspace focus references missing surface "missing-focus".',
    'Workspace layout references missing surface "missing-layout".',
    'Surface "files" pinned context "missing-pinned" is missing from contexts.',
    'Surface "files" previewContext "missing-preview" is missing from contexts.',
    'Surface "files" activeContext "active-orphan" is not pinned or previewed by the surface.',
    'Surface "main" activeContext "missing-active" is missing from contexts.',
    'Surface "main" activeContext "missing-active" is not pinned or previewed by the surface.',
  ]);
});

async function waitFor(predicate) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 500) throw new Error('Timed out waiting for projection event.');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function workspaceContext(id) {
  return {
    app: 'viewer',
    container: { mounts: [] },
    id,
    title: id,
    url: `automerge:${id}`,
  };
}

function bootstrapRuntime(seed, options = {}) {
  return createBootstrapRuntimeClient({ ...options, seed, workspaceId: 'test-workspace' });
}

function launchApp(runtime, row) {
  return submitRuntimeIntent(runtime, {
    boundary: appLaunchIntentBoundary,
    intent: appLaunchIntent,
    row,
  });
}

function closeWindowContext(runtime, seed, context, id) {
  const surface = surfaceForContext(seed, context.id);
  assert.ok(surface);
  return submitRuntimeIntent(runtime, {
    boundary: windowIntentBoundary,
    intent: windowCloseContextIntent,
    row: {
      contextId: context.id,
      id,
      surfaceId: surface.id,
    },
  });
}

function installFakeAppManifest(seed, {
  app,
  entry = `${app}.html`,
  handles = [],
}) {
  const handle = seed.repo.create({
    '@patchpit': patchpitDocMetadata(PatchpitType.AppManifest),
    entry,
    entryKind: 'html',
    extension: automergeExtension,
    handles,
    icons: [],
    id: app,
    manifestVersion: 1,
    mimeType: automergeMimeType,
    name: app,
    surfaces: [
      { role: SurfaceRole.DocumentSet },
    ],
    version: '0.0.0',
  });
  seed.documentHandles[handle.url] = handle;
  registerFakeInstalledAppManifest(seed, handle, app);
  return handle;
}

function installDirectAppManifest(seed, {
  app,
  handles = [],
}) {
  const handle = seed.repo.create({
    '@patchpit': patchpitDocMetadata(PatchpitType.AppManifest),
    entry: `${app}.html`,
    entryKind: 'html',
    extension: automergeExtension,
    handles,
    icons: [],
    id: app,
    manifestVersion: 1,
    mimeType: automergeMimeType,
    name: app,
    surfaces: [
      { role: SurfaceRole.DocumentSet },
    ],
    version: '0.0.0',
  });
  seed.documentHandles[handle.url] = handle;
  const appsHandle = appsFolderHandle(seed);
  appsHandle.change((doc) => {
    appendFolderEntry(doc, folderEntry(automergeFileName(app), PatchpitType.AppManifest, handle.url));
  });
  syncFilesystemIndexResources(seed.indexHandle, [appsHandle, handle]);
  return handle;
}

function clearInstalledApps(seed) {
  const appsHandle = appsFolderHandle(seed);
  appsHandle.change((doc) => {
    doc.docs = [];
  });
  syncFilesystemIndexResources(seed.indexHandle, [appsHandle]);
}

function registerFakeInstalledAppManifest(seed, handle, app) {
  const packageHandle = seed.repo.create({
    '@patchpit': patchpitDocMetadata(PatchpitType.Folder),
    docs: [
      folderEntry(automergeFileName('manifest'), PatchpitType.AppManifest, handle.url),
    ],
    name: app,
    title: app,
  });
  seed.documentHandles[packageHandle.url] = packageHandle;
  const appsHandle = appsFolderHandle(seed);
  appsHandle.change((doc) => {
    appendFolderEntry(doc, folderEntry(app, PatchpitType.Folder, packageHandle.url));
  });
  syncFilesystemIndexResources(seed.indexHandle, [appsHandle, packageHandle, handle]);
}

function appsFolderHandle(seed) {
  const appsEntry = seed.documentHandles[seed.rootUrl].doc().docs.find((entry) => (
    entry.name === 'apps' && entry.type === PatchpitType.Folder
  ));
  assert.ok(appsEntry);
  const handle = seed.documentHandles[appsEntry.url];
  assert.ok(handle);
  return handle;
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
  const viewer = installedAppsFromFilesystem({
    getDocument: (documentUrl) => seed.documentHandles[documentUrl]?.doc(),
    root,
  }).find((app) => app.manifest.id === 'viewer');
  assert.ok(viewer);
  assert.equal(viewer.manifest.entry, 'app.js');
  assert.equal(viewer.manifest.entryKind, 'module');
  assert.equal(viewer.entry?.kind, 'file');

  const sandboxEntry = sandboxFilesystemAppEntry({
    entry: viewer.entry,
    entryKind: viewer.manifest.entryKind,
    entryPath: viewer.manifest.entry,
    packageRoot: viewer.packageRoot,
  });
  const loadPlan = createSandboxPackageLoadPlan(sandboxEntry);

  const bridge = createSandboxAppServiceBridge({
    appId: viewer.manifest.id,
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

function fakeCapabilityProvider() {
  return {
    capability: fakeCapability,
    open(request) {
      const verbs = ['read', 'list'].filter((verb) => request.verbs?.includes(verb));
      const { port1, port2 } = new MessageChannel();
      return {
        close() {
          port1.close();
          port2.close();
        },
        grant: {
          capability: fakeCapability,
          capabilityId: `${fakeCapability}:test`,
          endpoint: { protocol: fakeCapabilityProtocol },
          verbs,
        },
        port: port2,
      };
    },
  };
}

function surfaceForContext(seed, contextId) {
  return Object.values(seed.windowManagerHandle.doc().surfaces).find((surface) => (
    surface.contexts.includes(contextId) || surface.previewContext === contextId
  ));
}

function systemAppUrls(seed) {
  return new Set(seed.systemAppsHandle.doc().docs.map((entry) => entry.url));
}

function indexUrls(seed) {
  return new Set(seed.indexHandle.doc().filesystemIndex.documents.map((row) => row.url));
}
