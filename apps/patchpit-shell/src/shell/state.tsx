import type { AutomergeUrl } from '@automerge/automerge-repo'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useDocument, useDocumentMap } from '@patchpit/tarstate-automerge'
import {
  addEntry,
  deleteEntry,
  renameEntry,
} from '@patchpit/filesystem/repo'
import { createFilesystemDemoState } from './repo.js'
import {
  addPaneToWorkspaceLayout,
  defaultWorkspaceLayout,
  normalizeOsAppState,
  normalizeWorkspaceLayout,
  normalizeWorkspacePanes,
  removePaneFromWorkspaceLayout,
} from '@patchpit/workspace'
import type { FilesystemUiDoc } from './repo.js'
import type {
  ColorMode,
  ViewerMode,
  WorkspaceAppStates,
  WorkspaceLayout,
  WorkspacePanes,
  WorkspacePaneId,
  WorkspaceProgramId,
  WorkspaceSubjectRef,
} from '@patchpit/workspace'
import { sameJsonValue } from './json.js'
import { initialUrlSelection } from './initial-selection.js'
import type { EntryType } from '@patchpit/filesystem'
import { selectionFromNode } from '@patchpit/file-explorer/tree-state'
import type {
  ContextMenuState,
  SelectedDoc,
  TreeContextTarget,
  TreeNodeRef,
} from '@patchpit/file-explorer/tree-state'
import {
  changeFileExplorerState,
  fileExplorerStateForPane,
  fileViewerStateForPane,
  repairWorkspaceAppStateDocs,
  setFileViewerMode,
  setFileViewerSelection,
  setOsColorMode,
  workspaceAppStatesFromDocs,
} from '@patchpit/workspace/state'
import type { WorkspaceAppStateHandles } from '@patchpit/workspace/state'
import { createAppInstanceStore } from './app-instance-store.js'

const demoState = createFilesystemDemoState()

export type {
  ContextMenuState,
  SelectedDoc,
  TreeContextTarget,
  TreeNodeRef,
} from '@patchpit/file-explorer/tree-state'

type FilesystemDemoContext = Omit<
  typeof demoState,
  'workspaceAppStateHandles'
> & {
  workspaceAppStateHandles: WorkspaceAppStateHandles
  selected: SelectedDoc
  uiState: FilesystemUiSnapshot
  contextMenu: ContextMenuState | null
  colorMode: ColorMode
  workspaceLayout: WorkspaceLayout
  workspacePanes: WorkspacePanes
  workspaceAppStates: WorkspaceAppStates
  workspacePaneIds: WorkspacePaneId[]
  isFolderOpen: (paneId: WorkspacePaneId, entryId: string | null) => boolean
  toggleFolder: (paneId: WorkspacePaneId, entryId: string | null) => void
  selectedForPane: (paneId: WorkspacePaneId) => SelectedDoc
  viewerModeForPane: (paneId: WorkspacePaneId) => ViewerMode
  select: (paneId: WorkspacePaneId, next: SelectedDoc) => void
  selectNode: (paneId: WorkspacePaneId, node: TreeNodeRef) => void
  setColorMode: (mode: ColorMode) => void
  setViewerMode: (paneId: WorkspacePaneId, mode: ViewerMode) => void
  setWorkspaceLayout: (layout: WorkspaceLayout) => void
  launchWorkspaceProgram: (programId: WorkspaceProgramId) => void
  closeWorkspacePane: (paneId: WorkspacePaneId) => void
  openContextMenu: (
    paneId: WorkspacePaneId,
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

type FilesystemUiSnapshot = FilesystemUiDoc & {
  workspaceAppStates: WorkspaceAppStates
}

const FilesystemDemoContext = createContext<FilesystemDemoContext | null>(null)

export function FilesystemDemoProvider({ children }: { children: ReactNode }) {
  const {
    repo,
    rootHandle,
    uiHandle,
    osInstancesHandle,
    rootEntryName,
    defaultWorkspacePanes,
    workspaceProgramRefs,
  } = demoState
  const ui = useDocument(uiHandle)
  const nextInstanceId = useRef(1)
  const [workspaceAppStateHandles, setWorkspaceAppStateHandles] = useState<
    WorkspaceAppStateHandles
  >(() => demoState.workspaceAppStateHandles)
  const workspaceAppStateDocs = useDocumentMap(workspaceAppStateHandles)
  const appInstanceStore = useMemo(
    () =>
      createAppInstanceStore({
        defaultWorkspacePanes,
        osInstancesHandle,
        repo,
        workspaceProgramRefs,
      }),
    [defaultWorkspacePanes, osInstancesHandle, repo, workspaceProgramRefs],
  )
  const workspacePanes = useMemo(
    () => normalizeWorkspacePanes(ui.workspacePanes, defaultWorkspacePanes),
    [defaultWorkspacePanes, ui.workspacePanes],
  )
  const workspaceLayout = useMemo(
    () => normalizeWorkspaceLayout(ui.workspaceLayout, workspacePanes),
    [ui.workspaceLayout, workspacePanes],
  )
  const workspaceAppStates = useMemo(
    () => workspaceAppStatesFromDocs(workspacePanes, workspaceAppStateDocs),
    [workspaceAppStateDocs, workspacePanes],
  )
  const osAppState = normalizeOsAppState(workspaceAppStates.state)
  const rootSelection = useMemo(
    (): SelectedDoc => ({
      entryId: null,
      type: 'folder',
      url: rootHandle.url,
      parentUrl: null,
      name: rootEntryName,
    }),
    [rootHandle.url, rootEntryName],
  )
  const selected = selectedForPane('files')
  const workspacePaneIds = Object.keys(workspacePanes)
  const uiState = { ...ui, workspaceLayout, workspacePanes, workspaceAppStates }
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    void initialUrlSelection({ repo, rootHandle, rootEntryName }).then(
      (match) => {
        if (match) select('files', match)
      },
    )
  }, [repo, rootHandle, rootEntryName])

  useEffect(() => {
    if (sameJsonValue(ui.workspaceLayout, workspaceLayout)) return
    uiHandle.change((draft) => {
      draft.workspaceLayout = workspaceLayout
    })
  }, [ui.workspaceLayout, uiHandle, workspaceLayout])

  useEffect(() => {
    if (sameJsonValue(ui.workspacePanes, workspacePanes)) return
    uiHandle.change((draft) => {
      draft.workspacePanes = workspacePanes
    })
  }, [ui.workspacePanes, uiHandle, workspacePanes])

  useEffect(() => {
    repairWorkspaceAppStateDocs({
      docs: workspaceAppStateDocs,
      handles: workspaceAppStateHandles,
      panes: workspacePanes,
    })
  }, [workspaceAppStateDocs, workspaceAppStateHandles, workspacePanes])

  function isFolderOpen(paneId: WorkspacePaneId, entryId: string | null) {
    return !fileExplorerState(paneId).closedFolderEntryIds.includes(
      folderOpenId(entryId),
    )
  }

  function toggleFolder(paneId: WorkspacePaneId, entryId: string | null) {
    const id = folderOpenId(entryId)
    changeFileExplorerState(workspaceAppStateHandles, paneId, (state) => {
      const index = state.closedFolderEntryIds.indexOf(id)
      if (index === -1) state.closedFolderEntryIds.push(id)
      else state.closedFolderEntryIds.splice(index, 1)
    })
  }

  function viewerModeForPane(paneId: WorkspacePaneId): ViewerMode {
    return fileViewerState(paneId).mode
  }

  function selectedForPane(paneId: WorkspacePaneId): SelectedDoc {
    const pane = workspacePanes[paneId]
    if (!pane) return rootSelection

    if (pane.program.id === 'patchpit:file-explorer') {
      return fileExplorerState(paneId).selected ?? rootSelection
    }

    if (pane.program.id === 'patchpit:file-viewer') {
      return (
        fileViewerState(paneId).selected ??
        selectedFromSubject(pane.subject, new Set([paneId])) ??
        rootSelection
      )
    }

    return selectedFromSubject(pane.subject, new Set([paneId])) ?? rootSelection
  }

  function select(paneId: WorkspacePaneId, next: SelectedDoc) {
    changeFileExplorerState(workspaceAppStateHandles, paneId, (state) => {
      state.selected = next
    })
    for (const [viewerPaneId, pane] of Object.entries(workspacePanes)) {
      if (
        pane.program.id !== 'patchpit:file-viewer' ||
        pane.subject?.kind !== 'selection' ||
        pane.subject.paneId !== paneId
      ) {
        continue
      }
      setFileViewerSelection(workspaceAppStateHandles, viewerPaneId, next)
    }
  }

  function selectNode(paneId: WorkspacePaneId, node: TreeNodeRef) {
    select(paneId, selectionFromNode(node))
  }

  function setColorMode(mode: ColorMode) {
    setOsColorMode(workspaceAppStateHandles, mode)
  }

  function setViewerMode(paneId: WorkspacePaneId, mode: ViewerMode) {
    setFileViewerMode(workspaceAppStateHandles, paneId, mode)
  }

  function setWorkspaceLayout(layout: WorkspaceLayout) {
    const nextLayout = normalizeWorkspaceLayout(layout, workspacePanes)
    uiHandle.change((draft) => {
      draft.workspaceLayout = nextLayout
    })
  }

  function launchWorkspaceProgram(programId: WorkspaceProgramId) {
    const paneId = `app-${nextInstanceId.current++}`
    const { pane, stateHandle } = appInstanceStore.create({
      paneId,
      programId,
      selected: selectedForPane('files'),
    })

    setWorkspaceAppStateHandles((handles) => ({
      ...handles,
      [paneId]: stateHandle,
    }))
    uiHandle.change((draft) => {
      const nextPanes = {
        ...normalizeWorkspacePanes(
          draft.workspacePanes,
          defaultWorkspacePanes,
        ),
        [paneId]: pane,
      }
      draft.workspacePanes = nextPanes
      draft.workspaceLayout = addPaneToWorkspaceLayout(
        normalizeWorkspaceLayout(draft.workspaceLayout, workspacePanes),
        paneId,
      )
    })
  }

  function closeWorkspacePane(paneId: WorkspacePaneId) {
    const pane = workspacePanes[paneId]
    if (!pane) return

    appInstanceStore.close(pane)
    if (selectedForPane('files').url === pane.state.url) {
      select('files', rootSelection)
    }
    uiHandle.change((draft) => {
      const nextPanes = normalizeWorkspacePanes(
        draft.workspacePanes,
        defaultWorkspacePanes,
      )
      delete nextPanes[paneId]
      draft.workspacePanes = nextPanes
      draft.workspaceLayout =
        removePaneFromWorkspaceLayout(draft.workspaceLayout, paneId) ??
        Object.keys(nextPanes)[0] ??
        defaultWorkspaceLayout()
    })
    setWorkspaceAppStateHandles((handles) => {
      const next = { ...handles }
      delete next[paneId]
      return next
    })
  }

  function fileExplorerState(paneId: WorkspacePaneId) {
    return fileExplorerStateForPane(workspaceAppStateDocs, paneId)
  }

  function fileViewerState(paneId: WorkspacePaneId) {
    return fileViewerStateForPane(workspaceAppStateDocs, paneId)
  }

  function selectedFromSubject(
    subject: WorkspaceSubjectRef | undefined,
    seen: Set<WorkspacePaneId>,
  ): SelectedDoc | null {
    if (!subject) return null
    if (subject.kind === 'doc') {
      return subject.url === rootHandle.url
        ? rootSelection
        : {
            entryId: null,
            type: subject.type,
            url: subject.url,
            parentUrl: null,
            name: subject.type,
          }
    }
    if (seen.has(subject.paneId)) return null
    seen.add(subject.paneId)
    return selectedForPane(subject.paneId)
  }

  function openContextMenu(
    paneId: WorkspacePaneId,
    x: number,
    y: number,
    target: TreeContextTarget,
  ) {
    select(paneId, selectionFromNode(target))
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
    for (const [paneId, pane] of Object.entries(workspacePanes)) {
      if (pane.program.id !== 'patchpit:file-explorer') continue
      const paneSelected = selectedForPane(paneId)
      if (paneSelected.entryId !== target.entryId) continue

      changeFileExplorerState(workspaceAppStateHandles, paneId, (state) => {
        state.selected = { ...paneSelected, name }
      })
    }
    closeContextMenu()
  }

  function deleteTreeEntry(target: TreeContextTarget) {
    if (!target.parentUrl) return

    void deleteEntry(repo, target.parentUrl, target.url)
    changeFileExplorerState(workspaceAppStateHandles, 'files', (state) => {
      const index = state.closedFolderEntryIds.indexOf(
        folderOpenId(target.entryId),
      )
      if (index !== -1) state.closedFolderEntryIds.splice(index, 1)
      state.selected = rootSelection
    })
    for (const [paneId, pane] of Object.entries(workspacePanes)) {
      if (pane.program.id !== 'patchpit:file-viewer') continue
      setFileViewerSelection(workspaceAppStateHandles, paneId, rootSelection)
    }
    closeContextMenu()
  }

  return (
    <FilesystemDemoContext.Provider
      value={{
        ...demoState,
        workspaceAppStateHandles,
        selected,
        uiState,
        contextMenu,
        colorMode: osAppState.colorMode,
        workspaceLayout,
        workspacePanes,
        workspaceAppStates,
        workspacePaneIds,
        isFolderOpen,
        toggleFolder,
        selectedForPane,
        viewerModeForPane,
        select,
        selectNode,
        setColorMode,
        setViewerMode,
        setWorkspaceLayout,
        launchWorkspaceProgram,
        closeWorkspacePane,
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
