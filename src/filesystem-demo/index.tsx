import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import {
  addEntry,
  createFilesystemDemoState,
  deleteEntry,
  renameEntry,
} from './model.js'
import type { EntryType, SelectedDoc } from './model.js'
import { SelectedDocPane } from './selected-doc-pane.js'
import { FolderTreeItem } from './tree.js'
import type { TreeContextTarget } from './tree.js'

const demoState = createFilesystemDemoState()

type ContextMenuState = {
  x: number
  y: number
  target: TreeContextTarget
}

export function FilesystemDemo() {
  const { repo, rootHandle, rootEntryName } = demoState
  const [closedUrls, setClosedUrls] = useState<Set<AutomergeUrl>>(
    () => new Set(),
  )
  const [selected, setSelected] = useState<SelectedDoc>({
    type: 'folder',
    url: rootHandle.url,
    parentUrl: null,
  })
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  function toggleFolder(url: AutomergeUrl) {
    setClosedUrls((current) => {
      const next = new Set(current)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function select(next: SelectedDoc) {
    setSelected(next)
  }

  function promptAndAddEntry(folderUrl: AutomergeUrl, type: EntryType) {
    const name = window.prompt(`new ${type} name`)?.trim()
    if (!name) return

    void addEntry(repo, folderUrl, type, name)
    setContextMenu(null)
  }

  function promptAndRename(target: TreeContextTarget) {
    if (!target.parentUrl) return

    const name = window.prompt('rename', target.entryName)?.trim()
    if (!name) return

    void renameEntry(repo, target.parentUrl, target.url, name)
    setContextMenu(null)
  }

  function promptAndDelete(target: TreeContextTarget) {
    if (!target.parentUrl) return
    if (!window.confirm(`delete ${target.entryName}?`)) return

    void deleteEntry(repo, target.parentUrl, target.url)
    setSelected({ type: 'folder', url: rootHandle.url, parentUrl: null })
    setClosedUrls((current) => {
      const next = new Set(current)
      next.delete(target.url)
      return next
    })
    setContextMenu(null)
  }

  function openContextMenu(event: MouseEvent, target: TreeContextTarget) {
    event.preventDefault()
    setSelected(
      target.type === 'folder'
        ? { type: 'folder', url: target.url, parentUrl: target.parentUrl }
        : { type: 'file', url: target.url, parentUrl: target.parentUrl },
    )
    setContextMenu({ x: event.clientX, y: event.clientY, target })
  }

  return (
    <main className="app" onClick={() => setContextMenu(null)}>
      <div className="workspace">
        <nav className="tree-pane" aria-label="project explorer">
          <ul className="tree" role="tree" aria-label="project files">
            <FolderTreeItem
              repo={repo}
              handle={rootHandle}
              entryName={rootEntryName}
              parentUrl={null}
              selectedUrl={selected.url}
              closedUrls={closedUrls}
              onToggle={toggleFolder}
              onSelect={select}
              onContextMenu={openContextMenu}
            />
          </ul>
        </nav>

        <SelectedDocPane repo={repo} selected={selected} />
      </div>
      {contextMenu && (
        <TreeContextMenu
          state={contextMenu}
          onAddEntry={promptAndAddEntry}
          onRename={promptAndRename}
          onDelete={promptAndDelete}
        />
      )}
    </main>
  )
}

function TreeContextMenu({
  state,
  onAddEntry,
  onRename,
  onDelete,
}: {
  state: ContextMenuState
  onAddEntry: (folderUrl: AutomergeUrl, type: EntryType) => void
  onRename: (target: TreeContextTarget) => void
  onDelete: (target: TreeContextTarget) => void
}) {
  const { target } = state
  const canEditEntry = target.parentUrl !== null

  return (
    <menu
      className="context-menu"
      style={{ left: state.x, top: state.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {target.type === 'folder' && (
        <>
          <button type="button" onClick={() => onAddEntry(target.url, 'file')}>
            new file
          </button>
          <button
            type="button"
            onClick={() => onAddEntry(target.url, 'folder')}
          >
            new folder
          </button>
        </>
      )}
      {canEditEntry && (
        <>
          <button type="button" onClick={() => onRename(target)}>
            rename
          </button>
          <button type="button" onClick={() => onDelete(target)}>
            delete
          </button>
        </>
      )}
    </menu>
  )
}
