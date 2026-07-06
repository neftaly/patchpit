import assert from 'node:assert/strict';
import test from 'node:test';
import { SurfaceRole } from '@patchpit/system';
import { launcherItems } from './launch-router.ts';

void test('launcher items are derived from installed app manifests', () => {
  const launches = [];
  const items = launcherItems({
    focusedAppId: 'terminal',
    installedApps: [
      app('file-picker', 'File Picker', '📁', SurfaceRole.WorkspaceView, { stateType: 'file-picker-state' }),
      app('terminal', 'Terminal', '💬', SurfaceRole.DocumentSet, { stateType: 'terminal-state' }),
      app('viewer', 'Viewer', '📄', SurfaceRole.DocumentSet, { entryKind: 'shell-compat' }),
      app('hello-world', 'Hello World', '👋', SurfaceRole.DocumentSet, { entryUrl: 'automerge:hello-main' }),
    ],
    launchApp: (input) => launches.push(input),
  });

  assert.deepEqual(items.map((item) => [item.app, item.label, item.emoji, item.active]), [
    ['file-picker', 'Files', '📁', false],
    ['terminal', 'Terminal', '💬', true],
    ['viewer', 'Viewer', '📄', false],
    ['hello-world', 'Hello World', '👋', false],
  ]);

  items[0].launch();
  items[1].launch();
  items[2].launch();
  items[3].launch();

  assert.equal(launches[0].app, 'file-picker');
  assert.equal(launches[0].role, SurfaceRole.WorkspaceView);
  assert.equal(launches[0].behavior, 'toggle-surface');
  assert.equal(launches[0].context, undefined);
  assert.equal(launches[1].app, 'terminal');
  assert.equal(launches[1].role, SurfaceRole.DocumentSet);
  assert.equal(launches[1].context, undefined);
  assert.equal(launches[2].app, 'viewer');
  assert.equal(launches[2].context, undefined);
  assert.equal(launches[3].app, 'hello-world');
  assert.equal(launches[3].context, undefined);
});

function app(id, name, icon, role, options = {}) {
  return {
    entry: options.entryUrl === undefined
      ? undefined
      : {
          kind: 'file',
          mediaType: 'text/javascript',
          name: 'main.js',
          sourceUrl: null,
          text: '',
          url: options.entryUrl,
        },
    icon,
    manifest: {
      '@patchpit': { type: 'app-manifest' },
      entry: 'main.js',
      entryKind: options.entryKind ?? 'module',
      extension: 'am',
      icons: [{ emoji: icon }],
      id,
      manifestVersion: 1,
      mimeType: 'application/vnd.automerge',
      name,
      surfaces: [
        {
          role,
          ...(options.stateType === undefined ? {} : { state: { type: options.stateType } }),
        },
      ],
      version: '0.0.0',
    },
    manifestUrl: `automerge:${id}-manifest`,
    packagePath: `/apps/${id}`,
  };
}
