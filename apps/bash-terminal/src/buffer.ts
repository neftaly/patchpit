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
    lines.push(...terminalLines(drafts, () => nextLineId++))
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

function terminalLines(
  drafts: readonly TerminalLineDraft[],
  nextId: () => number,
): TerminalLine[] {
  const lines: TerminalLine[] = []
  for (const line of drafts) {
    if (line.kind === 'input') {
      lines.push({ ...line, id: nextId() })
      continue
    }

    for (const text of splitOutputText(line.text)) {
      lines.push({ kind: line.kind, text, id: nextId() })
    }
  }
  return lines
}

function splitOutputText(text: string): string[] {
  return text.split('\n')
}
