import { Suspense, lazy } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { TerminalFileSystem } from '@patchpit/bash-terminal'
import type { FileExplorerProps } from '@patchpit/file-explorer'
import type { FileViewerProps } from '@patchpit/file-viewer'
import type { WorkspacePaneId, WorkspaceProgramId } from '@patchpit/workspace'

export type BuiltinAppRenderContext = {
  paneId: WorkspacePaneId
  statePane?: ReactNode
  terminalFileSystem: TerminalFileSystem
  repo: FileExplorerProps['repo']
  rootHandle: FileExplorerProps['handle']
  rootEntryName: string
  isFolderOpen: FileExplorerProps['isFolderOpen']
  openContextMenu: FileExplorerProps['onContextMenu']
  selectNode: FileExplorerProps['onSelectNode']
  selected: FileExplorerProps['selected']
  selectedForPane: (paneId: WorkspacePaneId) => FileViewerProps['selected']
  setViewerMode: FileViewerProps['onModeChange']
  toggleFolder: FileExplorerProps['onToggleFolder']
  viewerModeForPane: (paneId: WorkspacePaneId) => FileViewerProps['mode']
}

export type BuiltinAppRenderer = (
  context: BuiltinAppRenderContext,
) => ReactNode

export type BuiltinAppRegistry = Readonly<
  Record<WorkspaceProgramId, BuiltinAppRenderer>
>

const BashTerminalBuiltinApp = lazy(
  () => import('./builtin-apps/bash-terminal.js'),
)
const FileExplorerBuiltinApp = lazy(
  () => import('./builtin-apps/file-explorer.js'),
)
const FileViewerBuiltinApp = lazy(() => import('./builtin-apps/file-viewer.js'))

export const builtinAppRegistry = {
  'patchpit:file-explorer': lazyBuiltinApp(FileExplorerBuiltinApp, {
    className: 'tree-pane',
    label: 'Loading file explorer',
  }),
  'patchpit:os': ({ statePane }) => (
    <aside className="state-pane" aria-label="workspace state">
      {statePane}
    </aside>
  ),
  'patchpit:file-viewer': lazyBuiltinApp(FileViewerBuiltinApp, {
    className: 'detail-pane',
    label: 'Loading file viewer',
  }),
  'patchpit:bash': lazyBuiltinApp(BashTerminalBuiltinApp, {
    className: 'terminal-pane',
    label: 'Loading terminal',
  }),
} satisfies BuiltinAppRegistry

function lazyBuiltinApp(
  App: ComponentType<BuiltinAppRenderContext>,
  loading: BuiltinAppLoadingPaneProps,
): BuiltinAppRenderer {
  return (context) => (
    <Suspense fallback={<BuiltinAppLoadingPane {...loading} />}>
      <App {...context} />
    </Suspense>
  )
}

type BuiltinAppLoadingPaneProps = {
  className: string
  label: string
}

function BuiltinAppLoadingPane({
  className,
  label,
}: BuiltinAppLoadingPaneProps) {
  return (
    <div className={className} aria-busy="true" aria-label={label}>
      {label}
    </div>
  )
}

export function renderBuiltinApp(
  registry: BuiltinAppRegistry,
  programId: WorkspaceProgramId | undefined,
  context: BuiltinAppRenderContext,
): ReactNode {
  if (!programId) return <div />
  const renderApp = registry[programId]
  if (!renderApp) return <div />
  return renderApp(context)
}
