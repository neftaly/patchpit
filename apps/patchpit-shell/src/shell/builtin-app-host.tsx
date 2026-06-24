import type { ReactNode } from 'react'
import { BashTerminal } from '@patchpit/bash-terminal'
import type { TerminalFileSystem } from '@patchpit/bash-terminal'
import { FileExplorer } from '@patchpit/file-explorer'
import { rootNode } from '@patchpit/file-explorer/tree-state'
import { FileViewer } from '@patchpit/file-viewer'
import type { WorkspacePaneId } from '@patchpit/workspace'
import { useFilesystemDemo } from './state.js'

export type BuiltinAppHostProps = {
  paneId: WorkspacePaneId
  statePane?: ReactNode
  terminalFileSystem: TerminalFileSystem
}

export function BuiltinAppHost({
  paneId,
  statePane,
  terminalFileSystem,
}: BuiltinAppHostProps) {
  const {
    repo,
    rootHandle,
    rootEntryName,
    isFolderOpen,
    openContextMenu,
    selectNode,
    selected,
    selectedForPane,
    setViewerMode,
    toggleFolder,
    viewerModeForPane,
    workspacePanes,
  } = useFilesystemDemo()
  const programId = workspacePanes[paneId]?.program.id

  switch (programId) {
    case 'patchpit:file-explorer':
      return (
        <FileExplorer
          handle={rootHandle}
          isFolderOpen={isFolderOpen}
          node={rootNode(rootHandle.url, rootEntryName)}
          onContextMenu={openContextMenu}
          onSelectNode={selectNode}
          onToggleFolder={toggleFolder}
          paneId={paneId}
          repo={repo}
          selected={selected}
        />
      )
    case 'patchpit:os':
      return (
        <aside className="state-pane" aria-label="workspace state">
          {statePane}
        </aside>
      )
    case 'patchpit:file-viewer':
      return (
        <FileViewer
          mode={viewerModeForPane(paneId)}
          paneId={paneId}
          repo={repo}
          selected={selectedForPane(paneId)}
          onModeChange={setViewerMode}
        />
      )
    case 'patchpit:bash':
      return <BashTerminal fileSystem={terminalFileSystem} />
    default:
      return <div />
  }
}
