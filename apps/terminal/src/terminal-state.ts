import type { DocHandle } from '@automerge/automerge-repo';
import {
  TerminalLineKind,
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

export type TerminalStateActions = {
  readonly appendPrompt: () => void;
  readonly clear: () => void;
  readonly commitExecution: (execution: TerminalExecution) => void;
};

const terminalScrollbackLines = 1000;

export function clearedTerminalState(state: TerminalStateDoc): TerminalStateDoc {
  return {
    ...cloneTerminalState(state),
    lines: [],
  };
}

export function terminalStateWithPrompt(state: TerminalStateDoc): TerminalStateDoc {
  return {
    ...cloneTerminalState(state),
    lines: clippedLines([
      ...state.lines,
      { kind: TerminalLineKind.Input, prompt: terminalPrompt(state.cwd), text: '' },
    ]),
  };
}

export function terminalStateWithExecution(
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

export function terminalPrompt(cwd: string): string {
  return `${cwd}$ `;
}

export function replaceTerminalState(doc: TerminalStateDoc, state: TerminalStateDoc): void {
  doc.capabilities = structuredClone(state.capabilities);
  doc.cwd = state.cwd;
  doc.env = { ...state.env };
  doc.history = [...state.history];
  doc.lines = structuredClone(state.lines);
}

export function createTerminalStateActions(handle: DocHandle<TerminalStateDoc>): TerminalStateActions {
  return {
    appendPrompt: () => commitTerminalState(handle, terminalStateWithPrompt),
    clear: () => commitTerminalState(handle, clearedTerminalState),
    commitExecution: (execution) => {
      commitTerminalState(handle, (state) => terminalStateWithExecution(state, execution));
    },
  };
}

function commitTerminalState(
  handle: DocHandle<TerminalStateDoc>,
  update: (state: TerminalStateDoc) => TerminalStateDoc,
): void {
  const next = update(handle.doc());
  handle.change((doc) => {
    replaceTerminalState(doc, next);
  });
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
