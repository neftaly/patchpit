import { WindowManagerControls } from '@patchpit/window-manager'
import { FilesystemDemo } from './shell/index.js'
import {
  FilesystemDemoProvider,
  useFilesystemDemo,
} from './shell/state.js'
import {
  colorModeIcons,
  colorModes,
  colorSchemeForMode,
  themeCssVars,
  themeSet,
} from './theme.js'
import type { WorkspaceProgramId } from '@patchpit/workspace'

const launchableApps: { id: WorkspaceProgramId; label: string }[] = [
  { id: 'patchpit:file-explorer', label: 'files' },
  { id: 'patchpit:file-viewer', label: 'viewer' },
  { id: 'patchpit:bash', label: 'bash' },
  { id: 'patchpit:os', label: 'wm' },
]

export default function App() {
  return (
    <FilesystemDemoProvider>
      <FilesystemApp />
    </FilesystemDemoProvider>
  )
}

function FilesystemApp() {
  const {
    closeWorkspacePane,
    colorMode,
    launchWorkspaceProgram,
    workspacePaneIds,
    setColorMode,
    workspacePanes,
  } = useFilesystemDemo()

  return (
    <main
      className="app"
      style={{
        ...themeCssVars(themeSet),
        colorScheme: colorSchemeForMode(colorMode),
      }}
    >
      <FilesystemDemo
        statePane={
          <WindowManagerControls
            colorMode={colorMode}
            colorModeIcons={colorModeIcons}
            colorModes={colorModes}
            launchableApps={launchableApps}
            workspacePaneIds={workspacePaneIds}
            workspacePanes={workspacePanes}
            onClosePane={closeWorkspacePane}
            onColorModeChange={setColorMode}
            onLaunchApp={launchWorkspaceProgram}
          />
        }
      />
    </main>
  )
}
