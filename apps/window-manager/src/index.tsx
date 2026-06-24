import type {
  ColorMode,
  WorkspacePaneId,
  WorkspacePanes,
  WorkspaceProgramId,
} from '@patchpit/workspace'

export type LaunchableApp = {
  id: WorkspaceProgramId
  label: string
}

export type WindowManagerControlsProps = {
  colorMode: ColorMode
  colorModeIcons: Record<ColorMode, string>
  colorModes: readonly ColorMode[]
  launchableApps: readonly LaunchableApp[]
  workspacePaneIds: WorkspacePaneId[]
  workspacePanes: WorkspacePanes
  onClosePane: (paneId: WorkspacePaneId) => void
  onColorModeChange: (colorMode: ColorMode) => void
  onLaunchApp: (programId: WorkspaceProgramId) => void
}

export function WindowManagerControls({
  colorMode,
  colorModeIcons,
  colorModes,
  launchableApps,
  workspacePaneIds,
  workspacePanes,
  onClosePane,
  onColorModeChange,
  onLaunchApp,
}: WindowManagerControlsProps) {
  return (
    <>
      <ThemeControls
        colorMode={colorMode}
        colorModeIcons={colorModeIcons}
        colorModes={colorModes}
        onColorModeChange={onColorModeChange}
      />
      <AppLauncher
        launchableApps={launchableApps}
        workspacePaneIds={workspacePaneIds}
        workspacePanes={workspacePanes}
        onClosePane={onClosePane}
        onLaunchApp={onLaunchApp}
      />
    </>
  )
}

function AppLauncher({
  launchableApps,
  workspacePaneIds,
  workspacePanes,
  onClosePane,
  onLaunchApp,
}: Pick<
  WindowManagerControlsProps,
  | 'launchableApps'
  | 'onClosePane'
  | 'onLaunchApp'
  | 'workspacePaneIds'
  | 'workspacePanes'
>) {
  return (
    <div className="app-launcher">
      <div className="app-launcher-buttons" aria-label="launch app">
        {launchableApps.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => onLaunchApp(app.id)}
          >
            {app.label}
          </button>
        ))}
      </div>
      <ul className="app-instance-list" aria-label="open windows">
        {workspacePaneIds.map((paneId) => {
          const pane = workspacePanes[paneId]
          if (!pane) return null
          return (
            <li key={paneId}>
              <span>{pane.program.name}</span>
              {pane.closable && (
                <button
                  type="button"
                  aria-label={`close ${pane.program.name}`}
                  onClick={() => onClosePane(paneId)}
                >
                  [x]
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ThemeControls({
  colorMode,
  colorModeIcons,
  colorModes,
  onColorModeChange,
}: Pick<
  WindowManagerControlsProps,
  'colorMode' | 'colorModeIcons' | 'colorModes' | 'onColorModeChange'
>) {
  return (
    <div className="state-pane-controls">
      <h1 className="state-pane-title">patchpit window manager</h1>
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
