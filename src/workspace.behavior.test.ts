import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import {
  openResources,
  resourceGroups,
  resourceId,
  resourcesFromSnapshot,
} from './resources.ts';
import {
  createWorkspace,
  moveContext,
  openContext,
  previewContext,
  type WorkspacePaneId,
  type WorkspaceState,
} from './workspace.ts';

const resourceRuntime = openResources();
const resources = resourcesFromSnapshot(resourceRuntime.observer.getSnapshot());
const files = resources.filter(({ kind }) => kind === 'file');
after(() => resourceRuntime.close());

void test('source identity disambiguates matching local IDs', () => {
  const personal = files.find(({ localId, sourceId }) => localId === 'readme' && sourceId === 'personal');
  const shared = files.find(({ localId, sourceId }) => localId === 'readme' && sourceId === 'shared');
  assert(personal !== undefined && shared !== undefined);
  assert.equal(personal.localId, shared.localId);
  assert.notEqual(resourceId(personal), resourceId(shared));
});

void test('filesystem hierarchy includes folders and nested files', () => {
  const personal = resourceGroups(resources).find(({ sourceId }) => sourceId === 'personal');
  assert.deepEqual(personal?.rows.map(({ depth, resource }) => [depth, resource.kind, resource.name]), [
    [0, 'file', 'readme.md'],
    [0, 'folder', 'projects'],
    [1, 'file', 'notes.md'],
  ]);
});

void test('preview replacement, pinning, and movement preserve context ownership', () => {
  const personalReadme = files.find(({ localId, sourceId }) => localId === 'readme' && sourceId === 'personal');
  const sharedReadme = files.find(({ localId, sourceId }) => localId === 'readme' && sourceId === 'shared');
  assert(personalReadme !== undefined && sharedReadme !== undefined);
  const personalContext = resourceId(personalReadme);
  const sharedContext = resourceId(sharedReadme);
  let workspace = previewContext(createWorkspace('home'), personalContext, 'right');

  assert.equal(workspace.right.previewContext, personalContext);
  workspace = previewContext(workspace, sharedContext, 'right');
  assert.equal(workspace.right.contexts.includes(personalContext), false);
  assert.equal(workspace.right.previewContext, sharedContext);

  workspace = openContext(workspace, sharedContext, 'right');
  workspace = previewContext(workspace, personalContext, 'right');
  assert.equal(workspace.right.contexts.includes(sharedContext), true);
  assert.equal(workspace.right.previewContext, personalContext);

  workspace = moveContext(workspace, personalContext, 'left');
  assert.equal(workspace.right.previewContext, undefined);
  assert.equal(workspace.left.previewContext, undefined);
  assert.equal(workspace.left.contexts.includes(personalContext), true);

  workspace = moveContext(workspace, personalContext, 'right', sharedContext);
  assert.deepEqual(workspace.right.contexts.slice(0, 2), [personalContext, sharedContext]);
});

void test('context behavior fuzz preserves workspace invariants', () => {
  const paneIds: readonly WorkspacePaneId[] = ['left', 'right'];
  let workspace = createWorkspace('home');

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const resource = files[(iteration * 17) % files.length];
    const paneId = paneIds[(iteration * 31) % paneIds.length];
    if (resource === undefined || paneId === undefined) continue;
    const contextId = resourceId(resource);
    workspace = iteration % 3 === 0
      ? openContext(workspace, contextId, paneId)
      : previewContext(workspace, contextId, paneId);
    if (iteration % 5 === 0) workspace = moveContext(workspace, contextId, paneIds[iteration % 2] ?? 'left');
    assertWorkspaceInvariants(workspace);
  }
});

const assertWorkspaceInvariants = (workspace: WorkspaceState) => {
  const mountedContexts = [...workspace.left.contexts, ...workspace.right.contexts];
  assert.equal(new Set(mountedContexts).size, mountedContexts.length);
  for (const paneId of ['left', 'right'] as const) {
    const pane = workspace[paneId];
    assert.equal(pane.activeContext === undefined || pane.contexts.includes(pane.activeContext), true);
    assert.equal(
      pane.previewContext === undefined || pane.contexts.includes(pane.previewContext), true);
  }
};
