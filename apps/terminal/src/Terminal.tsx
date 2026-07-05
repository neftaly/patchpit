import type { DocHandle } from '@automerge/automerge-repo';
import { useEffect, useRef } from 'react';
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
  const { terminalCursor, terminalSelection, terminalText } = theme.palette;
  const { codeFont, codeSize, terminalLineHeight } = theme.typography;

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
      fontFamily: codeFont,
      fontSize: parseFloat(codeSize) * 16,
      lineHeight: parseFloat(terminalLineHeight),
      scrollback: 1000,
      theme: xtermThemeFromPalette({ terminalCursor, terminalSelection, terminalText }),
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
    const inputSubscription = terminal.onData((inputChunk) => {
      void handleTerminalInput(
        inputChunk,
        stateRef.current,
        stateHandle,
        runtimeRef.current,
        inputRef,
        terminal,
      );
    });

    return () => {
      observer.disconnect();
      inputSubscription.dispose();
      terminal.dispose();
      fitRef.current = null;
      xtermRef.current = null;
    };
  }, [codeFont, codeSize, stateHandle, terminalCursor, terminalLineHeight, terminalSelection, terminalText]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (terminal === null) return;
    terminal.options.theme = xtermThemeFromPalette({ terminalCursor, terminalSelection, terminalText });
    fitRef.current?.fit();
    renderTerminal(terminal, state, inputRef.current);
  }, [state, terminalCursor, terminalSelection, terminalText]);

  return (
    <section className="terminal surface-content" aria-label="terminal">
      <div className="terminal-host" ref={hostRef} />
    </section>
  );
}

async function handleTerminalInput(
  inputChunk: string,
  state: TerminalStateDoc,
  handle: DocHandle<TerminalStateDoc>,
  runtime: ReturnType<typeof createTerminalRuntime>,
  pendingInput: { current: string },
  terminal: XtermTerminal,
): Promise<void> {
  if (inputChunk === '\r') {
    const command = pendingInput.current;
    pendingInput.current = '';
    terminal.write('\r\n');
    if (command.trim() === 'clear') {
      clearTerminal(handle);
      return;
    }
    const result = await runTerminalCommand(runtime, state, command);
    commitTerminalExecution(handle, { command, ...result });
    return;
  }

  if (inputChunk === '\u007F') {
    if (pendingInput.current.length > 0) {
      pendingInput.current = pendingInput.current.slice(0, -1);
      terminal.write('\b \b');
    }
    return;
  }

  if (inputChunk === '\u000C') {
    pendingInput.current = '';
    clearTerminal(handle);
    return;
  }

  if (inputChunk === '\u0003') {
    pendingInput.current = '';
    appendTerminalPrompt(handle);
    return;
  }

  if (isPrintableInput(inputChunk)) {
    pendingInput.current = `${pendingInput.current}${inputChunk}`;
    terminal.write(inputChunk);
  }
}

function isPrintableInput(inputChunk: string): boolean {
  return !inputChunk.startsWith('\u001B') && Array.from(inputChunk).every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code > 0x1F && code !== 0x7F;
  });
}

function terminalHistoryText(state: TerminalStateDoc): string {
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
  terminal.write(`${terminalHistoryText(state)}${styledText(terminalPrompt(state.cwd), '1')}${input}`);
  terminal.refresh(0, terminal.rows - 1);
}

function styledText(text: string, sgr: string): string {
  return `\x1b[${sgr}m${text}\x1b[0m`;
}

function xtermThemeFromPalette({
  terminalCursor,
  terminalSelection,
  terminalText,
}: Pick<ThemeDoc['palette'], 'terminalCursor' | 'terminalSelection' | 'terminalText'>): ITheme {
  return {
    background: '#00000000',
    cursor: terminalCursor,
    foreground: terminalText,
    selectionBackground: terminalSelection,
  };
}
