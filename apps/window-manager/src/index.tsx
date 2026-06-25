export type WindowManagerColorMode = string
export type WindowManagerPaneId = string
export type WindowManagerProgramId = string

export type LaunchableApp<
  ProgramId extends WindowManagerProgramId = WindowManagerProgramId,
> = {
  id: ProgramId
  label: string
}

export type OpenAppInstance<
  PaneId extends WindowManagerPaneId = WindowManagerPaneId,
> = {
  id: PaneId
  title: string
}

export type WindowManagerPane = {
  program: {
    name: string
  }
}

export type WindowManagerPanes<
  PaneId extends WindowManagerPaneId = WindowManagerPaneId,
> = Record<PaneId, WindowManagerPane | undefined>

export type WindowManagerControlsProps<
  ColorMode extends WindowManagerColorMode = WindowManagerColorMode,
  PaneId extends WindowManagerPaneId = WindowManagerPaneId,
  ProgramId extends WindowManagerProgramId = WindowManagerProgramId,
> = {
  colorMode: ColorMode
  colorModeIcons: Record<ColorMode, string>
  colorModes: readonly ColorMode[]
  launchableApps: readonly LaunchableApp<ProgramId>[]
  workspacePaneIds: readonly PaneId[]
  workspacePanes: WindowManagerPanes<PaneId>
  onClosePane: (paneId: PaneId) => void
  onColorModeChange: (colorMode: ColorMode) => void
  onLaunchApp: (programId: ProgramId) => void
}

type AppLauncherProps<
  PaneId extends WindowManagerPaneId,
  ProgramId extends WindowManagerProgramId,
> = {
  launchableApps: readonly LaunchableApp<ProgramId>[]
  workspacePaneIds: readonly PaneId[]
  workspacePanes: WindowManagerPanes<PaneId>
  onClosePane: (paneId: PaneId) => void
  onLaunchApp: (programId: ProgramId) => void
}

type ThemeControlsProps<ColorMode extends WindowManagerColorMode> = {
  colorMode: ColorMode
  colorModeIcons: Record<ColorMode, string>
  colorModes: readonly ColorMode[]
  onColorModeChange: (colorMode: ColorMode) => void
}

export function WindowManagerControls<
  ColorMode extends WindowManagerColorMode,
  PaneId extends WindowManagerPaneId,
  ProgramId extends WindowManagerProgramId,
>({
  colorMode,
  colorModeIcons,
  colorModes,
  launchableApps,
  workspacePaneIds,
  workspacePanes,
  onClosePane,
  onColorModeChange,
  onLaunchApp,
}: WindowManagerControlsProps<ColorMode, PaneId, ProgramId>) {
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

function AppLauncher<
  PaneId extends WindowManagerPaneId,
  ProgramId extends WindowManagerProgramId,
>({
  launchableApps,
  workspacePaneIds,
  workspacePanes,
  onClosePane,
  onLaunchApp,
}: AppLauncherProps<PaneId, ProgramId>) {
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
          const instance = openAppInstanceFor(paneId, workspacePanes[paneId])
          if (!instance) return null
          return (
            <li key={instance.id}>
              <span>{instance.title}</span>
              <button
                type="button"
                aria-label={`close ${instance.title}`}
                onClick={() => onClosePane(instance.id)}
              >
                [x]
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function openAppInstanceFor<PaneId extends WindowManagerPaneId>(
  paneId: PaneId,
  pane: WindowManagerPane | undefined,
): OpenAppInstance<PaneId> | null {
  if (!pane) return null
  return { id: paneId, title: pane.program.name }
}

function ThemeControls<ColorMode extends WindowManagerColorMode>({
  colorMode,
  colorModeIcons,
  colorModes,
  onColorModeChange,
}: ThemeControlsProps<ColorMode>) {
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
