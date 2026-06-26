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

    expect(entries.map((entry) => entry.path)).toEqual(['/home', '/i&s', '/patchpit']);
    expect(entries.every((entry) => entry.path !== '/')).toBe(true);
  });

  it('exposes app shortcuts and running windows as paths', () => {
    const state = createInitialKernelState();

    expect(listPath(state, '/patchpit/apps').map((entry) => entry.name)).toEqual([
      '3d-viewer',
      'files',
      'source',
      'terminal',
      'viewer'
    ]);
    expect(listPath(state, '/patchpit/run/apps').map((entry) => entry.name)).toEqual([
      'files-1',
      'terminal-3',
      'viewer-2'
    ]);
    expect(readPath(state, '/patchpit/run/apps/terminal-3').kind).toBe('file');
  });

  it('starts files left, viewer main, and terminal bottom', () => {
    const state = createInitialKernelState();

    expect(
      state.windows.map((window) => ({
        id: window.id,
        region: window.layout.region,
        kind: window.state.kind
      }))
    ).toEqual([
      { id: 'files-1', region: 'left', kind: 'files' },
      { id: 'viewer-2', region: 'main', kind: 'viewer' },
      { id: 'terminal-3', region: 'bottom', kind: 'terminal' }
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
    const url = appUrl('/3d-viewer/index.html', { path: '/home/todo.md' });

    expect(url).toBe('/3d-viewer/index.html#{"path":"/home/todo.md"}');
    expect(url).not.toContain('?');
  });

  it('keeps standalone shell help explicit about URL shortcut boundaries', () => {
    const state = createInitialKernelState();
    const terminal = state.windows.find((window) => window.state.kind === 'terminal');
    const next = runTerminalCommand(state, terminal?.id ?? '', 'help', browser);

    expect(next.windows.find((window) => window.id === terminal?.id)?.state).toMatchObject({
      kind: 'terminal',
      lines: expect.arrayContaining([
        'url shortcuts such as 3d-viewer use root pnpm dev; pnpm dev:shell serves shell only'
      ])
    });
  });
});
