import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSeedFilesystem,
  SplitDirection,
  SurfaceRole,
  WindowManagerNodeKind,
} from '@patchpit/system';
import {
  workspaceContextsRelation,
  workspaceLayoutProjection,
  workspaceProjectionSchemaId,
  workspaceStateRelation,
  workspaceSurfacesRelation,
} from '@patchpit/system/runtime';
import { createBootstrapRuntimeClient } from './bootstrap-runtime.ts';
import { workspaceProjectionFromRelationSet } from './workspace-projection.ts';

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
