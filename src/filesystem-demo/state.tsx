import type { AutomergeUrl } from '@automerge/automerge-repo'
import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import {
  addEntry,
  createFilesystemDemoState,
  deleteEntry,
  renameEntry,
} from './model.js'
import type { EntryType, SelectedDoc } from './model.js'

const demoState = createFilesystemDemoState()

export type TreeContextTarget = SelectedDoc & {
  entryName: string
}

export type ContextMenuState = {
  x: number
  y: number
  target: TreeContextTarget
}

type FilesystemDemoContext = typeof demoState & {
  selected: SelectedDoc
  contextMenu: ContextMenuState | null
  isFolderOpen: (url: AutomergeUrl) => boolean
  toggleFolder: (url: AutomergeUrl) => void
  select: (next: SelectedDoc) => void
  openContextMenu: (
    x: number,
    y: number,
    target: TreeContextTarget,
  ) => void
  closeContextMenu: () => void
  promptAndAddEntry: (folderUrl: AutomergeUrl, type: EntryType) => void
  promptAndRename: (target: TreeContextTarget) => void
  promptAndDelete: (target: TreeContextTarget) => void
}

const FilesystemDemoContext = createContext<FilesystemDemoContext | null>(null)

export function FilesystemDemoProvider({ children }: { children: ReactNode }) {
  const { repo, rootHandle } = demoState
  const [closedUrls, setClosedUrls] = useState<Set<AutomergeUrl>>(
    () => new Set(),
  )
  const [selected, setSelected] = useState<SelectedDoc>({
    type: 'folder',
    url: rootHandle.url,
    parentUrl: null,
  })
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  function isFolderOpen(url: AutomergeUrl) {
    return !closedUrls.has(url)
  }

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

  function openContextMenu(
    x: number,
    y: number,
    target: TreeContextTarget,
  ) {
    setSelected(
      target.type === 'folder'
        ? { type: 'folder', url: target.url, parentUrl: target.parentUrl }
        : { type: 'file', url: target.url, parentUrl: target.parentUrl },
    )
    setContextMenu({ x, y, target })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function promptAndAddEntry(folderUrl: AutomergeUrl, type: EntryType) {
    const name = window.prompt(`new ${type} name`)?.trim()
    if (!name) return

    void addEntry(repo, folderUrl, type, name)
    closeContextMenu()
  }

  function promptAndRename(target: TreeContextTarget) {
    if (!target.parentUrl) return

    const name = window.prompt('rename', target.entryName)?.trim()
    if (!name) return

    void renameEntry(repo, target.parentUrl, target.url, name)
    closeContextMenu()
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
    closeContextMenu()
  }

  return (
    <FilesystemDemoContext.Provider
      value={{
        ...demoState,
        selected,
        contextMenu,
        isFolderOpen,
        toggleFolder,
        select,
        openContextMenu,
        closeContextMenu,
        promptAndAddEntry,
        promptAndRename,
        promptAndDelete,
      }}
    >
      {children}
    </FilesystemDemoContext.Provider>
  )
}

export function useFilesystemDemo() {
  const context = useContext(FilesystemDemoContext)
  if (!context) {
    throw new Error('useFilesystemDemo must be used inside FilesystemDemo')
  }
  return context
}
