import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appLaunchIntentBoundary,
  filePickerIntentBoundary,
  createSeedFilesystem,
  createTerminalStateResource,
  removeSystemAppResource,
  routeIntentBoundary,
  SplitDirection,
  SurfaceRole,
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
  terminalFilesystemCapability,
  terminalFilesystemProtocol,
  windowCloseContextIntent,
  windowFocusIntent,
  workspaceContextsRelation,
  workspaceLayoutProjection,
  workspaceProjectionSchemaId,
  workspaceStateRelation,
  workspaceSurfacesRelation,
} from '@patchpit/system/runtime';
import { createBootstrapRuntimeClient } from './bootstrap-runtime.ts';
import { managedTerminalStateHandles } from './managed-terminal-state.ts';
import { workspaceProjectionFromRelationSet } from './workspace-projection.ts';

void test('bootstrap runtime serves a live filesystem tree projection', () => {
  const seed = createSeedFilesystem();
  const runtime = createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
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
  const runtime = createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
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
  const runtime = createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
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

void test('bootstrap runtime removes managed terminal state after closing its context', async () => {
  const seed = createSeedFilesystem();
  let nextTerminalId = 2;
  const runtime = createBootstrapRuntimeClient({
    createTerminalState: () => createTerminalStateResource(seed, `terminal-${nextTerminalId++}`),
    seed,
    workspaceId: 'test-workspace',
  });
  const initialSystemAppUrls = systemAppUrls(seed);

  const launchResult = await submitRuntimeIntent(runtime, {
    boundary: appLaunchIntentBoundary,
    intent: appLaunchIntent,
    row: {
      app: 'terminal',
      behavior: 'open-context',
      id: 'terminal-launch-test',
      role: SurfaceRole.DocumentSet,
    },
  });
  assert.equal(launchResult.status, 'committed');

  const terminalContext = terminalContextInWindowManager(seed);
  assert.ok(terminalContext);
  assert.notEqual(terminalContext.url, seed.terminalStateHandle.url);
  assert.equal(systemAppUrls(seed).has(terminalContext.url), true);
  assert.equal(indexUrls(seed).has(terminalContext.url), true);
  assert.equal(Object.hasOwn(seed.documentHandles, terminalContext.url), true);
  assert.equal(systemAppUrls(seed).size, initialSystemAppUrls.size + 1);

  const terminalSurface = surfaceForContext(seed, terminalContext.id);
  assert.ok(terminalSurface);
  const closeResult = await submitRuntimeIntent(runtime, {
    boundary: windowIntentBoundary,
    intent: windowCloseContextIntent,
    row: {
      contextId: terminalContext.id,
      id: 'terminal-close-test',
      surfaceId: terminalSurface.id,
    },
  });
  assert.equal(closeResult.status, 'committed');
  assert.deepEqual(
    Object.keys(closeResult.heads).sort(),
    [seed.indexHandle.url, seed.systemAppsHandle.url, seed.windowManagerHandle.url].sort(),
  );
  assert.equal(seed.windowManagerHandle.doc().contexts[terminalContext.id], undefined);
  assert.deepEqual(systemAppUrls(seed), initialSystemAppUrls);
  assert.equal(indexUrls(seed).has(terminalContext.url), false);
  assert.equal(Object.hasOwn(seed.documentHandles, terminalContext.url), false);

  const relaunchResult = await submitRuntimeIntent(runtime, {
    boundary: appLaunchIntentBoundary,
    intent: appLaunchIntent,
    row: {
      app: 'terminal',
      behavior: 'open-context',
      id: 'terminal-relaunch-test',
      role: SurfaceRole.DocumentSet,
    },
  });
  assert.equal(relaunchResult.status, 'committed');
  const relaunchedContext = terminalContextInWindowManager(seed);
  assert.ok(relaunchedContext);
  assert.notEqual(relaunchedContext.url, terminalContext.url);
  assert.equal(systemAppUrls(seed).has(relaunchedContext.url), true);
});

void test('managed terminal state handles follow the system apps folder', () => {
  const seed = createSeedFilesystem();
  const extraTerminal = createTerminalStateResource(seed, 'terminal-extra');

  assert.deepEqual(
    managedTerminalStateHandles(seed, seed.systemAppsHandle.doc()).map((handle) => handle.url),
    [seed.terminalStateHandle.url, extraTerminal.url],
  );

  assert.equal(removeSystemAppResource(seed, extraTerminal.url), true);
  assert.deepEqual(
    managedTerminalStateHandles(seed, seed.systemAppsHandle.doc()).map((handle) => handle.url),
    [seed.terminalStateHandle.url],
  );
});

void test('bootstrap runtime opens a narrowed terminal filesystem capability', async () => {
  const seed = createSeedFilesystem();
  const runtime = createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
  const capability = await runtime.openCapability({
    capability: terminalFilesystemCapability,
    verbs: ['read', 'list', 'unsupported'],
  });

  try {
    assert.equal(capability.grant.capability, terminalFilesystemCapability);
    assert.deepEqual(capability.grant.verbs, ['read', 'list']);
    assert.equal(capability.grant.endpoint?.protocol, terminalFilesystemProtocol);
    assert.equal(capability.grant.endpoint?.rootUrl, seed.rootUrl);
    assert.deepEqual(capability.grant.endpoint?.rootUrls, [seed.rootUrl]);
    assert.equal(capability.grant.endpoint?.initialPaths?.includes('/'), true);
    assert.equal(capability.grant.endpoint?.initialPathsByRoot?.[seed.rootUrl]?.includes('/'), true);
  } finally {
    capability.close();
  }
});

void test('bootstrap runtime serves a live workspace layout projection', async () => {
  const seed = createSeedFilesystem();
  const runtime = createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
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
  const runtime = createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
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
  const runtime = createBootstrapRuntimeClient({ seed, workspaceId: 'test-workspace' });
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

function terminalContextInWindowManager(seed) {
  return Object.values(seed.windowManagerHandle.doc().contexts).find((context) => context.app === 'terminal');
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
