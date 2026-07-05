import type { DocHandle } from '@automerge/automerge-repo';
import {
  TerminalLineKind,
  type TerminalCapabilities,
  type TerminalLine,
  type TerminalStateDoc,
} from '@patchpit/system';

export type TerminalExecution = {
  readonly command: string;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly stderr: string;
  readonly stdout: string;
};

type TerminalStateRow = {
  capabilities: TerminalCapabilities;
  cwd: string;
  env: Record<string, string>;
  history: string[];
  id: string;
  lines: TerminalLine[];
};

const stateId = 'terminal';
const terminalScrollbackLines = 1000;

export function clearTerminal(handle: DocHandle<TerminalStateDoc>): void {
  commitTerminalState(handle, clearedTerminalState);
}

export function appendTerminalPrompt(handle: DocHandle<TerminalStateDoc>): void {
  commitTerminalState(handle, terminalStateWithPrompt);
}

export function commitTerminalExecution(
  handle: DocHandle<TerminalStateDoc>,
  execution: TerminalExecution,
): void {
  commitTerminalState(handle, (state) => terminalStateWithExecution(state, execution));
}

export function terminalPrompt(cwd: string): string {
  return `${cwd}$ `;
}

function commitTerminalState(
  handle: DocHandle<TerminalStateDoc>,
  update: (state: TerminalStateDoc) => TerminalStateDoc,
): void {
  const changes = terminalStateRow(update(handle.doc()));

  handle.change((doc) => {
    doc.capabilities = structuredClone(changes.capabilities);
    doc.cwd = changes.cwd;
    doc.env = { ...changes.env };
    doc.history = [...changes.history];
    doc.lines = structuredClone(changes.lines);
  });
}

function clearedTerminalState(state: TerminalStateDoc): TerminalStateDoc {
  return {
    ...cloneTerminalState(state),
    lines: [],
  };
}

function terminalStateWithPrompt(state: TerminalStateDoc): TerminalStateDoc {
  return {
    ...cloneTerminalState(state),
    lines: clippedLines([
      ...state.lines,
      { kind: TerminalLineKind.Input, prompt: terminalPrompt(state.cwd), text: '' },
    ]),
  };
}

function terminalStateWithExecution(
  state: TerminalStateDoc,
  execution: TerminalExecution,
): TerminalStateDoc {
  const prompt = terminalPrompt(state.cwd);
  return {
    ...cloneTerminalState(state),
    cwd: execution.cwd,
    env: { ...execution.env },
    history: execution.command.trim() === ''
      ? [...state.history]
      : [...state.history, execution.command],
    lines: clippedLines([
      ...state.lines,
      {
        kind: TerminalLineKind.Input,
        prompt,
        text: execution.command,
      },
      ...terminalLinesFromOutput(TerminalLineKind.Output, execution.stdout),
      ...terminalLinesFromOutput(TerminalLineKind.Error, execution.stderr),
    ]),
  };
}

function terminalStateRow(state: TerminalStateDoc): TerminalStateRow {
  return {
    capabilities: structuredClone(state.capabilities),
    cwd: state.cwd,
    env: { ...state.env },
    history: [...state.history],
    id: stateId,
    lines: structuredClone(state.lines),
  };
}

function cloneTerminalState(state: TerminalStateDoc): TerminalStateDoc {
  return {
    ...state,
    capabilities: structuredClone(state.capabilities),
    env: { ...state.env },
    history: [...state.history],
    lines: structuredClone(state.lines),
  };
}

function terminalLinesFromOutput(kind: TerminalLineKind, text: string): TerminalLine[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => ({ kind, text: line }));
}

function clippedLines(lines: TerminalLine[]): TerminalLine[] {
  return lines.slice(-terminalScrollbackLines);
}
