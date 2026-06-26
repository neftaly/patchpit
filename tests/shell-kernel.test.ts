import { describe, expect, it } from 'vitest';
import {
  appUrl,
  closeWindow,
  createInitialKernelState,
  launchShortcut,
  listPath,
  openPath,
  readPath,
  runTerminalCommand,
  setColorMode,
  type BrowserInfo
} from '../apps/patchpit-shell/src/kernel';

const browser: BrowserInfo = {
  fullscreenEnabled: true,
  href: 'http://localhost/',
  online: true,
  userAgent: 'vitest'
};

describe('patchpit shell kernel', () => {
  it('lists root children without recursing into root itself', () => {
    const state = createInitialKernelState();
    const entries = listPath(state, '/');

    expect(entries.map((entry) => entry.path)).toEqual(['/device', '/home', '/i&s', '/patchpit']);
    expect(entries.every((entry) => entry.path !== '/')).toBe(true);
  });

  it('exposes a device OPFS bridge fixture without claiming final storage semantics', () => {
    const state = createInitialKernelState();

    expect(listPath(state, '/device').map((entry) => entry.path)).toEqual(['/device/opfs']);
    expect(listPath(state, '/device/opfs').map((entry) => entry.path)).toEqual([
      '/device/opfs/fixtures',
      '/device/opfs/readme.txt'
    ]);
    expect(readPath(state, '/device/opfs/fixtures/session.json')).toMatchObject({
      kind: 'file',
      mediaType: 'application/json'
    });
  });

  it('keeps color mode in kernel state', () => {
    const state = setColorMode(createInitialKernelState(), 'dark');

    expect(state.colorMode).toBe('dark');
  });

  it('exposes app shortcuts and running windows as paths', () => {
    const state = createInitialKernelState();

    expect(listPath(state, '/patchpit/apps').map((entry) => entry.name)).toEqual([
      '3d-viewer',
      'files',
      'infinigen',
      'roleplay',
      'source',
      'terminal',
      'ui-lab',
      'viewer'
    ]);
    expect(listPath(state, '/patchpit/run/apps').map((entry) => entry.name)).toEqual([
      'files-1',
      'infinigen-2',
      'terminal-3'
    ]);
    expect(readPath(state, '/patchpit/run/apps/terminal-3').kind).toBe('file');
  });

  it('documents iOS roleplay and budget telemetry surfaces', () => {
    const state = createInitialKernelState();

    expect(readPath(state, '/i&s/roleplay-ios.md')).toMatchObject({
      kind: 'file',
      mediaType: 'text/markdown'
    });
    expect(readPath(state, '/patchpit/run/usage/session-budget.json')).toMatchObject({
      kind: 'file',
      mediaType: 'application/json'
    });
    expect(listPath(state, '/patchpit/run').map((entry) => entry.name)).toContain('usage');
  });

  it('starts files left, Infinigen main, and terminal bottom', () => {
    const state = createInitialKernelState();

    expect(
      state.windows.map((window) => ({
        id: window.id,
        region: window.layout.region,
        shortcutId: window.shortcutId,
        kind: window.state.kind,
        src: window.state.kind === 'url' ? window.state.src : undefined
      }))
    ).toEqual([
      { id: 'files-1', region: 'left', shortcutId: 'files', kind: 'files', src: undefined },
      {
        id: 'infinigen-2',
        region: 'main',
        shortcutId: 'infinigen',
        kind: 'url',
        src: '/infinigen/index.html#{"preset":"linz-nz","quality":"high","seed":"tamaki"}'
      },
      { id: 'terminal-3', region: 'bottom', shortcutId: 'terminal', kind: 'terminal', src: undefined }
    ]);
  });

  it('launches and closes windows without hiding runtime state in the UI', () => {
    const launched = launchShortcut(createInitialKernelState(), 'viewer');
    const viewer = launched.windows.at(-1);

    expect(viewer?.id).toBe('viewer-4');
    expect(readPath(launched, '/patchpit/run/apps/viewer-4').kind).toBe('file');

    const closed = closeWindow(launched, 'viewer-4');

    expect(readPath(closed, '/patchpit/run/apps/viewer-4')).toMatchObject({ kind: 'missing' });
  });

  it('opens files through the same path API used by the file manager and terminal', () => {
    const state = openPath(createInitialKernelState(), '/home/todo.md');
    const opened = state.windows.at(-1);

    expect(opened?.state).toMatchObject({ kind: 'viewer', path: '/home/todo.md' });
    expect(readPath(state, '/home/todo.md')).toMatchObject({ kind: 'file', mediaType: 'text/markdown' });
  });

  it('opens glTF namespace files in the 3D viewer URL app', () => {
    const state = openPath(createInitialKernelState(), '/home/DamagedHelmet.gltf');
    const opened = state.windows.at(-1);

    expect(readPath(state, '/home/DamagedHelmet.gltf')).toMatchObject({
      assetUrl: '/3d-viewer/DamagedHelmet/DamagedHelmet.gltf',
      kind: 'file',
      mediaType: 'model/gltf+json'
    });
    expect(opened?.state).toEqual({
      kind: 'url',
      src: '/3d-viewer/index.html#{"src":"/3d-viewer/DamagedHelmet/DamagedHelmet.gltf"}'
    });
  });

  it('runs terminal commands over host capabilities and namespace paths', () => {
    const state = createInitialKernelState();
    const terminal = state.windows.find((window) => window.state.kind === 'terminal');

    expect(terminal).toBeDefined();

    const next = runTerminalCommand(state, terminal?.id ?? '', 'launch viewer', browser);

    expect(next.windows.at(-1)?.id).toBe('viewer-4');
    expect(
      next.windows.find((window) => window.id === terminal?.id)?.state
    ).toMatchObject({
      kind: 'terminal',
      lines: expect.arrayContaining(['$ launch viewer', 'launched viewer'])
    });
  });

  it('builds app URLs from hash JSON without query strings', () => {
    const url = appUrl('/3d-viewer/index.html', { src: '/assets/scene.gltf' });

    expect(url).toBe('/3d-viewer/index.html#{"src":"/assets/scene.gltf"}');
    expect(url).not.toContain('?');
  });

  it('keeps standalone shell help explicit about URL shortcut boundaries', () => {
    const state = createInitialKernelState();
    const terminal = state.windows.find((window) => window.state.kind === 'terminal');
    const next = runTerminalCommand(state, terminal?.id ?? '', 'help', browser);

    expect(next.windows.find((window) => window.id === terminal?.id)?.state).toMatchObject({
      kind: 'terminal',
      lines: expect.arrayContaining([
        'open /i&s/roleplay-ios.md rehearses the iOS screenshot-to-app flow',
        'url shortcuts such as 3d-viewer and infinigen use root pnpm dev; pnpm dev:shell serves shell only'
      ])
    });
  });
});
