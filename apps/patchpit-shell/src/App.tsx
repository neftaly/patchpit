import { FormEvent, useState } from 'react';
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
  selectPath,
  setFilesPath,
  setViewerMode,
  windowTitle,
  type AppWindow,
  type BrowserInfo,
  type FileRead,
  type KernelState,
  type ViewerMode
} from './kernel';

export function App() {
  const [kernel, setKernel] = useState(createInitialKernelState);
  const browser = readBrowserInfo();

  return (
    <main className="shell">
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
              <button type="button" aria-label={`close ${windowTitle(window)}`} onClick={() => setKernel((state) => closeWindow(state, window.id))}>
                x
              </button>
            </span>
          ))}
        </div>
      </nav>
      <section className="mosaic" aria-label="open windows">
        {kernel.windows.map((window) => (
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
    </main>
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
        ) : (
          <TerminalWindow browser={browser} setKernel={setKernel} window={window} />
        )}
      </div>
    </article>
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
  setKernel,
  window
}: {
  readonly browser: BrowserInfo;
  readonly setKernel: (updater: (state: KernelState) => KernelState) => void;
  readonly window: AppWindow;
}) {
  const [input, setInput] = useState('');

  if (window.state.kind !== 'terminal') {
    return null;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = input;
    setInput('');
    setKernel((state) => runTerminalCommand(state, window.id, command, browser));
  }

  return (
    <div className="terminal">
      <pre>{window.state.lines.join('\n')}</pre>
      <form onSubmit={submit}>
        <span>{window.state.cwd} $</span>
        <input aria-label="terminal command" autoComplete="off" value={input} onChange={(event) => setInput(event.currentTarget.value)} />
      </form>
    </div>
  );
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

.shell {
  color: CanvasText;
  background: Canvas;
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  height: 100%;
  line-height: 1.35;
}

.bar {
  border-bottom: 2px solid currentColor;
  display: flex;
  min-height: 40px;
  overflow: hidden;
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

.mosaic {
  align-content: stretch;
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  overflow: auto;
}

.window {
  border: 2px solid currentColor;
  display: flex;
  flex: 1 1 420px;
  flex-direction: column;
  margin: -2px 0 0 -2px;
  min-height: 260px;
  min-width: min(100%, 320px);
}

.focused {
  outline: 2px solid currentColor;
  outline-offset: -8px;
}

.windowHeader,
.pathRow,
.viewerTools,
.terminal form {
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
.viewer,
.terminal {
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
.terminal pre {
  border: 2px solid currentColor;
  flex: 1;
  margin: 0;
  overflow: auto;
  padding: 8px;
  white-space: pre-wrap;
}

.terminal input {
  flex: 1;
  min-width: 12ch;
}

.appFrame {
  border: 0;
  flex: 1;
  min-height: 100%;
  width: 100%;
}
`;
