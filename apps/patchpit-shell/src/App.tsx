import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import {
  closeWindow,
  createInitialKernelState,
  focusWindow,
  launchShortcut,
  listPath,
  openPath,
  parentPath,
  readPath,
  runTerminalCommand,
  setColorMode,
  selectPath,
  setFilesPath,
  setViewerMode,
  windowTitle,
  type AppWindow,
  type BrowserInfo,
  type ColorMode,
  type FileRead,
  type KernelState,
  type TerminalState,
  type ViewerMode
} from './kernel';

type TerminalAppWindow = AppWindow & { readonly state: TerminalState };

export function App() {
  const [kernel, setKernel] = useState(createInitialKernelState);
  const browser = readBrowserInfo();

  return (
    <main className="shell" data-color-mode={kernel.colorMode}>
      <style>{css}</style>
      <nav className="bar" aria-label="launcher">
        <div className="shortcuts">
          {kernel.shortcuts.map((shortcut) => (
            <button key={shortcut.id} type="button" onClick={() => setKernel((state) => launchShortcut(state, shortcut.id))}>
              {shortcut.title}
            </button>
          ))}
        </div>
        <div className="tasks">
          {kernel.windows.map((window) => (
            <span key={window.id} className="task">
              <button type="button" onClick={() => setKernel((state) => focusWindow(state, window.id))}>
                {window.title}
              </button>
            </span>
          ))}
        </div>
        <ColorModeControls colorMode={kernel.colorMode} setKernel={setKernel} />
      </nav>
      <section className="workspace" aria-label="open windows">
        <WindowRegion browser={browser} kernel={kernel} region="left" setKernel={setKernel} />
        <WindowRegion browser={browser} kernel={kernel} region="main" setKernel={setKernel} />
        <WindowRegion browser={browser} kernel={kernel} region="bottom" setKernel={setKernel} />
      </section>
    </main>
  );
}

function WindowRegion({
  browser,
  kernel,
  region,
  setKernel
}: {
  readonly browser: BrowserInfo;
  readonly kernel: KernelState;
  readonly region: AppWindow['layout']['region'];
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
}) {
  const windows = kernel.windows.filter((window) => window.layout.region === region);

  return (
    <section className={`region ${region}`} aria-label={`${region} windows`}>
      {windows.map((window) => (
        <WindowPane
          browser={browser}
          focused={kernel.focusedWindowId === window.id}
          key={window.id}
          kernel={kernel}
          setKernel={setKernel}
          window={window}
        />
      ))}
    </section>
  );
}

function WindowPane({
  browser,
  focused,
  kernel,
  setKernel,
  window
}: {
  readonly browser: BrowserInfo;
  readonly focused: boolean;
  readonly kernel: KernelState;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
  readonly window: AppWindow;
}) {
  return (
    <article className={focused ? 'window focused' : 'window'} onPointerDown={() => setKernel((state) => focusWindow(state, window.id))}>
      <header className="windowHeader">
        <strong>{windowTitle(window)}</strong>
        <button type="button" aria-label={`close ${windowTitle(window)}`} onClick={() => setKernel((state) => closeWindow(state, window.id))}>
          x
        </button>
      </header>
      <div className="windowBody">
        {window.state.kind === 'files' ? (
          <FilesWindow kernel={kernel} setKernel={setKernel} window={window} />
        ) : window.state.kind === 'viewer' ? (
          <ViewerWindow kernel={kernel} setKernel={setKernel} window={window} />
        ) : window.state.kind === 'url' ? (
          <UrlWindow window={window} />
        ) : isTerminalWindow(window) ? (
          <TerminalWindow browser={browser} colorMode={kernel.colorMode} setKernel={setKernel} window={window} />
        ) : (
          null
        )}
      </div>
    </article>
  );
}

function isTerminalWindow(window: AppWindow): window is TerminalAppWindow {
  return window.state.kind === 'terminal';
}

function ColorModeControls({
  colorMode,
  setKernel
}: {
  readonly colorMode: ColorMode;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
}) {
  return (
    <fieldset className="colorModes" aria-label="color mode">
      <ColorModeRadio colorMode={colorMode} mode="light" setKernel={setKernel} symbol="○" />
      <ColorModeRadio colorMode={colorMode} mode="auto" setKernel={setKernel} symbol="◐" />
      <ColorModeRadio colorMode={colorMode} mode="dark" setKernel={setKernel} symbol="●" />
    </fieldset>
  );
}

function ColorModeRadio({
  colorMode,
  mode,
  setKernel,
  symbol
}: {
  readonly colorMode: ColorMode;
  readonly mode: ColorMode;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
  readonly symbol: string;
}) {
  return (
    <label title={mode}>
      <input
        checked={colorMode === mode}
        name="color-mode"
        onChange={() => setKernel((state) => setColorMode(state, mode))}
        type="radio"
      />
      <span aria-hidden="true">{symbol}</span>
      <span className="srOnly">{mode}</span>
    </label>
  );
}

function FilesWindow({
  kernel,
  setKernel,
  window
}: {
  readonly kernel: KernelState;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
  readonly window: AppWindow;
}) {
  if (window.state.kind !== 'files') {
    return null;
  }

  const entries = listPath(kernel, window.state.path);
  const currentPath = window.state.path;

  return (
    <div className="fileManager">
      <div className="pathRow">
        <button type="button" onClick={() => setKernel((state) => setFilesPath(state, window.id, parentPath(currentPath)))}>
          ..
        </button>
        <code>{currentPath}</code>
      </div>
      <ul className="fileList">
        {entries.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() =>
                setKernel((state) => {
                  const selected = selectPath(state, entry.path);
                  return entry.kind === 'folder' ? setFilesPath(selected, window.id, entry.path) : openPath(selected, entry.path);
                })
              }
            >
              <span>{entry.kind === 'folder' ? '/' : '-'}</span>
              <span>{entry.name}</span>
              <span>{entry.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ViewerWindow({
  kernel,
  setKernel,
  window
}: {
  readonly kernel: KernelState;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
  readonly window: AppWindow;
}) {
  if (window.state.kind !== 'viewer') {
    return null;
  }

  const read = readPath(kernel, window.state.path);

  return (
    <div className="viewer">
      <div className="viewerTools">
        <code>{window.state.path}</code>
        <ModeRadio mode="view" selected={window.state.mode} setKernel={setKernel} windowId={window.id} />
        <ModeRadio mode="source" selected={window.state.mode} setKernel={setKernel} windowId={window.id} />
      </div>
      {renderRead(read, window.state.mode)}
    </div>
  );
}

function ModeRadio({
  mode,
  selected,
  setKernel,
  windowId
}: {
  readonly mode: ViewerMode;
  readonly selected: ViewerMode;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
  readonly windowId: string;
}) {
  return (
    <label>
      <input
        checked={selected === mode}
        name={`mode-${windowId}`}
        onChange={() => setKernel((state) => setViewerMode(state, windowId, mode))}
        type="radio"
      />
      {mode}
    </label>
  );
}

function UrlWindow({ window }: { readonly window: AppWindow }) {
  if (window.state.kind !== 'url') {
    return null;
  }

  return <iframe className="appFrame" src={window.state.src} title={window.title} />;
}

function TerminalWindow({
  browser,
  colorMode,
  setKernel,
  window
}: {
  readonly browser: BrowserInfo;
  readonly colorMode: ColorMode;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
  readonly window: TerminalAppWindow;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef('');
  const renderedRef = useRef('');
  const terminalRef = useRef<Terminal | null>(null);
  const terminalStateRef = useRef(window.state);
  const browserRef = useRef(browser);

  terminalStateRef.current = window.state;
  browserRef.current = browser;

  useEffect(() => {
    const host = hostRef.current;

    if (host === null || terminalRef.current !== null) {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      letterSpacing: 0,
      theme: terminalTheme(colorMode)
    });
    terminalRef.current = terminal;
    terminal.open(host);
    renderTerminal(terminal, terminalStateRef.current, inputRef.current, renderedRef);
    terminal.focus();

    const subscription = terminal.onData((data) => {
      if (data.startsWith('\x1B')) {
        return;
      }

      for (const character of data) {
        if (character === '\r') {
          const command = inputRef.current;
          inputRef.current = '';
          setKernel((state) => runTerminalCommand(state, window.id, command, browserRef.current));
        } else if (character === '\u007F') {
          inputRef.current = inputRef.current.slice(0, -1);
          renderTerminal(terminal, terminalStateRef.current, inputRef.current, renderedRef);
        } else if (character >= ' ' && character !== '\u007F') {
          inputRef.current += character;
          renderTerminal(terminal, terminalStateRef.current, inputRef.current, renderedRef);
        }
      }
    });

    return () => {
      subscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [setKernel, window.id]);

  useEffect(() => {
    const terminal = terminalRef.current;

    if (terminal === null) {
      return;
    }

    terminal.options.theme = terminalTheme(colorMode);
    renderTerminal(terminal, window.state, inputRef.current, renderedRef);
    terminal.focus();
  }, [colorMode, window.state]);

  return <div className="terminal" ref={hostRef} role="application" aria-label="terminal" />;
}

function renderTerminal(
  terminal: Terminal,
  state: Extract<AppWindow['state'], { readonly kind: 'terminal' }>,
  input: string,
  renderedRef: { current: string }
) {
  const content = [...state.lines, `${state.cwd} $ ${input}`].join('\r\n');

  if (renderedRef.current === content) {
    return;
  }

  renderedRef.current = content;
  terminal.write(`\x1b[3J\x1b[2J\x1b[H${content}`);
}

function terminalTheme(colorMode: ColorMode) {
  const dark =
    colorMode === 'dark' ||
    (colorMode === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return dark
    ? { background: '#050505', foreground: '#f4f4f4', cursor: '#f4f4f4', selectionBackground: '#666666' }
    : { background: '#ffffff', foreground: '#050505', cursor: '#050505', selectionBackground: '#cccccc' };
}

function renderRead(read: FileRead, mode: ViewerMode) {
  if (read.kind === 'missing') {
    return <pre className="editor">{read.message}</pre>;
  }

  if (read.kind === 'folder') {
    return (
      <ul className="fileList">
        {read.entries.map((entry) => (
          <li key={entry.path}>
            <span>{entry.kind}</span>
            <code>{entry.path}</code>
          </li>
        ))}
      </ul>
    );
  }

  if (mode === 'view' && read.mediaType === 'application/json') {
    return <pre className="editor">{JSON.stringify(JSON.parse(read.text), null, 2)}</pre>;
  }

  return <pre className="editor">{withLineNumbers(read.text)}</pre>;
}

function withLineNumbers(text: string): string {
  return text
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(3, ' ')}  ${line}`)
    .join('\n');
}

function readBrowserInfo(): BrowserInfo {
  return {
    fullscreenEnabled: document.fullscreenEnabled,
    href: window.location.href,
    online: navigator.onLine,
    userAgent: navigator.userAgent
  };
}

const css = `
* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
}

button,
input {
  background: Canvas;
  border: 2px solid currentColor;
  color: CanvasText;
  font: inherit;
  padding: 2px 6px;
}

button {
  cursor: pointer;
}

.srOnly {
  height: 1px;
  margin: -1px;
  overflow: hidden;
  position: absolute;
  width: 1px;
}

.shell {
  color: CanvasText;
  background: Canvas;
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  height: 100%;
  line-height: 1.35;
}

.shell[data-color-mode='light'] {
  color-scheme: light;
}

.shell[data-color-mode='dark'] {
  color-scheme: dark;
}

.shell[data-color-mode='auto'] {
  color-scheme: light dark;
}

.bar {
  border-bottom: 2px solid currentColor;
  display: flex;
  min-height: 40px;
  overflow: hidden;
}

.colorModes {
  align-items: center;
  border: 0;
  border-left: 2px solid currentColor;
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 4px;
}

.colorModes label {
  cursor: pointer;
  display: grid;
  place-items: center;
}

.colorModes input {
  appearance: none;
  height: 0;
  margin: 0;
  opacity: 0;
  padding: 0;
  position: absolute;
  width: 0;
}

.colorModes span[aria-hidden='true'] {
  border: 2px solid transparent;
  display: inline-block;
  min-width: 2ch;
  padding: 2px;
  text-align: center;
}

.colorModes input:checked + span {
  border-color: currentColor;
}

.colorModes input:focus-visible + span {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.shortcuts,
.tasks,
.task {
  display: flex;
  gap: 4px;
}

.shortcuts,
.tasks {
  align-items: center;
  padding: 4px;
}

.tasks {
  margin-left: auto;
  overflow-x: auto;
}

.workspace {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(220px, 30%) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) minmax(160px, 28%);
  overflow: auto;
}

.region {
  display: flex;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}

.left {
  border-right: 2px solid currentColor;
  grid-column: 1;
  grid-row: 1;
}

.main {
  grid-column: 2;
  grid-row: 1;
}

.bottom {
  border-top: 2px solid currentColor;
  grid-column: 1 / -1;
  grid-row: 2;
}

.window {
  border: 2px solid currentColor;
  display: flex;
  flex: 1 1 320px;
  flex-direction: column;
  margin: -2px;
  min-height: 0;
  min-width: min(100%, 220px);
}

.focused {
  outline: 2px solid currentColor;
  outline-offset: -8px;
}

.windowHeader,
.pathRow,
.viewerTools {
  align-items: center;
  display: flex;
  gap: 8px;
}

.windowHeader {
  border-bottom: 2px solid currentColor;
  justify-content: space-between;
  padding: 4px;
}

.windowBody {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.fileManager,
.viewer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100%;
}

.fileList {
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.fileList button,
.fileList li {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: flex-start;
  text-align: left;
  width: 100%;
}

.viewerTools {
  border-bottom: 2px solid currentColor;
  flex-wrap: wrap;
  padding-bottom: 8px;
}

.editor,
.terminal {
  border: 2px solid currentColor;
  flex: 1;
  margin: 0;
  overflow: auto;
  padding: 8px;
  white-space: pre-wrap;
}

.terminal {
  min-height: 100%;
  padding: 0;
  white-space: normal;
}

.terminal .xterm {
  height: 100%;
  padding: 8px;
}

.terminal .xterm-viewport {
  overflow-y: auto;
}

.appFrame {
  border: 0;
  flex: 1;
  min-height: 100%;
  width: 100%;
}

@media (max-width: 760px) {
  .workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(160px, 28%) minmax(220px, 1fr) minmax(160px, 28%);
  }

  .left,
  .main,
  .bottom {
    grid-column: 1;
  }

  .left {
    border-bottom: 2px solid currentColor;
    border-right: 0;
    grid-row: 1;
  }

  .main {
    grid-row: 2;
  }

  .bottom {
    grid-row: 3;
  }
}
`;
