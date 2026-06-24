import catppuccinLatte from 'tm-themes/themes/catppuccin-latte.json'
import catppuccinMocha from 'tm-themes/themes/catppuccin-mocha.json'
import type { CSSProperties } from 'react'

type ThemeColors = Record<string, unknown>
type ThemeJson = { colors: ThemeColors }
type ThemePair = {
  label: string
  light: ThemeJson
  dark: ThemeJson
}

export const themeSet = {
  label: 'Catppuccin',
  light: catppuccinLatte,
  dark: catppuccinMocha,
} satisfies ThemePair

export const colorModes = ['light', 'auto', 'dark'] as const
export type ColorMode = (typeof colorModes)[number]

export const defaultColorMode = 'auto' satisfies ColorMode

export const colorModeIcons = {
  light: '○',
  auto: '◐',
  dark: '●',
} satisfies Record<ColorMode, string>

export function themeCssVars(theme: ThemePair): CSSProperties {
  return Object.fromEntries(
    Object.entries(themeStyle(theme)).map(([name, [lightValue, darkValue]]) => [
      name,
      `light-dark(${lightValue}, ${darkValue})`,
    ]),
  )
}

export function colorSchemeForMode(mode: ColorMode): CSSProperties['colorScheme'] {
  return mode === 'auto' ? 'light dark' : mode
}

function themeStyle(theme: ThemePair): ThemeStyleSource {
  return {
    '--app-fg': token(theme, ['foreground', 'editor.foreground']),
    '--app-bg': token(theme, ['sideBar.background', 'editor.background']),
    '--panel-bg': token(theme, ['editor.background', 'sideBar.background']),
    '--border-color': token(theme, [
      'sideBar.border',
      'input.border',
      'contrastBorder',
    ]),
    '--control-bg': token(theme, ['input.background', 'editor.background']),
    '--control-border': token(theme, [
      'input.border',
      'sideBar.border',
      'contrastBorder',
    ]),
    '--control-disabled-fg': ['#6e7781', '#8b949e'],
    '--control-disabled-border': token(theme, [
      'input.border',
      'sideBar.border',
      'contrastBorder',
    ]),
    '--tree-indent-guide': token(theme, [
      'tree.indentGuidesStroke',
      'editorIndentGuide.activeBackground',
      'sideBar.border',
    ]),
    '--tree-indent-guide-hover': token(theme, [
      'editorIndentGuide.activeBackground',
      'tree.indentGuidesStroke',
      'sideBar.border',
    ]),
    '--tree-indent-guide-active': token(theme, [
      'editorIndentGuide.activeBackground',
      'tree.indentGuidesStroke',
      'sideBar.border',
    ]),
    '--list-hover-background': token(theme, [
      'list.hoverBackground',
      'list.focusBackground',
      'editor.selectionBackground',
    ]),
    '--list-active-selection-background': token(theme, [
      'list.activeSelectionBackground',
      'list.focusBackground',
      'editor.selectionBackground',
    ]),
    '--list-active-selection-foreground': token(theme, [
      'list.activeSelectionForeground',
      'editor.foreground',
      'foreground',
    ]),
  }
}

function token(
  theme: ThemePair,
  names: readonly string[],
): readonly [lightValue: string, darkValue: string] {
  return [
    required(theme.light.colors, names, theme.label),
    required(theme.dark.colors, names, theme.label),
  ]
}

function required(
  colors: ThemeColors,
  names: readonly string[],
  themeLabel: string,
): string {
  for (const name of names) {
    const value = colors[name]
    if (typeof value === 'string') return value
  }

  throw new Error(`theme color missing: ${themeLabel}: ${names.join(' | ')}`)
}

type ThemeStyleSource = Record<string, readonly [string, string]>
