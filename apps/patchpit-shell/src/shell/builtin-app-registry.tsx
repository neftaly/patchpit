import type { ReactNode } from 'react'
import { BashTerminal } from '@patchpit/bash-terminal'
import type { TerminalFileSystem } from '@patchpit/bash-terminal'
import { FileExplorer } from '@patchpit/file-explorer'
import type { FileExplorerProps } from '@patchpit/file-explorer'
import { treeRootNode } from '@patchpit/file-explorer/tree-state'
import { FileViewer } from '@patchpit/file-viewer'
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

export const builtinAppRegistry = {
  'patchpit:file-explorer': ({
    isFolderOpen,
    openContextMenu,
    paneId,
    repo,
    rootEntryName,
    rootHandle,
    selectNode,
    selected,
    toggleFolder,
  }) => (
    <FileExplorer
      handle={rootHandle}
      isFolderOpen={isFolderOpen}
      node={treeRootNode(rootHandle.url, rootEntryName)}
      onContextMenu={openContextMenu}
      onSelectNode={selectNode}
      onToggleFolder={toggleFolder}
      paneId={paneId}
      repo={repo}
      selected={selected}
    />
  ),
  'patchpit:os': ({ statePane }) => (
    <aside className="state-pane" aria-label="workspace state">
      {statePane}
    </aside>
  ),
  'patchpit:file-viewer': ({
    paneId,
    repo,
    selectedForPane,
    setViewerMode,
    viewerModeForPane,
  }) => (
    <FileViewer
      mode={viewerModeForPane(paneId)}
      paneId={paneId}
      repo={repo}
      selected={selectedForPane(paneId)}
      onModeChange={setViewerMode}
    />
  ),
  'patchpit:bash': ({ terminalFileSystem }) => (
    <BashTerminal fileSystem={terminalFileSystem} />
  ),
} satisfies BuiltinAppRegistry

export function renderBuiltinApp(
  registry: BuiltinAppRegistry,
  programId: WorkspaceProgramId | undefined,
  context: BuiltinAppRenderContext,
): ReactNode {
  if (!programId) return <div />
  return registry[programId](context)
}
