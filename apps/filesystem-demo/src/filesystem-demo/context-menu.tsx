import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { EntryType } from './model.js'
import { useFilesystemDemo } from './state.js'
import type { TreeContextTarget } from './state.js'

export function TreeContextMenu() {
  const { contextMenu, addEntryToFolder, renameTreeEntry, deleteTreeEntry } =
    useFilesystemDemo()
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
            onClick={() =>
              promptAndAddEntry(addTargetUrl, 'file', addEntryToFolder)
            }
          >
            new file
          </button>
          <button
            type="button"
            onClick={() =>
              promptAndAddEntry(addTargetUrl, 'folder', addEntryToFolder)
            }
          >
            new folder
          </button>
        </>
      )}
      {canEditEntry && (
        <>
          <button
            type="button"
            onClick={() => promptAndRename(target, renameTreeEntry)}
          >
            rename
          </button>
          <button
            type="button"
            onClick={() => promptAndDelete(target, deleteTreeEntry)}
          >
            delete
          </button>
        </>
      )}
    </menu>
  )
}

function promptAndAddEntry(
  folderUrl: AutomergeUrl,
  type: EntryType,
  addEntryToFolder: (
    folderUrl: AutomergeUrl,
    type: EntryType,
    name: string,
  ) => void,
) {
  const name = window.prompt(`new ${type} name`)?.trim()
  if (name) addEntryToFolder(folderUrl, type, name)
}

function promptAndRename(
  target: TreeContextTarget,
  renameTreeEntry: (target: TreeContextTarget, name: string) => void,
) {
  const name = window.prompt('rename', target.name)?.trim()
  if (name) renameTreeEntry(target, name)
}

function promptAndDelete(
  target: TreeContextTarget,
  deleteTreeEntry: (target: TreeContextTarget) => void,
) {
  if (window.confirm(`delete ${target.name}?`)) deleteTreeEntry(target)
}
