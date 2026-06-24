import type { ReactNode } from 'react'
import { TreeContextMenu } from './context-menu.js'
import { SelectedDocPane } from './selected-doc-pane.js'
import { useFilesystemDemo } from './state.js'
import { FolderTreeItem } from './tree.js'
import { rootNode } from './tree-state.js'

export function FilesystemDemo({
  sidebarFooter,
}: {
  sidebarFooter?: ReactNode
}) {
  const { rootHandle, rootEntryName, closeContextMenu, contextMenu } =
    useFilesystemDemo()

  return (
    <div className="workspace" onClick={closeContextMenu}>
      <nav className="tree-pane" aria-label="project explorer">
        <ul className="tree" role="tree" aria-label="project files">
          <FolderTreeItem
            handle={rootHandle}
            node={rootNode(rootHandle.url, rootEntryName)}
          />
        </ul>
        {sidebarFooter && (
          <div className="tree-pane-footer">{sidebarFooter}</div>
        )}
      </nav>

      <SelectedDocPane />
      {contextMenu && <TreeContextMenu />}
    </div>
  )
}
