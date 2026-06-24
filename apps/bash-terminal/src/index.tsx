import { useCallback, useMemo, useRef, useState } from 'react'
import { createTerminalLineBuffer } from './buffer.js'
import type { TerminalLine, TerminalLineDraft } from './buffer.js'
import { DomTerminalRenderer } from './dom-renderer.js'
import { useTerminalInput } from './input.js'
import type { TerminalRenderer } from './renderers.js'
import { terminalLoginGreeting } from './greeting.js'
import { terminalViewportSettings } from './settings.js'
import type { TerminalViewportSettings } from './settings.js'
import { displayPath, runShellCommand } from './shell.js'
import type { TerminalFileSystem } from './shell.js'
import { useTerminalViewportController } from './viewport.js'
import { visibleItemsForRange } from './viewport-range.js'

export type {
  TerminalInputLine,
  TerminalLine,
  TerminalLineBuffer,
  TerminalLineDraft,
  TerminalOutputLine,
} from './buffer.js'
export { useTerminalInput } from './input.js'
export type { TerminalInputController } from './input.js'
export { DomTerminalRenderer } from './dom-renderer.js'
export { terminalLoginGreeting } from './greeting.js'
export type { TerminalRenderer, TerminalRendererProps } from './renderers.js'
export {
  defaultTerminalViewportSettings,
  terminalViewportSettings,
} from './settings.js'
export type { TerminalViewportSettings } from './settings.js'
export {
  visibleItemsForRange,
  visibleRangeForScroll,
} from './viewport-range.js'
export type { VisibleRange, VisibleRangeItem } from './viewport-range.js'
export type {
  TerminalEntry,
  TerminalEntryType,
  TerminalFileSystem,
} from './shell.js'

export type TerminalViewportLine = TerminalLine

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

export function TerminalViewport({
  isRunning,
  lineAt,
  lineCount,
  onCommand,
  prompt,
  renderer: Renderer = DomTerminalRenderer,
  settings,
  title = 'bash',
}: {
  isRunning: boolean
  lineAt: (index: number) => TerminalViewportLine | undefined
  lineCount: number
  onCommand: (command: string) => void | Promise<void>
  prompt: string
  renderer?: TerminalRenderer
  settings?: Partial<TerminalViewportSettings>
  title?: string
}) {
  const viewportSettings = useMemo(
    () => terminalViewportSettings(settings),
    [settings],
  )
  const viewport = useTerminalViewportController({
    lineCount,
    settings: viewportSettings,
  })
  const input = useTerminalInput({
    beforeSubmit: viewport.noteSubmit,
    onCommand,
  })
  const visibleRows = visibleItemsForRange(
    lineAt,
    lineCount,
    viewport.visibleRange,
  )

  return (
    <Renderer
      input={input}
      isRunning={isRunning}
      prompt={prompt}
      settings={viewportSettings}
      title={title}
      viewport={viewport}
      visibleRows={visibleRows}
    />
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
