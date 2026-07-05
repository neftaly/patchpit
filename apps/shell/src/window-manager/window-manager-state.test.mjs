import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSeedFilesystem,
  SplitDirection,
  SurfaceRole,
  WindowManagerNodeKind,
} from '@patchpit/system';
import {
  closeContext,
  commitWindowManagerState,
  dropContext,
  normalizeWindowManagerState,
  openContext,
} from './window-manager-state.ts';

void test('seeded window manager starts without an empty document surface', () => {
  const state = createSeedFilesystem().windowManagerHandle.doc();

  assert.deepEqual(documentSurfaceIds(state), []);
  assert.equal(state.focus, 'files');
  assert.deepEqual(state.layout, surfaceNode('files'));
});

void test('normalizer removes seed-like empty document surfaces from layout and focus', () => {
  const state = windowState({
    contexts: { 'file-picker': context('file-picker', 'file-picker') },
    focus: 'main',
    layout: row(surfaceNode('files'), surfaceNode('main')),
    surfaces: {
      files: workspaceSurface('files', ['file-picker']),
      main: documentSurface('main', []),
    },
  });

  const normalized = normalizeWindowManagerState(state);

  assert.equal(normalized.surfaces.main, undefined);
  assert.deepEqual(normalized.layout, surfaceNode('files'));
  assert.equal(normalized.focus, 'files');
  assertNoEmptyDocumentSurfaces(normalized);
  assert.ok(state.surfaces.main);
});

void test('committed last-context moves remove the empty source surface', () => {
  const handle = testHandle(windowState({
    contexts: { a: context('a'), b: context('b'), 'file-picker': context('file-picker', 'file-picker') },
    focus: 'main',
    layout: row(surfaceNode('files'), row(surfaceNode('main'), surfaceNode('right'), 0.5)),
    surfaces: {
      files: workspaceSurface('files', ['file-picker']),
      main: documentSurface('main', ['a']),
      right: documentSurface('right', ['b']),
    },
  }));

  commitWindowManagerState(handle, (doc) => {
    dropContext(doc, 'main', 'a', { area: 'tabs', surfaceId: 'right' });
  });

  const state = handle.doc();
  assert.equal(state.surfaces.main, undefined);
  assert.deepEqual(state.surfaces.right.contexts, ['b', 'a']);
  assert.equal(state.focus, 'right');
  assert.equal(layoutSurfaceIds(state.layout).includes('main'), false);
  assertNoEmptyDocumentSurfaces(state);
});

void test('committed edge drops keep the new split surface and remove the empty source leaf', () => {
  const handle = testHandle(windowState({
    contexts: { a: context('a'), 'file-picker': context('file-picker', 'file-picker') },
    focus: 'main',
    layout: row(surfaceNode('files'), surfaceNode('main')),
    surfaces: {
      files: workspaceSurface('files', ['file-picker']),
      main: documentSurface('main', ['a']),
    },
  }));

  commitWindowManagerState(handle, (doc) => {
    dropContext(doc, 'main', 'a', {
      area: 'content',
      path: ['second'],
      surfaceId: 'main',
      zone: 'right',
    });
  });

  const state = handle.doc();
  const [surfaceId] = documentSurfaceIds(state);
  assert.equal(state.surfaces.main, undefined);
  assert.equal(typeof surfaceId, 'string');
  assert.equal(surfaceId, 'surface-3');
  assert.deepEqual(state.surfaces[surfaceId].contexts, ['a']);
  assert.deepEqual(layoutSurfaceIds(state.layout), ['files', surfaceId]);
  assertNoEmptyDocumentSurfaces(state);
});

void test('normalizer preserves preview-only document surfaces and repairs active context', () => {
  const state = windowState({
    contexts: { p: context('p') },
    focus: 'preview',
    layout: surfaceNode('preview'),
    surfaces: {
      preview: {
        activeContext: 'stale',
        contexts: [],
        id: 'preview',
        previewContext: 'p',
        role: SurfaceRole.DocumentSet,
      },
    },
  });

  const normalized = normalizeWindowManagerState(state);

  assert.deepEqual(documentSurfaceIds(normalized), ['preview']);
  assert.equal(normalized.surfaces.preview.activeContext, 'p');
  assertNoEmptyDocumentSurfaces(normalized);
});

void test('opening the first document creates a content-bearing main surface', () => {
  const handle = testHandle(windowState({
    contexts: { 'file-picker': context('file-picker', 'file-picker') },
    focus: 'files',
    layout: surfaceNode('files'),
    surfaces: {
      files: workspaceSurface('files', ['file-picker']),
    },
  }));

  commitWindowManagerState(handle, (doc) => {
    openContext(doc, context('a'), 'files');
  });

  const state = handle.doc();
  assert.deepEqual(state.surfaces.main.contexts, ['a']);
  assert.equal(state.surfaces.main.activeContext, 'a');
  assert.equal(state.focus, 'main');
  assert.deepEqual(layoutSurfaceIds(state.layout), ['files', 'main']);
  assertNoEmptyDocumentSurfaces(state);
});

void test('closing the final document collapses back to the hidden workspace surface', () => {
  const handle = testHandle(windowState({
    contexts: { a: context('a'), 'file-picker': context('file-picker', 'file-picker') },
    focus: 'main',
    layout: surfaceNode('main'),
    surfaces: {
      files: workspaceSurface('files', ['file-picker']),
      main: documentSurface('main', ['a']),
    },
  }));

  commitWindowManagerState(handle, (doc) => {
    closeContext(doc, 'main', 'a');
  });

  const state = handle.doc();
  assert.equal(state.surfaces.main, undefined);
  assert.equal(state.contexts.a, undefined);
  assert.deepEqual(state.layout, surfaceNode('files'));
  assert.equal(state.focus, 'files');
  assertNoEmptyDocumentSurfaces(state);
});

function testHandle(initialState) {
  let state = structuredClone(initialState);
  return {
    change(update) {
      update(state);
    },
    doc() {
      return state;
    },
  };
}

function windowState({ contexts, focus, layout, surfaces }) {
  return {
    '@patchpit': { type: 'window-manager-state' },
    contexts,
    extension: 'automerge',
    focus,
    layout,
    mimeType: 'application/vnd.automerge',
    name: 'window-manager.automerge',
    surfaces,
  };
}

function context(id, app = 'viewer') {
  return {
    app,
    container: { mounts: [] },
    id,
    title: id,
    url: `automerge:${id}`,
  };
}

function workspaceSurface(id, contexts) {
  return {
    ...(contexts[0] === undefined ? {} : { activeContext: contexts[0] }),
    contexts,
    id,
    role: SurfaceRole.WorkspaceView,
  };
}

function documentSurface(id, contexts) {
  return {
    ...(contexts[0] === undefined ? {} : { activeContext: contexts[0] }),
    contexts,
    id,
    role: SurfaceRole.DocumentSet,
  };
}

function surfaceNode(surfaceId) {
  return { kind: WindowManagerNodeKind.Surface, surfaceId };
}

function row(first, second, ratio = 0.2) {
  return {
    direction: SplitDirection.Row,
    first,
    kind: WindowManagerNodeKind.Split,
    ratio,
    second,
  };
}

function documentSurfaceIds(state) {
  return Object.values(state.surfaces)
    .filter((surface) => surface.role === SurfaceRole.DocumentSet)
    .map((surface) => surface.id);
}

function layoutSurfaceIds(node) {
  if (node.kind === WindowManagerNodeKind.Surface) return [node.surfaceId];
  return [...layoutSurfaceIds(node.first), ...layoutSurfaceIds(node.second)];
}

function assertNoEmptyDocumentSurfaces(state) {
  const emptySurfaceIds = Object.values(state.surfaces)
    .filter((surface) => (
      surface.role === SurfaceRole.DocumentSet
      && surface.contexts.length === 0
      && surface.previewContext === undefined
    ))
    .map((surface) => surface.id);
  assert.deepEqual(emptySurfaceIds, []);
}
