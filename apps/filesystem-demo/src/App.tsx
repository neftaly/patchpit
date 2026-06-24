import { FilesystemDemo } from './filesystem-demo/index.js'
import {
  FilesystemDemoProvider,
  useFilesystemDemo,
} from './filesystem-demo/state.js'
import {
  colorModeIcons,
  colorModes,
  colorSchemeForMode,
  themeCssVars,
  themeSet,
} from './theme.js'
import type { ColorMode } from './theme.js'

export default function App() {
  return (
    <FilesystemDemoProvider>
      <FilesystemApp />
    </FilesystemDemoProvider>
  )
}

function FilesystemApp() {
  const { colorMode, setColorMode } = useFilesystemDemo()

  return (
    <main
      className="app"
      style={{
        ...themeCssVars(themeSet),
        colorScheme: colorSchemeForMode(colorMode),
      }}
    >
      <FilesystemDemo
        sidebarFooter={
          <ThemeControls
            colorMode={colorMode}
            onColorModeChange={setColorMode}
          />
        }
      />
    </main>
  )
}

function ThemeControls({
  colorMode,
  onColorModeChange,
}: {
  colorMode: ColorMode
  onColorModeChange: (colorMode: ColorMode) => void
}) {
  return (
    <div className="sidebar-controls">
      <fieldset className="color-mode-picker">
        <legend className="sr-only">color scheme</legend>
        {colorModes.map((mode) => (
          <label key={mode} title={mode}>
            <input
              checked={mode === colorMode}
              name="color-mode"
              type="radio"
              value={mode}
              onChange={() => onColorModeChange(mode)}
            />
            <span aria-hidden="true">{colorModeIcons[mode]}</span>
            <span className="sr-only">{mode}</span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}
