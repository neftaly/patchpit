import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendFolderEntry,
  automergeExtension,
  automergeMimeType,
  appLaunchIntentBoundary,
  filePickerIntentBoundary,
  filesystemIndexRowForResource,
  folderEntry,
  createSeedFilesystem,
  patchpitDocMetadata,
  PatchpitType,
  rootContainer,
  routeIntentBoundary,
  SplitDirection,
  SurfaceRole,
  upsertFilesystemIndexRow,
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
  routeOpenIntent,
  submitRuntimeIntent,
  windowCloseContextIntent,
  windowFocusIntent,
  workspaceContextsRelation,
  workspaceLayoutProjection,
  workspaceProjectionSchemaId,
  workspaceStateRelation,
  workspaceSurfacesRelation,
} from '@patchpit/system/runtime';
import { createBootstrapRuntimeClient } from './bootstrap-runtime.ts';
import { workspaceProjectionFromRelationSet } from './workspace-projection.ts';

const fakeApp = 'fake-app';
const fakeAppStateType = 'fake-app-state';
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
    assert.deepEqual(Object.keys(snapshot.relations.relations), [filesystemTreeNodesRelation]);

    const rows = snapshot.relations.relations[filesystemTreeNodesRelation] ?? [];
    const rootRows = rows.filter((row) => row.url === seed.rootUrl);
    assert.equal(rootRows.length, 1);
    assert.equal(rootRows[0].isRoot, true);
    assert.equal(rootRows[0].parentUrl, null);
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

void test('bootstrap runtime commits route, file-picker, and window intents', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const routeUrl = 'automerge:runtime-intent-target';
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
});

void test('bootstrap runtime creates a fresh app instance for each contextless launch', async () => {
  const seed = createSeedFilesystem();
  const runtime = createFakeAppRuntime(seed);

  for (const id of ['fake-launch-one', 'fake-launch-two']) {
    assert.equal((await launchFakeApp(runtime, id)).status, 'committed');
  }

  const contexts = appContextsInWindowManager(seed, fakeApp);
  assert.equal(contexts.length, 2);
  assert.notEqual(contexts[0].url, contexts[1].url);
  assert.equal(new Set(contexts.map((context) => context.url)).size, 2);

  const appInstances = appInstancesForApp(seed, fakeApp);
  assert.equal(appInstances.length, 2);
  for (const context of contexts) {
    assertAppStatePresent(seed, context);
    assert.deepEqual(appInstances.find((entry) => entry.contextId === context.id), appInstanceRow(context));
  }
});

void test('bootstrap runtime removes app instance state after closing its context', async () => {
  const seed = createSeedFilesystem();
  const runtime = createFakeAppRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);
  const initialRuntimeAppInstances = appInstances(seed);

  assert.equal((await launchFakeApp(runtime, 'fake-launch-test')).status, 'committed');

  const context = appContextInWindowManager(seed, fakeApp);
  assert.ok(context);
  assertAppStatePresent(seed, context);
  assert.equal(systemAppUrls(seed).size, initialSystemAppUrls.size + 1);
  assert.deepEqual(appInstanceForContext(seed, context), appInstanceRow(context));

  const closeResult = await closeWindowContext(runtime, seed, context, 'fake-close-test');
  assert.equal(closeResult.status, 'committed');
  assert.deepEqual(
    Object.keys(closeResult.heads).sort(),
    [
      seed.indexHandle.url,
      seed.runtimeStateHandle.url,
      seed.systemAppsHandle.url,
      seed.windowManagerHandle.url,
    ].sort(),
  );
  assert.equal(seed.windowManagerHandle.doc().contexts[context.id], undefined);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
  assert.deepEqual(appInstances(seed), initialRuntimeAppInstances);
  assertAppStateRemoved(seed, context);

  assert.equal((await launchFakeApp(runtime, 'fake-relaunch-test')).status, 'committed');
  const relaunchedContext = appContextInWindowManager(seed, fakeApp);
  assert.ok(relaunchedContext);
  assert.notEqual(relaunchedContext.url, context.url);
  assert.equal(systemAppUrls(seed).has(relaunchedContext.url), true);
});

void test('bootstrap runtime closes app instance state after recreating the runtime client', async () => {
  const seed = createSeedFilesystem();
  const launchRuntime = createFakeAppRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);
  const initialRuntimeAppInstances = appInstances(seed);

  assert.equal((await launchFakeApp(launchRuntime, 'fake-durable-launch-test')).status, 'committed');

  const context = appContextInWindowManager(seed, fakeApp);
  assert.ok(context);
  assert.ok(appInstanceForContext(seed, context));

  const closeRuntime = bootstrapRuntime(seed);
  const closeResult = await closeWindowContext(closeRuntime, seed, context, 'fake-durable-close-test');

  assert.equal(closeResult.status, 'committed');
  assert.equal(seed.windowManagerHandle.doc().contexts[context.id], undefined);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
  assert.deepEqual(appInstances(seed), initialRuntimeAppInstances);
  assertAppStateRemoved(seed, context);
});

void test('bootstrap runtime rejects invalid app instance handler output and rolls back state', async () => {
  const seed = createSeedFilesystem();
  const initialSystemAppUrls = systemAppUrls(seed);
  let createdStateUrl;
  const runtime = createFakeAppRuntime(seed, {
    createContext({ app, rootUrl, stateHandle }) {
      return {
        app,
        container: rootContainer(rootUrl),
        id: `${app}:invalid-context`,
        title: 'Invalid Fake App',
        url: `${stateHandle.url}:wrong`,
      };
    },
    createState() {
      const handle = createFakeAppStateResource(seed, 'fake-invalid-context');
      createdStateUrl = handle.url;
      return handle;
    },
  });

  const result = await launchFakeApp(runtime, 'fake-invalid-context-launch-test');

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'commit_error');
  assert.match(result.error.message, /returned context url/);
  assert.ok(createdStateUrl);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
  assert.equal(indexUrls(seed).has(createdStateUrl), false);
  assert.equal(Object.hasOwn(seed.documentHandles, createdStateUrl), false);
  assert.deepEqual(appInstancesForApp(seed, fakeApp), []);
  assert.equal(appContextInWindowManager(seed, fakeApp), undefined);
});

void test('bootstrap runtime rejects app instance createContext failures and rolls back state', async () => {
  const seed = createSeedFilesystem();
  const initialSystemAppUrls = systemAppUrls(seed);
  const initialRuntimeAppInstances = appInstances(seed);
  let createdStateUrl;
  const runtime = createFakeAppRuntime(seed, {
    createContext() {
      throw new Error('fake createContext failed');
    },
    createState() {
      const handle = createFakeAppStateResource(seed, 'fake-create-context-throws');
      createdStateUrl = handle.url;
      return handle;
    },
  });

  const result = await launchFakeApp(runtime, 'fake-create-context-throws-launch-test');

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'commit_error');
  assert.match(result.error.message, /app\.launch failed while committing fake-app/);
  assert.match(result.error.reason, /fake createContext failed/);
  assert.ok(createdStateUrl);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
  assert.equal(indexUrls(seed).has(createdStateUrl), false);
  assert.equal(Object.hasOwn(seed.documentHandles, createdStateUrl), false);
  assert.deepEqual(appInstances(seed), initialRuntimeAppInstances);
  assert.equal(appContextInWindowManager(seed, fakeApp), undefined);
});

void test('bootstrap runtime rejects preexisting app instance state without deleting it', async () => {
  const seed = createSeedFilesystem();
  const preexisting = createFakeAppStateResource(seed, 'fake-preexisting-state');
  const initialSystemAppUrls = systemAppUrls(seed);
  const runtime = createFakeAppRuntime(seed, {
    createState: () => preexisting,
  });

  const result = await launchFakeApp(runtime, 'fake-preexisting-launch-test');

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'commit_error');
  assert.match(result.error.message, /preexisting state doc/);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
  assertAppStatePresent(seed, { url: preexisting.url });
  assert.deepEqual(appInstancesForApp(seed, fakeApp), []);
  assert.equal(appContextInWindowManager(seed, fakeApp), undefined);
});

void test('bootstrap runtime removes stale app instance rows without deleting mismatched docs', async () => {
  const seed = createSeedFilesystem();
  const context = {
    app: fakeApp,
    container: rootContainer(seed.rootUrl),
    id: 'fake-stale-instance-context',
    title: 'Fake Stale Instance',
    url: seed.runtimeStateHandle.url,
  };
  seed.windowManagerHandle.change((doc) => {
    doc.contexts[context.id] = context;
    doc.surfaces.main = {
      activeContext: context.id,
      contexts: [context.id],
      id: 'main',
      role: SurfaceRole.DocumentSet,
    };
    doc.layout = {
      direction: SplitDirection.Row,
      first: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
      kind: WindowManagerNodeKind.Split,
      ratio: 0.2,
      second: { kind: WindowManagerNodeKind.Surface, surfaceId: 'main' },
    };
  });
  seed.runtimeStateHandle.change((doc) => {
    doc.appInstances.push({
      app: fakeApp,
      contextId: context.id,
      stateType: fakeAppStateType,
      stateUrl: context.url,
    });
  });
  const runtime = bootstrapRuntime(seed);

  const result = await closeWindowContext(runtime, seed, context, 'fake-stale-instance-close-test');

  assert.equal(result.status, 'committed');
  assert.deepEqual(
    Object.keys(result.heads).sort(),
    [seed.runtimeStateHandle.url, seed.windowManagerHandle.url].sort(),
  );
  assert.equal(seed.windowManagerHandle.doc().contexts[context.id], undefined);
  assert.deepEqual(appInstancesForApp(seed, fakeApp), []);
  assertResourcePresent(seed, seed.runtimeStateHandle.url);
});

void test('bootstrap runtime admits only registered contextless app instance launches', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);

  const result = await launchApp(runtime, {
    app: 'file-picker',
    behavior: 'open-context',
    id: 'file-picker-contextless-launch-test',
    role: SurfaceRole.WorkspaceView,
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'missing_handler');
  assert.match(result.error.reason, /file-picker-state/);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
});

void test('bootstrap runtime rejects contextless toggle launches', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const initialSystemAppUrls = systemAppUrls(seed);

  const result = await launchApp(runtime, {
    app: 'file-picker',
    behavior: 'toggle-surface',
    id: 'file-picker-contextless-toggle-test',
    role: SurfaceRole.WorkspaceView,
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'bad_request');
  assert.match(result.error.message, /Context-less app\.launch/);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
});

void test('bootstrap runtime leaves explicit-context app documents in place after close', async () => {
  const seed = createSeedFilesystem();
  const runtime = bootstrapRuntime(seed);
  const context = {
    app: 'state-browser',
    container: rootContainer(seed.rootUrl),
    id: 'state-browser-explicit-context-test',
    title: 'State Browser',
    url: seed.runtimeStateHandle.url,
  };

  const launchResult = await launchApp(runtime, {
    app: context.app,
    behavior: 'open-context',
    context,
    id: 'state-browser-launch-test',
    role: SurfaceRole.DocumentSet,
  });
  assert.equal(launchResult.status, 'committed');

  const closeResult = await closeWindowContext(runtime, seed, context, 'state-browser-close-test');

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

void test('bootstrap runtime rejects duplicate app instance handlers and capability providers', () => {
  const seed = createSeedFilesystem();
  installFakeAppManifest(seed);

  assert.throws(
    () => bootstrapRuntime(seed, {
      appInstanceStateHandlers: [
        fakeAppInstanceStateHandler(seed),
        fakeAppInstanceStateHandler(seed),
      ],
    }),
    (error) => {
      assert.equal(error.code, 'bad_request');
      assert.match(error.message, /Duplicate app instance state handler/);
      assert.match(error.reason, /fake-app-state/);
      return true;
    },
  );

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
    assert.deepEqual(snapshot.relations.relations[workspaceStateRelation], [
      {
        focus: 'files',
        id: 'window-manager',
        layout: { kind: WindowManagerNodeKind.Surface, surfaceId: 'files' },
      },
    ]);
    assert.equal(snapshot.relations.relations[workspaceContextsRelation]?.length, 1);
    assert.equal(snapshot.relations.relations[workspaceSurfacesRelation]?.length, 1);

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
    assert.equal(resetEvent.snapshot.relations.relations[workspaceSurfacesRelation]?.length, 2);
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

function createFakeAppRuntime(seed, handlerOptions) {
  installFakeAppManifest(seed);
  return bootstrapRuntime(seed, {
    appInstanceStateHandlers: [fakeAppInstanceStateHandler(seed, handlerOptions)],
  });
}

function bootstrapRuntime(seed, options = {}) {
  return createBootstrapRuntimeClient({ ...options, seed, workspaceId: 'test-workspace' });
}

function launchFakeApp(runtime, id) {
  return launchApp(runtime, {
    app: fakeApp,
    behavior: 'open-context',
    id,
    role: SurfaceRole.DocumentSet,
  });
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

function assertAppStatePresent(seed, context) {
  assert.equal(systemAppUrls(seed).has(context.url), true);
  assertResourcePresent(seed, context.url);
}

function assertResourcePresent(seed, url) {
  assert.equal(indexUrls(seed).has(url), true);
  assert.equal(Object.hasOwn(seed.documentHandles, url), true);
}

function assertAppStateRemoved(seed, context) {
  assert.equal(indexUrls(seed).has(context.url), false);
  assert.equal(Object.hasOwn(seed.documentHandles, context.url), false);
}

function appInstanceRow(context) {
  return {
    app: fakeApp,
    contextId: context.id,
    stateType: fakeAppStateType,
    stateUrl: context.url,
  };
}

function installFakeAppManifest(seed, {
  app = fakeApp,
  stateType = fakeAppStateType,
} = {}) {
  const handle = seed.repo.create({
    '@patchpit': patchpitDocMetadata(PatchpitType.AppManifest),
    entry: `${app}.html`,
    extension: automergeExtension,
    handles: [],
    icons: [],
    id: app,
    manifestVersion: 1,
    mimeType: automergeMimeType,
    name: app,
    surfaces: [
      {
        role: SurfaceRole.DocumentSet,
        state: { type: stateType },
      },
    ],
  });
  seed.documentHandles[handle.url] = handle;
  return handle;
}

function fakeAppInstanceStateHandler(seed, {
  app = fakeApp,
  stateType = fakeAppStateType,
  createContext = fakeAppContext,
  createState,
} = {}) {
  let nextStateId = 1;
  return {
    app,
    createContext,
    createState: createState ?? (() => createFakeAppStateResource(seed, `${app}-${nextStateId++}`, { stateType })),
    stateType,
  };
}

function fakeAppContext({ app, rootUrl, stateHandle }) {
  return {
    app,
    container: rootContainer(rootUrl),
    id: `${app}:${stateHandle.url}`,
    title: 'Fake App',
    url: stateHandle.url,
  };
}

function createFakeAppStateResource(seed, stateId, {
  stateType = fakeAppStateType,
} = {}) {
  const handle = seed.repo.create({
    '@patchpit': { type: stateType },
    content: JSON.stringify({ stateId }),
    extension: 'test',
    mimeType: 'application/json',
    name: `${stateId}.test`,
  });
  seed.documentHandles[handle.url] = handle;
  registerFakeSystemAppResource(seed, handle, stateType);
  return handle;
}

function registerFakeSystemAppResource(seed, handle, stateType) {
  seed.systemAppsHandle.change((doc) => {
    appendFolderEntry(doc, folderEntry(handle.doc().name, stateType, handle.url));
  });

  seed.indexHandle.change((doc) => {
    upsertFilesystemIndexRow(
      doc.filesystemIndex.documents,
      filesystemIndexRowForResource(seed.systemAppsHandle.url, seed.systemAppsHandle.doc()),
    );
    upsertFilesystemIndexRow(
      doc.filesystemIndex.documents,
      filesystemIndexRowForResource(handle.url, handle.doc()),
    );
  });
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

function appContextInWindowManager(seed, app) {
  return appContextsInWindowManager(seed, app)[0];
}

function appContextsInWindowManager(seed, app) {
  return Object.values(seed.windowManagerHandle.doc().contexts).filter((context) => context.app === app);
}

function appInstanceForContext(seed, context) {
  return appInstances(seed).find((entry) => (
    entry.contextId === context.id && entry.stateUrl === context.url
  ));
}

function appInstancesForApp(seed, app) {
  return appInstances(seed).filter((entry) => entry.app === app);
}

function appInstances(seed) {
  return structuredClone(seed.runtimeStateHandle.doc().appInstances);
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
