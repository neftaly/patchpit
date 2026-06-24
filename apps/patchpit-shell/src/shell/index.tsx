import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { BashTerminal } from '@patchpit/bash-terminal'
import { FileExplorer } from '@patchpit/file-explorer'
import { FileViewer } from '@patchpit/file-viewer'
import { rootNode } from '@patchpit/file-explorer/tree-state'
import { Mosaic } from 'react-mosaic-component'
import { TreeContextMenu } from './context-menu.js'
import { useFilesystemDemo } from './state.js'
import { createAutomergeTerminalFileSystem } from './terminal-filesystem.js'
import type { WorkspacePaneId } from '@patchpit/workspace'

export function FilesystemDemo({ statePane }: { statePane?: ReactNode }) {
  const {
    repo,
    rootHandle,
    rootEntryName,
    closeContextMenu,
    contextMenu,
    isFolderOpen,
    openContextMenu,
    selectNode,
    selected,
    selectedForPane,
    setWorkspaceLayout,
    setViewerMode,
    toggleFolder,
    viewerModeForPane,
    workspaceLayout,
    workspacePanes,
  } = useFilesystemDemo()
  const terminalFileSystem = useMemo(
    () =>
      createAutomergeTerminalFileSystem({
        repo,
        rootHandle,
        rootName: rootEntryName,
      }),
    [repo, rootHandle, rootEntryName],
  )

  return (
    <div className="workspace" onClick={closeContextMenu}>
      <Mosaic<WorkspacePaneId>
        className="workspace-mosaic"
        renderTile={(pane) => {
          const programId = workspacePanes[pane]?.program.id

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
                  paneId={pane}
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
                  mode={viewerModeForPane(pane)}
                  paneId={pane}
                  repo={repo}
                  selected={selectedForPane(pane)}
                  onModeChange={setViewerMode}
                />
              )
            case 'patchpit:bash':
              return <BashTerminal fileSystem={terminalFileSystem} />
            default:
              return <div />
          }
        }}
        resize={{ minimumPaneSizePercentage: 20 }}
        value={workspaceLayout}
        onChange={(nextLayout) => {
          if (nextLayout) setWorkspaceLayout(nextLayout)
        }}
      />
      {contextMenu && <TreeContextMenu />}
    </div>
  )
}
