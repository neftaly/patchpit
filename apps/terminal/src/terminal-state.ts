import type { DocHandle } from '@automerge/automerge-repo';
import {
  defineSchema,
  opaqueField,
  relation,
  stringField,
  write,
} from '@tarstate/core';
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
const terminalSchema = defineSchema({
  state: relation<TerminalStateRow>({
    key: 'id',
    fields: {
      capabilities: opaqueField<TerminalCapabilities>(),
      cwd: stringField(),
      env: opaqueField<Record<string, string>>(),
      history: opaqueField<string[]>(),
      id: stringField(),
      lines: opaqueField<TerminalLine[]>(),
    },
  }),
});

export function clearTerminal(handle: DocHandle<TerminalStateDoc>): void {
  commitTerminalState(handle, (state) => {
    state.lines = [];
  });
}

export function appendTerminalPrompt(handle: DocHandle<TerminalStateDoc>): void {
  commitTerminalState(handle, (state) => {
    state.lines = clippedLines([
      ...state.lines,
      { kind: TerminalLineKind.Input, prompt: terminalPrompt(state.cwd), text: '' },
    ]);
  });
}

export function commitTerminalExecution(
  handle: DocHandle<TerminalStateDoc>,
  execution: TerminalExecution,
): void {
  commitTerminalState(handle, (state) => {
    const prompt = terminalPrompt(state.cwd);
    state.cwd = execution.cwd;
    state.env = { ...execution.env };
    state.history = execution.command.trim() === ''
      ? state.history
      : [...state.history, execution.command];
    state.lines = clippedLines([
      ...state.lines,
      {
        kind: TerminalLineKind.Input,
        prompt,
        text: execution.command,
      },
      ...terminalOutputLines(TerminalLineKind.Output, execution.stdout),
      ...terminalOutputLines(TerminalLineKind.Error, execution.stderr),
    ]);
  });
}

export function terminalPrompt(cwd: string): string {
  return `${cwd}$ `;
}

function commitTerminalState(
  handle: DocHandle<TerminalStateDoc>,
  update: (state: TerminalStateDoc) => void,
): void {
  const next = cloneTerminalState(handle.doc());
  update(next);
  const changes = write(terminalSchema.state)
    .updateByKey(stateId, {
      capabilities: next.capabilities,
      cwd: next.cwd,
      env: next.env,
      history: next.history,
      id: stateId,
      lines: next.lines,
    })
    .changes as Partial<TerminalStateRow>;

  handle.change((doc) => {
    if (changes.capabilities !== undefined) doc.capabilities = structuredClone(changes.capabilities);
    if (changes.cwd !== undefined) doc.cwd = changes.cwd;
    if (changes.env !== undefined) doc.env = { ...changes.env };
    if (changes.history !== undefined) doc.history = [...changes.history];
    if (changes.lines !== undefined) doc.lines = structuredClone(changes.lines);
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

function terminalOutputLines(kind: TerminalLineKind, text: string): TerminalLine[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n')
    : normalized.split('\n');
  return lines.filter((line) => line !== '').map((line) => ({ kind, text: line }));
}

function clippedLines(lines: TerminalLine[]): TerminalLine[] {
  return lines.slice(-terminalScrollbackLines);
}
