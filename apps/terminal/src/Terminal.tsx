import type { DocHandle } from '@automerge/automerge-repo';
import { useEffect, useMemo, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XtermTerminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  type AppContainer,
  TerminalLineKind,
  type TerminalStateDoc,
  type ThemeDoc,
} from '@patchpit/system';
import {
  createTerminalRuntime,
  runTerminalCommand,
  terminalRuntimeKey,
  type TerminalRuntimeOptions,
} from './terminal-bash';
import {
  appendTerminalPrompt,
  clearTerminal,
  commitTerminalExecution,
  terminalPrompt,
} from './terminal-state';
import './terminal.css';

export function Terminal({
  container,
  state,
  stateHandle,
  theme,
  runtimeOptions,
}: {
  readonly state: TerminalStateDoc;
  readonly stateHandle: DocHandle<TerminalStateDoc>;
  readonly theme: ThemeDoc;
  readonly runtimeOptions: TerminalRuntimeOptions;
  readonly container: AppContainer;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputRef = useRef('');
  const xtermRef = useRef<XtermTerminal | null>(null);
  const stateRef = useRef(state);
  const runtimeRef = useRef(createTerminalRuntime(runtimeOptions, container, state));
  const runtimeKey = terminalRuntimeKey(container, state);
  const xtermTheme = useMemo(() => terminalTheme(theme), [theme]);

  stateRef.current = state;
  if (runtimeRef.current.key !== runtimeKey) {
    runtimeRef.current = createTerminalRuntime(runtimeOptions, container, state);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const fit = new FitAddon();
    const terminal = new XtermTerminal({
      allowTransparency: true,
      convertEol: true,
      cursorBlink: true,
      fontFamily: theme.typography.codeFont,
      fontSize: parseFloat(theme.typography.codeSize) * 16,
      lineHeight: parseFloat(theme.typography.terminalLineHeight),
      scrollback: 1000,
      theme: xtermTheme,
    });
    fitRef.current = fit;
    xtermRef.current = terminal;
    terminal.loadAddon(fit);
    terminal.open(host);
    fit.fit();
    terminal.focus();
    const observer = new ResizeObserver(() => {
      fit.fit();
    });
    observer.observe(host);
    const input = terminal.onData((data) => {
      void handleTerminalData(data, stateRef.current, stateHandle, runtimeRef.current, inputRef, terminal);
    });

    return () => {
      observer.disconnect();
      input.dispose();
      terminal.dispose();
      fitRef.current = null;
      xtermRef.current = null;
    };
  }, [stateHandle, theme.typography.codeFont, theme.typography.codeSize, theme.typography.terminalLineHeight, xtermTheme]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (terminal === null) return;
    terminal.options.theme = xtermTheme;
    fitRef.current?.fit();
    renderTerminal(terminal, state, inputRef.current);
  }, [state, xtermTheme]);

  return (
    <section className="terminal surface-content" aria-label="terminal">
      <div className="terminal-host" ref={hostRef} />
    </section>
  );
}

async function handleTerminalData(
  data: string,
  state: TerminalStateDoc,
  handle: DocHandle<TerminalStateDoc>,
  runtime: ReturnType<typeof createTerminalRuntime>,
  input: { current: string },
  terminal: XtermTerminal,
): Promise<void> {
  if (data === '\r') {
    const command = input.current;
    input.current = '';
    terminal.write('\r\n');
    if (command.trim() === 'clear') {
      clearTerminal(handle);
      return;
    }
    const result = await runTerminalCommand(runtime, state, command);
    commitTerminalExecution(handle, { command, ...result });
    return;
  }

  if (data === '\u007F') {
    if (input.current.length > 0) {
      input.current = input.current.slice(0, -1);
      terminal.write('\b \b');
    }
    return;
  }

  if (data === '\u000C') {
    input.current = '';
    clearTerminal(handle);
    return;
  }

  if (data === '\u0003') {
    input.current = '';
    appendTerminalPrompt(handle);
    return;
  }

  if (isTextInput(data)) {
    input.current = `${input.current}${data}`;
    terminal.write(data);
  }
}

function isTextInput(data: string): boolean {
  if (data.startsWith('\u001B')) return false;
  return Array.from(data).every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code > 0x1F && code !== 0x7F;
  });
}

function terminalText(state: TerminalStateDoc): string {
  return state.lines.map((line) => {
    const prompt = line.prompt === undefined ? '' : styledText(line.prompt, '1');
    const text = `${prompt}${line.text}`;
    return line.kind === TerminalLineKind.Error ? `\x1b[31m${text}\x1b[0m\n` : `${text}\n`;
  }).join('');
}

function renderTerminal(
  terminal: XtermTerminal,
  state: TerminalStateDoc,
  input: string,
): void {
  terminal.reset();
  terminal.write(`${terminalText(state)}${styledPrompt(state.cwd)}${input}`);
  terminal.refresh(0, terminal.rows - 1);
}

function styledPrompt(cwd: string): string {
  return styledText(terminalPrompt(cwd), '1');
}

function styledText(text: string, sgr: string): string {
  return `\x1b[${sgr}m${text}\x1b[0m`;
}

function terminalTheme(theme: ThemeDoc): ITheme {
  return {
    background: '#00000000',
    cursor: theme.palette.terminalCursor,
    foreground: theme.palette.terminalText,
    selectionBackground: theme.palette.terminalSelection,
  };
}
