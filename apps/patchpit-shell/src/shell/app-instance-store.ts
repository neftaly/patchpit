import type { DocHandle, Repo } from '@automerge/automerge-repo'
import {
  addLinkedAutomergeFile,
  removeLinkedAutomergeFile,
} from '@patchpit/filesystem/repo'
import type { FolderDoc } from '@patchpit/filesystem'
import {
  appInstanceStateFileName,
  createWorkspacePaneInstance,
  defaultWorkspaceAppState,
} from '@patchpit/workspace'
import { createWorkspaceAppState } from '@patchpit/workspace/state'
import type {
  SelectedEntry,
  WorkspaceAppStateDoc,
  WorkspacePane,
  WorkspacePaneId,
  WorkspacePanes,
  WorkspaceProgramId,
  WorkspaceProgramRef,
} from '@patchpit/workspace'

export type AppInstanceStore = {
  create: (input: CreateAppInstanceInput) => AppInstance
  close: (pane: WorkspacePane) => void
}

export type CreateAppInstanceInput = {
  paneId: WorkspacePaneId
  programId: WorkspaceProgramId
  selected: SelectedEntry
}

export type AppInstance = {
  pane: WorkspacePane
  stateHandle: DocHandle<WorkspaceAppStateDoc>
}

export function createAppInstanceStore({
  defaultWorkspacePanes,
  osInstancesHandle: runAppsFolderHandle,
  repo,
  workspaceProgramRefs,
}: {
  defaultWorkspacePanes: WorkspacePanes
  osInstancesHandle: DocHandle<FolderDoc>
  repo: Repo
  workspaceProgramRefs: Record<WorkspaceProgramId, WorkspaceProgramRef>
}): AppInstanceStore {
  return {
    create({ paneId, programId, selected }) {
      const program = workspaceProgramRefs[programId]
      const stateHandle = createWorkspaceAppState(
        repo,
        defaultWorkspaceAppState(programId, selected),
      )
      const pane = createWorkspacePaneInstance(
        defaultWorkspacePanes,
        paneId,
        programId,
        stateHandle.url,
        program,
      )

      addLinkedAutomergeFile(
        runAppsFolderHandle,
        appInstanceStateFileName(paneId, stateHandle.url),
        stateHandle.url,
      )
      return { pane, stateHandle }
    },
    close(pane) {
      removeLinkedAutomergeFile(runAppsFolderHandle, pane.state.url)
    },
  }
}
