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
type StartBarVariant = 'menu' | 'strip';

export function App() {
  const [kernel, setKernel] = useState(createInitialKernelState);
  const [startBarVariant, setStartBarVariant] = useState<StartBarVariant>('menu');
  const browser = readBrowserInfo();

  return (
    <main className="shell" data-color-mode={kernel.colorMode} data-start-bar={startBarVariant}>
      <style>{css}</style>
      <nav className="bar" aria-label="launcher">
        {startBarVariant === 'menu' ? (
          <details className="startMenu">
            <summary>▦ patchpit</summary>
            <ShortcutButtons kernel={kernel} setKernel={setKernel} className="startMenuPanel" />
          </details>
        ) : (
          <ShortcutButtons kernel={kernel} setKernel={setKernel} className="shortcuts" />
        )}
        <div className="tasks">
          {kernel.windows.map((window) => (
            <span key={window.id} className="task">
              <button type="button" onClick={() => setKernel((state) => focusWindow(state, window.id))}>
                {window.title}
              </button>
            </span>
          ))}
        </div>
        <SessionCostMeter />
        <StartBarVariantControls startBarVariant={startBarVariant} setStartBarVariant={setStartBarVariant} />
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

type UsageSnapshot = {
  readonly costNzd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly updatedAt?: string;
};

function SessionCostMeter() {
  const startedAtRef = useRef(Date.now());
  const [now, setNow] = useState(startedAtRef.current);
  const snapshot = readUsageSnapshot();
  const elapsed = formatElapsed(now - startedAtRef.current);
  const tokenCount = (snapshot?.inputTokens ?? 0) + (snapshot?.outputTokens ?? 0);
  const costLabel = snapshot?.costNzd === undefined ? '$ --' : `$${snapshot.costNzd.toFixed(2)}`;
  const detail =
    snapshot === undefined
      ? 'inference telemetry offline'
      : `${tokenCount.toLocaleString()} tokens${snapshot.updatedAt === undefined ? '' : ` updated ${snapshot.updatedAt}`}`;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <output className="costMeter" title={`${detail}; elapsed ${elapsed}`} aria-label={`${detail}; elapsed ${elapsed}`}>
      <span aria-hidden="true">$</span>
      <span>{costLabel}</span>
      <small>{elapsed}</small>
    </output>
  );
}

function readUsageSnapshot(): UsageSnapshot | undefined {
  const global = window as unknown as { readonly __PATCHPIT_USAGE__?: UsageSnapshot };

  return global.__PATCHPIT_USAGE__;
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ShortcutButtons({
  className,
  kernel,
  setKernel
}: {
  readonly className: string;
  readonly kernel: KernelState;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
}) {
  return (
    <div className={className}>
      {kernel.shortcuts.map((shortcut) => (
        <button key={shortcut.id} type="button" onClick={() => setKernel((state) => launchShortcut(state, shortcut.id))}>
          {shortcut.title}
        </button>
      ))}
    </div>
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

function StartBarVariantControls({
  setStartBarVariant,
  startBarVariant
}: {
  readonly setStartBarVariant: (variant: StartBarVariant) => void;
  readonly startBarVariant: StartBarVariant;
}) {
  return (
    <fieldset className="barVariants" aria-label="start bar variant">
      <StartBarVariantRadio
        label="A"
        selected={startBarVariant}
        setStartBarVariant={setStartBarVariant}
        title="Patchpit start menu"
        variant="menu"
      />
      <StartBarVariantRadio
        label="B"
        selected={startBarVariant}
        setStartBarVariant={setStartBarVariant}
        title="Visible shortcut strip"
        variant="strip"
      />
    </fieldset>
  );
}

function StartBarVariantRadio({
  label,
  selected,
  setStartBarVariant,
  title,
  variant
}: {
  readonly label: string;
  readonly selected: StartBarVariant;
  readonly setStartBarVariant: (variant: StartBarVariant) => void;
  readonly title: string;
  readonly variant: StartBarVariant;
}) {
  return (
    <label title={title}>
      <input
        checked={selected === variant}
        name="start-bar-variant"
        onChange={() => setStartBarVariant(variant)}
        type="radio"
      />
      <span aria-hidden="true">{label}</span>
      <span className="srOnly">{title}</span>
    </label>
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
              <span className="fileIcon" aria-hidden="true">{entry.kind === 'folder' ? '▸' : '·'}</span>
              <span className="fileText">
                <span className="fileName">{entry.name}</span>
                <span className="fileSummary">{entry.summary}</span>
              </span>
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
  overflow: visible;
  position: relative;
}

.startMenu {
  border-right: 2px solid currentColor;
  flex: 0 0 auto;
  padding: 4px;
  position: relative;
}

.startMenu summary {
  border: 2px solid currentColor;
  cursor: pointer;
  display: block;
  list-style: none;
  padding: 2px 8px;
  user-select: none;
}

.startMenu summary::-webkit-details-marker {
  display: none;
}

.startMenuPanel {
  background: Canvas;
  border: 2px solid currentColor;
  display: flex;
  flex-direction: column;
  left: 4px;
  min-width: 220px;
  position: absolute;
  top: calc(100% + 2px);
  z-index: 20;
}

.startMenuPanel button {
  border: 0;
  border-bottom: 2px solid currentColor;
  padding: 6px 10px;
  text-align: left;
}

.startMenuPanel button:last-child {
  border-bottom: 0;
}

.barVariants,
.colorModes {
  align-items: center;
  border: 0;
  border-left: 2px solid currentColor;
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 4px;
}

.costMeter {
  align-items: center;
  border-left: 2px solid currentColor;
  display: flex;
  gap: 6px;
  padding: 4px 8px;
  white-space: nowrap;
}

.costMeter small {
  opacity: 0.7;
}

.barVariants {
  margin-left: auto;
}

.barVariants label,
.colorModes label {
  cursor: pointer;
  display: grid;
  place-items: center;
}

.barVariants input,
.colorModes input {
  appearance: none;
  height: 0;
  margin: 0;
  opacity: 0;
  padding: 0;
  position: absolute;
  width: 0;
}

.barVariants span[aria-hidden='true'],
.colorModes span[aria-hidden='true'] {
  border: 2px solid transparent;
  display: inline-block;
  min-width: 2ch;
  padding: 2px;
  text-align: center;
}

.barVariants input:checked + span,
.colorModes input:checked + span {
  border-color: currentColor;
}

.barVariants input:focus-visible + span,
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

.shortcuts,
.tasks {
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
  min-height: 100%;
}

.fileManager {
  margin: -8px;
}

.viewer {
  gap: 8px;
}

.pathRow {
  border-bottom: 2px solid currentColor;
  padding: 6px 8px;
}

.pathRow code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fileList {
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;
}

.fileList button,
.fileList li {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  text-align: left;
  width: 100%;
}

.fileList button {
  border: 0;
  border-bottom: 1px solid currentColor;
  min-height: 36px;
  padding: 6px 8px;
}

.fileList button:hover,
.fileList button:focus-visible,
.startMenuPanel button:hover,
.startMenuPanel button:focus-visible {
  background: Highlight;
  color: HighlightText;
  outline: 0;
}

.fileIcon {
  flex: 0 0 2ch;
  text-align: center;
}

.fileText {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.fileName,
.fileSummary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fileSummary {
  opacity: 0.7;
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
