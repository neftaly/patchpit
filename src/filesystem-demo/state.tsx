import type { AutomergeUrl } from '@automerge/automerge-repo'
import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import {
  addEntry,
  createFilesystemDemoState,
  deleteEntry,
  renameEntry,
} from './model.js'
import type { EntryType } from './model.js'

const demoState = createFilesystemDemoState()

export type TreeNodeRef = {
  type: EntryType
  url: AutomergeUrl
  parentUrl: AutomergeUrl | null
  name: string
  depth: number
}

export type SelectedDoc = Pick<TreeNodeRef, 'type' | 'url' | 'parentUrl'>

export type TreeContextTarget = TreeNodeRef

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
  selectNode: (node: TreeNodeRef) => void
  openContextMenu: (
    x: number,
    y: number,
    target: TreeContextTarget,
  ) => void
  closeContextMenu: () => void
  addEntryToFolder: (
    folderUrl: AutomergeUrl,
    type: EntryType,
    name: string,
  ) => void
  renameTreeEntry: (target: TreeContextTarget, name: string) => void
  deleteTreeEntry: (target: TreeContextTarget) => void
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

  function selectNode(node: TreeNodeRef) {
    setSelected(selectionFromNode(node))
  }

  function openContextMenu(
    x: number,
    y: number,
    target: TreeContextTarget,
  ) {
    setSelected(selectionFromNode(target))
    setContextMenu({ x, y, target })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function addEntryToFolder(
    folderUrl: AutomergeUrl,
    type: EntryType,
    name: string,
  ) {
    void addEntry(repo, folderUrl, type, name)
    closeContextMenu()
  }

  function renameTreeEntry(target: TreeContextTarget, name: string) {
    if (!target.parentUrl) return
    void renameEntry(repo, target.parentUrl, target.url, name)
    closeContextMenu()
  }

  function deleteTreeEntry(target: TreeContextTarget) {
    if (!target.parentUrl) return

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
        selectNode,
        openContextMenu,
        closeContextMenu,
        addEntryToFolder,
        renameTreeEntry,
        deleteTreeEntry,
      }}
    >
      {children}
    </FilesystemDemoContext.Provider>
  )
}

function selectionFromNode(node: TreeNodeRef): SelectedDoc {
  return { type: node.type, url: node.url, parentUrl: node.parentUrl }
}

export function useFilesystemDemo() {
  const context = useContext(FilesystemDemoContext)
  if (!context) {
    throw new Error('useFilesystemDemo must be used inside FilesystemDemo')
  }
  return context
}
