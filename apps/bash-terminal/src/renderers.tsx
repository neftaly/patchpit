import type { ComponentType } from 'react'
import type { TerminalInputController } from './input.js'
import type { TerminalViewportSettings } from './settings.js'
import type { TerminalViewportController } from './viewport.js'
import type { VisibleRangeItem } from './viewport-range.js'
import type { TerminalLine } from './buffer.js'

export type TerminalRendererProps = {
  input: TerminalInputController
  isRunning: boolean
  prompt: string
  settings: TerminalViewportSettings
  title: string
  viewport: TerminalViewportController
  visibleRows: readonly VisibleRangeItem<TerminalLine>[]
}

export type TerminalRenderer = ComponentType<TerminalRendererProps>
