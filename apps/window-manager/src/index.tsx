export type WindowManagerColorMode = string
export type WindowManagerAppInstanceId = string
export type WindowManagerProgramId = string

export type LaunchableApp<
  ProgramId extends WindowManagerProgramId = WindowManagerProgramId,
> = {
  id: ProgramId
  label: string
}

export type OpenAppInstance<
  AppInstanceId extends WindowManagerAppInstanceId = WindowManagerAppInstanceId,
> = {
  id: AppInstanceId
  title: string
}

export type WindowManagerControlsProps<
  ColorMode extends WindowManagerColorMode = WindowManagerColorMode,
  AppInstanceId extends WindowManagerAppInstanceId = WindowManagerAppInstanceId,
  ProgramId extends WindowManagerProgramId = WindowManagerProgramId,
> = {
  colorMode: ColorMode
  colorModeIcons: Record<ColorMode, string>
  colorModes: readonly ColorMode[]
  launchableApps: readonly LaunchableApp<ProgramId>[]
  openAppInstances: readonly OpenAppInstance<AppInstanceId>[]
  onClosePane: (appInstanceId: AppInstanceId) => void
  onColorModeChange: (colorMode: ColorMode) => void
  onLaunchApp: (programId: ProgramId) => void
}

type AppLauncherProps<
  AppInstanceId extends WindowManagerAppInstanceId,
  ProgramId extends WindowManagerProgramId,
> = {
  launchableApps: readonly LaunchableApp<ProgramId>[]
  openAppInstances: readonly OpenAppInstance<AppInstanceId>[]
  onClosePane: (appInstanceId: AppInstanceId) => void
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
  AppInstanceId extends WindowManagerAppInstanceId,
  ProgramId extends WindowManagerProgramId,
>({
  colorMode,
  colorModeIcons,
  colorModes,
  launchableApps,
  openAppInstances,
  onClosePane,
  onColorModeChange,
  onLaunchApp,
}: WindowManagerControlsProps<ColorMode, AppInstanceId, ProgramId>) {
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
        openAppInstances={openAppInstances}
        onClosePane={onClosePane}
        onLaunchApp={onLaunchApp}
      />
    </>
  )
}

function AppLauncher<
  AppInstanceId extends WindowManagerAppInstanceId,
  ProgramId extends WindowManagerProgramId,
>({
  launchableApps,
  openAppInstances,
  onClosePane,
  onLaunchApp,
}: AppLauncherProps<AppInstanceId, ProgramId>) {
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
        {openAppInstances.map((instance) => (
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
        ))}
      </ul>
    </div>
  )
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
