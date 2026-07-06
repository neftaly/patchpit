import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSeedFilesystem,
  filePickerIntentBoundary,
  projectFilesystem,
  routeIntentBoundary,
} from '@patchpit/system';
import {
  filePickerSelectUrlIntent,
  routeOpenIntent,
  runtimeIntentRequestRow,
} from '@patchpit/system/runtime';
import {
  createSandboxPackageLoadPlan,
  sandboxFilesystemAppEntry,
} from './sandbox-package-loader.ts';
import {
  createSandboxAppServiceBridge,
  sandboxAppProtocol,
} from './sandbox-service-bridge.ts';
import { installedAppsFromFilesystem } from './installed-apps.ts';

void test('sandbox module entries resolve package-relative imports', async () => {
  const entry = appEntry({
    entryKind: 'module',
    entryPath: 'app.js',
    files: [
      file('app.js', 'text/javascript', "import { message } from './lib/message.js'; export default () => message;"),
      folder('lib', [
        file('message.js', 'text/javascript', "export const message = 'hello from package module';"),
      ]),
    ],
  });

  const plan = createSandboxPackageLoadPlan(entry);

  assert.equal(plan.kind, 'module');
  if (plan.kind !== 'module') return;
  const module = await import(plan.entryModuleUrl);
  assert.equal(module.default(), 'hello from package module');
});

void test('sandbox html entries rewrite package-relative modules and assets', () => {
  const entry = appEntry({
    entryKind: 'html',
    entryPath: 'index.html',
    files: [
      file(
        'index.html',
        'text/html',
        '<!doctype html><html><head><link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script></head><body></body></html>',
      ),
      file('app.js', 'text/javascript', "export default (env) => { window.appId = env.appId; };"),
      file('style.css', 'text/css', 'body { color: red; }'),
    ],
  });

  const plan = createSandboxPackageLoadPlan(entry);

  assert.equal(plan.kind, 'html');
  if (plan.kind !== 'html') return;
  assert.match(plan.html, /<script type="module">/);
  assert.match(plan.html, /await import\("data:text\/javascript;charset=utf-8,/);
  assert.match(plan.html, /href="data:text\/css;charset=utf-8,/);
  assert.doesNotMatch(plan.html, /src="\.\/app\.js"/);
});

void test('sandbox package loader rejects unsupported entries explicitly', () => {
  const entry = appEntry({
    entryKind: 'module',
    entryPath: 'data.json',
    files: [file('data.json', 'application/json', '{}')],
  });

  const plan = createSandboxPackageLoadPlan(entry);

  assert.deepEqual(plan, {
    error: 'Sandbox app entryKind "module" requires a JavaScript entry, got "data.json".',
    kind: 'error',
  });
});

void test('seeded file picker is a sandbox-loadable module app', async () => {
  const seed = createSeedFilesystem();
  const filesystem = projectFilesystem(seed.indexHandle.doc(), seed.rootUrl);
  assert.deepEqual(filesystem.diagnostics, []);
  assert.ok(filesystem.root);
  const filePicker = installedAppsFromFilesystem({
    getDocument: (url) => seed.documentHandles[url]?.doc(),
    root: filesystem.root,
  }).find((app) => app.manifest.id === 'file-picker');

  assert.ok(filePicker);
  assert.equal(filePicker.manifest.entry, 'app.js');
  assert.equal(filePicker.manifest.entryKind, 'module');
  assert.equal(filePicker.entry?.kind, 'file');

  const plan = createSandboxPackageLoadPlan(sandboxFilesystemAppEntry({
    entry: filePicker.entry,
    entryKind: filePicker.manifest.entryKind,
    entryPath: filePicker.manifest.entry,
    packageRoot: filePicker.packageRoot,
  }));

  assert.equal(plan.kind, 'module');
  if (plan.kind !== 'module') return;
  const module = await import(plan.entryModuleUrl);
  assert.equal(typeof module.default, 'function');
});

void test('sandbox service bridge reports host-decided capabilities', () => {
  const bridge = createSandboxAppServiceBridge({
    appId: 'viewer',
    session: { app: 'viewer', id: 'viewer:doc', url: 'automerge:doc' },
  });

  assert.deepEqual(bridge.capabilities, {
    act: false,
    open: false,
    view: true,
  });
});

void test('sandbox service bridge serves host-scoped launch view data', () => {
  const bridge = createSandboxAppServiceBridge({
    appId: 'trusted-viewer',
    session: { app: 'trusted-viewer', id: 'trusted-session', url: 'automerge:trusted' },
  });

  const response = bridge.respond(serviceRequest('view', {
    name: 'launch',
  }));

  assert.deepEqual(response, {
    id: 'request-1',
    ok: true,
    protocol: sandboxAppProtocol,
    result: {
      appId: 'trusted-viewer',
      session: { app: 'trusted-viewer', id: 'trusted-session', url: 'automerge:trusted' },
      view: 'launch',
    },
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge serves current session resource view data', () => {
  const resourceRoot = folder('root', [
    file('readme.md', 'text/markdown', '# Scoped document'),
    file('secret.md', 'text/markdown', '# Different document'),
  ]);
  const bridge = createSandboxAppServiceBridge({
    appId: 'trusted-viewer',
    resourceRoot,
    session: { app: 'trusted-viewer', id: 'trusted-session', url: 'automerge:readme.md' },
  });

  const response = bridge.respond(serviceRequest('view', {
    name: 'resource',
  }));

  assert.deepEqual(response, {
    id: 'request-1',
    ok: true,
    protocol: sandboxAppProtocol,
    result: {
      resource: {
        kind: 'file',
        mediaType: 'text/markdown',
        name: 'readme.md',
        sourceUrl: null,
        text: '# Scoped document',
        title: 'readme.md',
        url: 'automerge:readme.md',
      },
      view: 'resource',
    },
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge serves Automerge document resource text', () => {
  const resourceRoot = folder('root', [
    file('window-manager.am', 'application/vnd.automerge', '{\\n  "surfaces": {}\\n}'),
  ]);
  const bridge = createSandboxAppServiceBridge({
    appId: 'trusted-viewer',
    resourceRoot,
    session: { app: 'trusted-viewer', id: 'trusted-session', url: 'automerge:window-manager.am' },
  });

  const response = bridge.respond(serviceRequest('view', {
    name: 'resource',
  }));

  assert.deepEqual(response, {
    id: 'request-1',
    ok: true,
    protocol: sandboxAppProtocol,
    result: {
      resource: {
        kind: 'file',
        mediaType: 'application/vnd.automerge',
        name: 'window-manager.am',
        sourceUrl: null,
        text: '{\\n  "surfaces": {}\\n}',
        title: 'window-manager.am',
        url: 'automerge:window-manager.am',
      },
      view: 'resource',
    },
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge serves scoped folder resource summaries', () => {
  const resourceRoot = folder('root', [
    folder('docs', [
      file('guide.md', 'text/markdown', '# Guide'),
      file('photo.png', 'image/png', '<binary-placeholder>'),
    ]),
  ]);
  const bridge = createSandboxAppServiceBridge({
    appId: 'trusted-viewer',
    resourceRoot,
    session: { app: 'trusted-viewer', id: 'trusted-session', url: 'automerge:docs' },
  });

  const response = bridge.respond(serviceRequest('view', {
    name: 'resource',
  }));

  assert.deepEqual(response, {
    id: 'request-1',
    ok: true,
    protocol: sandboxAppProtocol,
    result: {
      resource: {
        children: [
          {
            kind: 'file',
            mediaType: 'text/markdown',
            name: 'guide.md',
            title: 'guide.md',
            url: 'automerge:guide.md',
          },
          {
            kind: 'file',
            mediaType: 'image/png',
            name: 'photo.png',
            title: 'photo.png',
            url: 'automerge:photo.png',
          },
        ],
        kind: 'folder',
        mediaType: null,
        name: 'docs',
        title: 'docs',
        url: 'automerge:docs',
      },
      view: 'resource',
    },
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge rejects app-supplied authority scope', () => {
  const bridge = createSandboxAppServiceBridge({
    appId: 'trusted-viewer',
    session: { app: 'trusted-viewer', id: 'trusted-session', url: 'automerge:trusted' },
  });

  const response = bridge.respond(serviceRequest('view', {
    appId: 'forged-app',
    name: 'launch',
    scope: { contextId: 'forged-context', workspaceId: 'forged-workspace' },
    session: { app: 'forged-app', id: 'forged-session', url: 'automerge:forged' },
  }));

  assert.deepEqual(response, {
    error: {
      code: 'missing_scope',
      message: 'Sandbox service requests cannot carry app-supplied authority scope.',
    },
    id: 'request-1',
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge serves scoped file-picker view data', () => {
  const resourceRoot = folder('root', [
    folder('docs', [
      file('readme.md', 'text/markdown', '# Scoped document'),
    ]),
  ]);
  const bridge = createSandboxAppServiceBridge({
    appId: 'file-picker',
    filePicker: filePickerScope({ root: resourceRoot }),
    session: { app: 'file-picker', id: 'file-picker-session', url: 'automerge:file-picker-state' },
  });

  const response = bridge.respond(serviceRequest('view', {
    name: 'file-picker',
  }));

  assert.deepEqual(response, {
    id: 'request-1',
    ok: true,
    protocol: sandboxAppProtocol,
    result: {
      fileTypes: [
        { emoji: 'text', match: 'text/*' },
      ],
      root: {
        children: [
          {
            children: [
              {
                kind: 'file',
                mediaType: 'text/markdown',
                name: 'readme.md',
                title: 'readme.md',
                url: 'automerge:readme.md',
              },
            ],
            kind: 'folder',
            mediaType: null,
            name: 'docs',
            title: 'docs',
            url: 'automerge:docs',
          },
        ],
        kind: 'folder',
        mediaType: null,
        name: 'root',
        title: 'root',
        url: 'automerge:root',
      },
      session: { app: 'file-picker', id: 'file-picker-session', url: 'automerge:file-picker-state' },
      state: {
        activeUrl: 'automerge:readme.md',
        fileTypesUrl: 'automerge:file-types',
        openFolders: {
          'automerge:root': true,
        },
        rootUrl: 'automerge:root',
        selectedUrls: ['automerge:readme.md'],
      },
      view: 'file-picker',
    },
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge rejects app-supplied resource targets', () => {
  const bridge = createSandboxAppServiceBridge({
    appId: 'trusted-viewer',
    resourceRoot: folder('root', [
      file('readme.md', 'text/markdown', '# Scoped document'),
      file('secret.md', 'text/markdown', '# Different document'),
    ]),
    session: { app: 'trusted-viewer', id: 'trusted-session', url: 'automerge:readme.md' },
  });

  const response = bridge.respond(serviceRequest('view', {
    name: 'resource',
    url: 'automerge:secret.md',
  }));

  assert.deepEqual(response, {
    error: {
      code: 'missing_scope',
      message: 'Sandbox service requests cannot carry app-supplied authority scope.',
    },
    id: 'request-1',
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge rejects app-supplied file-picker action authority', async () => {
  const submitted = [];
  const bridge = createSandboxAppServiceBridge({
    appId: 'file-picker',
    filePicker: filePickerScope({ runtime: recordingRuntime(submitted) }),
    session: { app: 'file-picker', id: 'file-picker-session', url: 'automerge:file-picker-state' },
  });

  const response = await bridge.respond(serviceRequest('act', {
    name: 'route.open',
    rootUrl: 'automerge:forged-root',
    sourceSurfaceId: 'forged-surface',
    url: 'automerge:readme.md',
  }));

  assert.deepEqual(response, {
    error: {
      code: 'missing_scope',
      message: 'Sandbox service requests cannot carry app-supplied authority scope.',
    },
    id: 'request-1',
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  });
  assert.deepEqual(submitted, []);
});

void test('sandbox service bridge maps allowed file-picker actions through scoped runtime intents', async () => {
  const submitted = [];
  const bridge = createSandboxAppServiceBridge({
    appId: 'file-picker',
    filePicker: filePickerScope({ runtime: recordingRuntime(submitted) }),
    session: { app: 'file-picker', id: 'file-picker-session', url: 'automerge:file-picker-state' },
  });

  const routeResponse = await bridge.respond(serviceRequest('act', {
    name: routeOpenIntent,
    title: 'Readme',
    url: 'automerge:readme.md',
  }));
  const selectResponse = await bridge.respond(serviceRequest('act', {
    name: filePickerSelectUrlIntent,
    options: {
      selectedUrls: ['automerge:readme.md'],
    },
    url: 'automerge:readme.md',
  }));

  assert.equal(routeResponse.ok, true);
  assert.equal(selectResponse.ok, true);
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0].intent, routeOpenIntent);
  assert.equal(submitted[1].intent, filePickerSelectUrlIntent);

  assert.deepEqual(runtimeIntentRequestRow(submitted[0], routeIntentBoundary), {
    id: 'route:1',
    rootUrl: 'automerge:runtime-root',
    sourceSurfaceId: 'files-surface',
    title: 'Readme',
    url: 'automerge:readme.md',
  });
  assert.deepEqual(runtimeIntentRequestRow(submitted[1], filePickerIntentBoundary), {
    id: 'file-picker:1',
    selectedUrls: ['automerge:readme.md'],
    url: 'automerge:readme.md',
  });
});

void test('sandbox service bridge rejects views outside the host scope', () => {
  const bridge = createSandboxAppServiceBridge({
    appId: 'viewer',
    session: { app: 'viewer', id: 'viewer:doc', url: 'automerge:doc' },
  });

  const response = bridge.respond(serviceRequest('view', {
    name: 'filesystem.tree',
  }));

  assert.deepEqual(response, {
    error: {
      code: 'missing_scope',
      message: 'Sandbox view filesystem.tree is not available in this host scope.',
    },
    id: 'request-1',
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  });
});

void test('sandbox service bridge rejects unsupported act and open services', () => {
  const bridge = createSandboxAppServiceBridge({
    appId: 'viewer',
    session: { app: 'viewer', id: 'viewer:doc', url: 'automerge:doc' },
  });

  assert.deepEqual(bridge.respond(serviceRequest('act', {
    intent: 'route.open',
    scope: { contextId: 'forged-context', workspaceId: 'forged-workspace' },
  })), {
    error: {
      code: 'unsupported_service',
      message: 'Sandbox service act is not supported by this host scope.',
    },
    id: 'request-1',
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  });

  assert.deepEqual(bridge.respond(serviceRequest('open', {
    capability: 'app.private',
    scope: { contextId: 'forged-context', workspaceId: 'forged-workspace' },
  })), {
    error: {
      code: 'unsupported_service',
      message: 'Sandbox service open is not supported by this host scope.',
    },
    id: 'request-1',
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  });
});

function appEntry({
  entryKind,
  entryPath,
  files,
}) {
  const packageRoot = folder('test-app', files);
  const entry = findFile(packageRoot, entryPath);
  assert.ok(entry);
  return sandboxFilesystemAppEntry({
    entry,
    entryKind,
    entryPath,
    packageRoot,
  });
}

function folder(name, entries) {
  return {
    entries,
    kind: 'folder',
    name,
    text: '',
    url: `automerge:${name}`,
  };
}

function file(name, mediaType, text) {
  return {
    kind: 'file',
    mediaType,
    name,
    sourceUrl: null,
    text,
    url: `automerge:${name}`,
  };
}

function findFile(node, path) {
  const [part, ...rest] = path.split('/');
  assert.ok(part);
  if (node.kind !== 'folder') return null;
  const child = node.entries.find((entry) => entry.name === part);
  if (child === undefined) return null;
  if (rest.length === 0) return child.kind === 'file' ? child : null;
  return findFile(child, rest.join('/'));
}

function filePickerScope({
  root = folder('root', [
    file('readme.md', 'text/markdown', '# Scoped document'),
  ]),
  runtime = recordingRuntime([]),
} = {}) {
  return {
    fileTypes: [
      { emoji: 'text', match: 'text/*' },
    ],
    root,
    rootUrl: 'automerge:runtime-root',
    runtime,
    sourceSurfaceId: 'files-surface',
    state: {
      activeUrl: 'automerge:readme.md',
      fileTypesUrl: 'automerge:file-types',
      openFolders: {
        'automerge:root': true,
      },
      rootUrl: 'automerge:root',
      selectedUrls: ['automerge:readme.md'],
    },
  };
}

function recordingRuntime(submitted) {
  return {
    openCapability() {
      throw new Error('unexpected openCapability');
    },
    submitIntent(request) {
      submitted.push(request);
      return Promise.resolve({ heads: {}, status: 'committed' });
    },
    subscribeProjection() {
      throw new Error('unexpected subscribeProjection');
    },
  };
}

function serviceRequest(service, payload) {
  return {
    id: 'request-1',
    payload,
    protocol: sandboxAppProtocol,
    service,
    type: 'serviceRequest',
  };
}
