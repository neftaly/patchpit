import githubDark from 'tm-themes/themes/github-dark-default.json'
import githubLight from 'tm-themes/themes/github-light-default.json'
import type { CSSProperties } from 'react'

type ThemeColors = Record<string, unknown>

const light = githubLight.colors
const dark = githubDark.colors

export const themeStyle = {
  '--app-fg': token('foreground'),
  '--app-bg': token('sideBar.background'),
  '--panel-bg': token('editor.background'),
  '--border-color': token('sideBar.border'),
  '--control-bg': token('input.background'),
  '--control-border': token('input.border'),
  '--control-disabled-fg': ['#6e7781', '#8b949e'],
  '--control-disabled-border': token('input.border'),
  '--tree-indent-guide': token('tree.indentGuidesStroke'),
  '--tree-indent-guide-hover': token(
    'editorIndentGuide.activeBackground',
    'tree.indentGuidesStroke',
  ),
  '--tree-indent-guide-active': token(
    'editorIndentGuide.activeBackground',
    'tree.indentGuidesStroke',
  ),
  '--list-hover-background': token('list.hoverBackground'),
  '--list-active-selection-background': token('list.activeSelectionBackground'),
  '--list-active-selection-foreground': token('list.activeSelectionForeground'),
} satisfies ThemeStyleSource

function token(
  name: string,
  fallbackName = name,
): readonly [lightValue: string, darkValue: string] {
  return [required(light, name), required(dark, fallbackName)]
}

function required(colors: ThemeColors, name: string): string {
  const value = colors[name]
  if (typeof value !== 'string') throw new Error(`theme color missing: ${name}`)
  return value
}

type ThemeStyleSource = Record<string, readonly [string, string]>

export function themeCssVars(source: ThemeStyleSource): CSSProperties {
  return Object.fromEntries(
    Object.entries(source).map(([name, [lightValue, darkValue]]) => [
      name,
      `light-dark(${lightValue}, ${darkValue})`,
    ]),
  )
}
