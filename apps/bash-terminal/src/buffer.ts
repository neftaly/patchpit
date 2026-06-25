import type { ShellOutputLine } from './shell.js'

export type TerminalInputLine = {
  id: number
  kind: 'input'
  prompt: string
  text: string
}

export type TerminalOutputLine = {
  id: number
  kind: 'output' | 'error'
  text: string
}

export type TerminalLine = TerminalInputLine | TerminalOutputLine
export type TerminalLineDraft = Omit<TerminalInputLine, 'id'> | ShellOutputLine

export type TerminalLineBuffer = {
  readonly count: number
  append: (drafts: readonly TerminalLineDraft[]) => number
  at: (index: number) => TerminalLine | undefined
  clear: () => number
}

export function createTerminalLineBuffer(
  initialLines: readonly TerminalLineDraft[] = [],
): TerminalLineBuffer {
  let nextLineId = 0
  let lines: TerminalLine[] = []

  function append(drafts: readonly TerminalLineDraft[]): number {
    for (const draft of drafts) {
      appendTerminalLineDraft(lines, draft, () => nextLineId++)
    }
    return lines.length
  }

  const buffer: TerminalLineBuffer = {
    get count() {
      return lines.length
    },
    append,
    at(index) {
      return lines[index]
    },
    clear() {
      lines = []
      return lines.length
    },
  }

  append(initialLines)
  return buffer
}

function appendTerminalLineDraft(
  lines: TerminalLine[],
  draft: TerminalLineDraft,
  nextId: () => number,
): void {
  if (draft.kind === 'input') {
    lines.push({ ...draft, id: nextId() })
    return
  }

  appendOutputLines(lines, draft, nextId)
}

function appendOutputLines(
  lines: TerminalLine[],
  draft: ShellOutputLine,
  nextId: () => number,
): void {
  let start = 0
  while (start <= draft.text.length) {
    const end = draft.text.indexOf('\n', start)
    if (end === -1) {
      lines.push({
        kind: draft.kind,
        text: draft.text.slice(start),
        id: nextId(),
      })
      return
    }
    lines.push({
      kind: draft.kind,
      text: draft.text.slice(start, end),
      id: nextId(),
    })
    start = end + 1
  }
}
