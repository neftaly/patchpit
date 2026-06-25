import { useMemo } from 'react'
import type { TerminalLine } from './buffer.js'
import { DomTerminalRenderer } from './dom-renderer.js'
import { useTerminalInput } from './input.js'
import type { TerminalRenderer } from './renderers.js'
import { terminalViewportSettings } from './settings.js'
import type { TerminalViewportSettings } from './settings.js'
import { useTerminalViewportController } from './viewport.js'
import { visibleItemsForRange } from './viewport-range.js'

export type TerminalViewportLine = TerminalLine

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
