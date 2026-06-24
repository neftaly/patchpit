export type TerminalViewportSettings = {
  bottomStickPx: number
  initialVisibleRows: number
  overscanRows: number
  rowHeightPx: number
}

export const defaultTerminalViewportSettings: TerminalViewportSettings = {
  bottomStickPx: 48,
  initialVisibleRows: 80,
  overscanRows: 16,
  rowHeightPx: 22,
}

export function terminalViewportSettings(
  settings: Partial<TerminalViewportSettings> | undefined,
): TerminalViewportSettings {
  return { ...defaultTerminalViewportSettings, ...settings }
}
