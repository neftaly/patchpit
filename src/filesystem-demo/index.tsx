import { SelectedDocPane } from './selected-doc-pane.js'
import { FilesystemDemoProvider, useFilesystemDemo } from './state.js'
import { FolderTreeItem } from './tree.js'

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
            entryName={rootEntryName}
            parentUrl={null}
          />
        </ul>
      </nav>

      <SelectedDocPane />
      {contextMenu && <TreeContextMenu />}
    </div>
  )
}

function TreeContextMenu() {
  const {
    contextMenu,
    promptAndAddEntry,
    promptAndRename,
    promptAndDelete,
  } = useFilesystemDemo()
  if (!contextMenu) return null

  const { target } = contextMenu
  const canEditEntry = target.parentUrl !== null
  const addTargetUrl = target.type === 'folder' ? target.url : target.parentUrl

  return (
    <menu
      className="context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {addTargetUrl && (
        <>
          <button
            type="button"
            onClick={() => promptAndAddEntry(addTargetUrl, 'file')}
          >
            new file
          </button>
          <button
            type="button"
            onClick={() => promptAndAddEntry(addTargetUrl, 'folder')}
          >
            new folder
          </button>
        </>
      )}
      {canEditEntry && (
        <>
          <button type="button" onClick={() => promptAndRename(target)}>
            rename
          </button>
          <button type="button" onClick={() => promptAndDelete(target)}>
            delete
          </button>
        </>
      )}
    </menu>
  )
}
