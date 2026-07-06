import assert from 'node:assert/strict';
import test from 'node:test';
import { SurfaceRole } from '@patchpit/system';
import { launcherItems } from './launch-router.ts';

void test('launcher items are derived from installed app manifests', () => {
  const launches = [];
  const items = launcherItems({
    filePickerStateUrl: 'automerge:file-picker-state',
    focusedAppId: 'terminal',
    installedApps: [
      app('file-picker', 'File Picker', '📁', SurfaceRole.WorkspaceView, { stateType: 'file-picker-state' }),
      app('terminal', 'Terminal', '💬', SurfaceRole.DocumentSet, { stateType: 'terminal-state' }),
      app('hello-world', 'Hello World', '👋', SurfaceRole.DocumentSet, { entryUrl: 'automerge:hello-main' }),
    ],
    launchApp: (input) => launches.push(input),
    rootUrl: 'automerge:root',
    runtimeStateUrl: 'automerge:runtime-state',
  });

  assert.deepEqual(items.map((item) => [item.app, item.label, item.emoji, item.active]), [
    ['file-picker', 'Files', '📁', false],
    ['terminal', 'Terminal', '💬', true],
    ['hello-world', 'Hello World', '👋', false],
  ]);

  items[1].launch();
  items[2].launch();

  assert.equal(launches[0].app, 'terminal');
  assert.equal(launches[0].role, SurfaceRole.DocumentSet);
  assert.equal(launches[0].context, undefined);
  assert.equal(launches[1].app, 'hello-world');
  assert.equal(launches[1].context.app, 'hello-world');
  assert.equal(launches[1].context.url, 'automerge:hello-main');
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
    },
    manifestUrl: `automerge:${id}-manifest`,
    packagePath: `/apps/${id}`,
  };
}
