import { getObjectId } from '@automerge/automerge'
import {
  parseAutomergeUrl,
  stringifyAutomergeUrl,
} from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useDocument } from '@patchpit/tarstate-automerge'
import {
  addEntry,
  createFilesystemDemoState,
  deleteEntry,
  renameEntry,
} from './repo.js'
import type { FilesystemUiDoc } from './repo.js'
import { isAutomergeEntryUrl } from './model.js'
import type { EntryType, FolderDoc } from './model.js'
import { selectionFromNode } from './tree-state.js'
import type {
  ContextMenuState,
  SelectedDoc,
  TreeContextTarget,
  TreeNodeRef,
} from './tree-state.js'

const demoState = createFilesystemDemoState()

export type {
  ContextMenuState,
  SelectedDoc,
  TreeContextTarget,
  TreeNodeRef,
} from './tree-state.js'

type FilesystemDemoContext = typeof demoState & {
  selected: SelectedDoc
  contextMenu: ContextMenuState | null
  colorMode: FilesystemUiDoc['colorMode']
  isFolderOpen: (entryId: string | null) => boolean
  toggleFolder: (entryId: string | null) => void
  select: (next: SelectedDoc) => void
  selectNode: (node: TreeNodeRef) => void
  setColorMode: (mode: FilesystemUiDoc['colorMode']) => void
  openContextMenu: (x: number, y: number, target: TreeContextTarget) => void
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
  const { repo, rootHandle, uiHandle, rootEntryName } = demoState
  const ui = useDocument(uiHandle)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    void applyInitialUrlSelection(repo, rootHandle, uiHandle, rootEntryName)
  }, [repo, rootHandle, rootEntryName, uiHandle])

  function isFolderOpen(entryId: string | null) {
    return !ui.closedFolderEntryIds.includes(folderOpenId(entryId))
  }

  function toggleFolder(entryId: string | null) {
    const id = folderOpenId(entryId)
    uiHandle.change((draft) => {
      const index = draft.closedFolderEntryIds.indexOf(id)
      if (index === -1) draft.closedFolderEntryIds.push(id)
      else draft.closedFolderEntryIds.splice(index, 1)
    })
  }

  function select(next: SelectedDoc) {
    uiHandle.change((draft) => {
      draft.selected = next
    })
  }

  function selectNode(node: TreeNodeRef) {
    select(selectionFromNode(node))
  }

  function setColorMode(mode: FilesystemUiDoc['colorMode']) {
    uiHandle.change((draft) => {
      draft.colorMode = mode
    })
  }

  function openContextMenu(x: number, y: number, target: TreeContextTarget) {
    select(selectionFromNode(target))
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
    if (ui.selected.entryId === target.entryId) {
      uiHandle.change((draft) => {
        draft.selected.name = name
      })
    }
    closeContextMenu()
  }

  function deleteTreeEntry(target: TreeContextTarget) {
    if (!target.parentUrl) return

    void deleteEntry(repo, target.parentUrl, target.url)
    uiHandle.change((draft) => {
      draft.selected = {
        entryId: null,
        type: 'folder',
        url: rootHandle.url,
        parentUrl: null,
        name: rootEntryName,
      }
      const index = draft.closedFolderEntryIds.indexOf(
        folderOpenId(target.entryId),
      )
      if (index !== -1) draft.closedFolderEntryIds.splice(index, 1)
    })
    closeContextMenu()
  }

  return (
    <FilesystemDemoContext.Provider
      value={{
        ...demoState,
        selected: ui.selected,
        contextMenu,
        colorMode: ui.colorMode,
        isFolderOpen,
        toggleFolder,
        select,
        selectNode,
        setColorMode,
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

export function useFilesystemDemo() {
  const context = useContext(FilesystemDemoContext)
  if (!context) {
    throw new Error('useFilesystemDemo must be used inside FilesystemDemo')
  }
  return context
}

const rootFolderOpenId = 'root'

function folderOpenId(entryId: string | null): string {
  return entryId ?? rootFolderOpenId
}

async function applyInitialUrlSelection(
  repo: typeof demoState.repo,
  rootHandle: typeof demoState.rootHandle,
  uiHandle: typeof demoState.uiHandle,
  rootEntryName: string,
) {
  const requestedUrl = initialRequestedUrl()
  if (!requestedUrl) return

  const targetKey = entryUrlKey(requestedUrl)
  if (!targetKey) return

  const matches = await findEntriesByUrl(
    repo,
    rootHandle,
    rootEntryName,
    targetKey,
  )
  const [match] = matches
  if (matches.length !== 1 || !match) return

  uiHandle.change((draft) => {
    draft.selected = match
  })
}

function initialRequestedUrl(): string | null {
  return new URLSearchParams(window.location.search).get('url')
}

async function findEntriesByUrl(
  repo: typeof demoState.repo,
  rootHandle: typeof demoState.rootHandle,
  rootEntryName: string,
  targetKey: string,
): Promise<SelectedDoc[]> {
  const rootKey = entryUrlKey(rootHandle.url)
  const matches: SelectedDoc[] =
    rootKey === targetKey
      ? [
          {
            entryId: null,
            type: 'folder',
            url: rootHandle.url,
            parentUrl: null,
            name: rootEntryName,
          },
        ]
      : []

  await collectEntryMatches(repo, rootHandle, targetKey, matches)
  return matches
}

async function collectEntryMatches(
  repo: typeof demoState.repo,
  folderHandle: typeof demoState.rootHandle,
  targetKey: string,
  matches: SelectedDoc[],
) {
  const folder = folderHandle.doc() as FolderDoc

  for (const entry of folder.entries) {
    const entryId = getObjectId(entry)
    if (!entryId) continue

    if (entryUrlKey(entry.url) === targetKey) {
      matches.push({
        entryId,
        type: entry.type,
        url: entry.url,
        parentUrl: folderHandle.url,
        name: entry.name,
      })
    }

    if (entry.type === 'folder' && isAutomergeEntryUrl(entry.url)) {
      const childHandle = await repo.find<FolderDoc>(entry.url)
      await collectEntryMatches(repo, childHandle, targetKey, matches)
    }
  }
}

function entryUrlKey(url: string): string | null {
  if (!isAutomergeEntryUrl(url)) return url

  try {
    const { documentId } = parseAutomergeUrl(url)
    return stringifyAutomergeUrl({ documentId })
  } catch {
    return null
  }
}
