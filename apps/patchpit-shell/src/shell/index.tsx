import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Mosaic } from 'react-mosaic-component'
import { BuiltinAppHost } from './builtin-app-host.js'
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
    setWorkspaceLayout,
    workspaceLayout,
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
        renderTile={(paneId) => (
          <BuiltinAppHost
            paneId={paneId}
            statePane={statePane}
            terminalFileSystem={terminalFileSystem}
          />
        )}
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
