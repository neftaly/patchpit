import type { DocHandle, Repo } from '@automerge/automerge-repo'
import { sameJsonValue } from './json.js'
import {
  normalizeFileExplorerAppState,
  normalizeFileViewerAppState,
  normalizeOsAppState,
  normalizeWorkspaceAppState,
} from './app-state.js'
import type {
  ColorMode,
  FileExplorerAppState,
  FileViewerAppState,
  JsonRecord,
  SelectedEntry,
  ViewerMode,
  WorkspaceAppState,
  WorkspaceAppStateDoc,
  WorkspaceAppStates,
} from './app-state.js'
import type { WorkspacePaneId, WorkspacePanes } from './model.js'

export type WorkspaceAppStateHandles = Record<
  WorkspacePaneId,
  DocHandle<WorkspaceAppStateDoc>
>

export type WorkspaceAppStateDocs = Readonly<
  Record<WorkspacePaneId, WorkspaceAppStateDoc | undefined>
>

export function createWorkspaceAppState(
  repo: Repo,
  state: JsonRecord,
): DocHandle<WorkspaceAppStateDoc> {
  return repo.create<WorkspaceAppStateDoc>({
    '@patchwork': { type: 'workspace-app-state', version: 1 },
    state,
  })
}

export function workspaceAppStatesFromDocs(
  panes: WorkspacePanes,
  docs: WorkspaceAppStateDocs,
): WorkspaceAppStates {
  return Object.fromEntries(
    Object.entries(panes).map(([paneId, pane]) => [
      paneId,
      normalizeWorkspaceAppState(pane.program.id, docs[paneId]?.state),
    ]),
  ) as WorkspaceAppStates
}

export function repairWorkspaceAppStateDocs({
  docs,
  handles,
  panes,
}: {
  docs: WorkspaceAppStateDocs
  handles: WorkspaceAppStateHandles
  panes: WorkspacePanes
}) {
  for (const [paneId, pane] of Object.entries(panes)) {
    const handle = handles[paneId]
    if (!handle) continue
    repairAppStateDoc(
      handle,
      normalizeWorkspaceAppState(pane.program.id, docs[paneId]?.state),
    )
  }
}

export function fileExplorerStateForPane(
  docs: WorkspaceAppStateDocs,
  paneId: WorkspacePaneId,
): FileExplorerAppState {
  return normalizeFileExplorerAppState(docs[paneId]?.state)
}

export function fileViewerStateForPane(
  docs: WorkspaceAppStateDocs,
  paneId: WorkspacePaneId,
): FileViewerAppState {
  return normalizeFileViewerAppState(docs[paneId]?.state)
}

export function changeFileExplorerState(
  handles: WorkspaceAppStateHandles,
  paneId: WorkspacePaneId,
  update: (state: FileExplorerAppState) => void,
) {
  handles[paneId]?.change((draft) => {
    const state = normalizeFileExplorerAppState(draft.state)
    update(state)
    draft.state = state
  })
}

export function changeFileViewerState(
  handles: WorkspaceAppStateHandles,
  paneId: WorkspacePaneId,
  update: (state: FileViewerAppState) => void,
) {
  handles[paneId]?.change((draft) => {
    const state = normalizeFileViewerAppState(draft.state)
    update(state)
    draft.state = state
  })
}

export function setOsColorMode(
  handles: WorkspaceAppStateHandles,
  paneId: WorkspacePaneId,
  mode: ColorMode,
) {
  handles[paneId]?.change((draft) => {
    const state = normalizeOsAppState(draft.state)
    state.colorMode = mode
    draft.state = state
  })
}

export function setFileViewerMode(
  handles: WorkspaceAppStateHandles,
  paneId: WorkspacePaneId,
  mode: ViewerMode,
) {
  changeFileViewerState(handles, paneId, (state) => {
    state.mode = mode
  })
}

export function setFileViewerSelection(
  handles: WorkspaceAppStateHandles,
  paneId: WorkspacePaneId,
  selected: SelectedEntry,
) {
  changeFileViewerState(handles, paneId, (state) => {
    state.selected = selected
    state.selectedUrl = selected.url
  })
}

function repairAppStateDoc(
  handle: DocHandle<WorkspaceAppStateDoc>,
  state: WorkspaceAppState,
) {
  const doc = handle.doc()
  if (!doc || sameJsonValue(doc.state, state)) return
  handle.change((draft) => {
    draft.state = state
  })
}
