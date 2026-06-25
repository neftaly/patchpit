import { useCallback, useMemo, useRef, useState } from 'react'
import { createTerminalLineBuffer } from './buffer.js'
import type { TerminalLineDraft } from './buffer.js'
import type { TerminalRenderer } from './renderers.js'
import { terminalLoginGreeting } from './greeting.js'
import { displayPath, runShellCommand } from './shell.js'
import type { TerminalFileSystem } from './shell.js'
import { TerminalViewport } from './terminal-viewport.js'

export type {
  TerminalFileSystem,
} from './shell.js'

export function BashTerminal({
  fileSystem,
  initialLines,
  renderer,
  title = 'bash',
}: {
  fileSystem: TerminalFileSystem
  initialLines?: readonly TerminalLineDraft[]
  renderer?: TerminalRenderer
  title?: string
}) {
  const [cwd, setCwd] = useState<readonly string[]>([])
  const lineBuffer = useRef(
    createTerminalLineBuffer(initialLines ?? [terminalLoginGreeting()]),
  )
  const [lineCount, setLineCount] = useState(lineBuffer.current.count)
  const [isRunning, setIsRunning] = useState(false)
  const prompt = useMemo(
    () => `${fileSystem.rootName}:${displayPath(cwd)}$`,
    [cwd, fileSystem.rootName],
  )
  const lineAt = useCallback(
    (index: number) => lineBuffer.current.at(index),
    [],
  )

  function appendLines(next: readonly TerminalLineDraft[]) {
    setLineCount(lineBuffer.current.append(next))
  }

  function clearLines() {
    setLineCount(lineBuffer.current.clear())
  }

  async function handleCommand(command: string) {
    const inputLine: TerminalLineDraft = {
      kind: 'input',
      prompt,
      text: command,
    }
    if (!command) {
      appendLines([inputLine])
      return
    }

    setIsRunning(true)
    try {
      const result = await runShellCommand(fileSystem, cwd, command)
      if (result.clear) {
        clearLines()
        return
      }
      if (result.cwd) setCwd(result.cwd)
      appendLines([inputLine, ...result.lines])
    } catch (error) {
      appendLines([inputLine, { kind: 'error', text: errorMessage(error) }])
    } finally {
      setIsRunning(false)
    }
  }

  const viewportProps = {
    isRunning,
    lineAt,
    lineCount,
    onCommand: handleCommand,
    prompt,
    title,
    ...(renderer ? { renderer } : {}),
  }

  return <TerminalViewport {...viewportProps} />
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
