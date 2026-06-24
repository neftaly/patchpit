import { TreeContextMenu } from './context-menu.js'
import { SelectedDocPane } from './selected-doc-pane.js'
import { FilesystemDemoProvider, useFilesystemDemo } from './state.js'
import { FolderTreeItem } from './tree.js'
import { rootNode } from './tree-state.js'

export function FilesystemDemo() {
  return (
    <FilesystemDemoProvider>
      <FilesystemWorkspace />
    </FilesystemDemoProvider>
  )
}

function FilesystemWorkspace() {
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
      </nav>

      <SelectedDocPane />
      {contextMenu && <TreeContextMenu />}
    </div>
  )
}
