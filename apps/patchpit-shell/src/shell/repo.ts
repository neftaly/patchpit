import { Repo } from '@automerge/automerge-repo'
import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import { filesystemFixture } from './fixture.js'
import type {
  FilesystemFixtureEntry,
  FilesystemFixtureDocFile,
  FilesystemFixtureFolder,
  FilesystemFixtureFile,
} from './fixture.js'
import { createFile, createFolder } from '@patchpit/filesystem/repo'
import type { FolderDoc, FolderEntry } from '@patchpit/filesystem'
import {
  appInstanceStateFileName,
  baseWorkspacePaneIds,
  defaultWorkspaceLayout,
  isWorkspaceProgramId,
  workspacePrograms,
} from '@patchpit/workspace'
import { createWorkspacePane } from '@patchpit/workspace/model'
import { createWorkspaceAppState } from '@patchpit/workspace/state'
import type {
  BaseWorkspacePaneId,
  JsonRecord,
  SelectedEntry,
  WorkspaceAppStateDoc,
  WorkspaceLayout,
  WorkspacePanes,
  WorkspaceProgramDoc,
  WorkspaceProgramId,
  WorkspaceProgramRef,
  WorkspaceSubjectRef,
} from '@patchpit/workspace'

export {
  addEntry,
  addLinkedAutomergeFile,
  createFile,
  createFolder,
  deleteEntry,
  removeLinkedAutomergeFile,
  renameEntry,
} from '@patchpit/filesystem/repo'
export { createWorkspaceAppState } from '@patchpit/workspace/state'
export {
  addPaneToWorkspaceLayout,
  baseWorkspacePaneIds,
  createWorkspacePaneInstance,
  defaultWorkspaceAppState,
  defaultWorkspaceLayout,
  normalizeBashAppState,
  normalizeFileExplorerAppState,
  normalizeFileViewerAppState,
  normalizeOsAppState,
  normalizeWorkspaceAppState,
  normalizeWorkspaceLayout,
  normalizeWorkspacePanes,
  removePaneFromWorkspaceLayout,
  viewerModes,
  appInstanceStateFileName,
  workspaceProgramFor,
  workspaceStateFileName,
} from '@patchpit/workspace'
export type {
  BashAppState,
  BaseWorkspacePaneId,
  ColorMode,
  FileExplorerAppState,
  FileViewerAppState,
  JsonRecord,
  OsAppState,
  SelectedEntry,
  ViewerMode,
  WorkspaceAppState,
  WorkspaceAppStateDoc,
  WorkspaceAppStates,
  WorkspaceLayout,
  WorkspacePane,
  WorkspacePaneId,
  WorkspacePanes,
  WorkspaceProgramDoc,
  WorkspaceProgramId,
  WorkspaceProgramRef,
  WorkspaceSubjectRef,
} from '@patchpit/workspace'

export type FilesystemDemoState = {
  repo: Repo
  rootHandle: DocHandle<FolderDoc>
  uiHandle: DocHandle<FilesystemUiDoc>
  osInstancesHandle: DocHandle<FolderDoc>
  workspaceAppStateHandles: Record<
    BaseWorkspacePaneId,
    DocHandle<WorkspaceAppStateDoc>
  >
  defaultWorkspacePanes: WorkspacePanes
  workspaceProgramRefs: Record<WorkspaceProgramId, WorkspaceProgramRef>
  rootEntryName: string
}

export type FilesystemUiDoc = {
  '@patchwork': {
    type: 'filesystem-ui'
    version: 1
  }
  workspaceLayout: WorkspaceLayout
  workspacePanes: WorkspacePanes
}

export function createFilesystemDemoState(
  repo = new Repo(),
): FilesystemDemoState {
  const fixtureContext: FixtureBuildContext = {
    mountHandles: {},
    programUrls: {},
  }
  const rootHandle = createFixtureFolder(
    repo,
    filesystemFixture,
    fixtureContext,
  )
  const workspaceProgramRefs = createWorkspaceProgramRefs(
    fixtureContext.programUrls,
  )
  const { panes: defaultWorkspacePanes, stateHandles } =
    createDefaultWorkspacePanes(
      repo,
      rootHandle.url,
      filesystemFixture.name,
      workspaceProgramRefs,
    )
  const uiHandle = repo.create<FilesystemUiDoc>({
    '@patchwork': { type: 'filesystem-ui', version: 1 },
    workspaceLayout: defaultWorkspaceLayout(),
    workspacePanes: defaultWorkspacePanes,
  })
  const { appInstancesHandle: osInstancesHandle, patchpitHandle } =
    createPatchpitMount(repo, uiHandle.url, stateHandles)
  const mountHandle = fixtureContext.mountHandles.mnt ?? rootHandle
  mountHandle.change((draft) => {
    draft.entries.push({
      name: patchpitHandle.doc()?.name ?? 'patchpit',
      type: 'folder',
      url: patchpitHandle.url,
    })
  })
  return {
    repo,
    rootHandle,
    uiHandle,
    osInstancesHandle,
    workspaceAppStateHandles: stateHandles,
    defaultWorkspacePanes,
    workspaceProgramRefs,
    rootEntryName: filesystemFixture.name,
  }
}

function createDefaultWorkspacePanes(
  repo: Repo,
  rootUrl: AutomergeUrl,
  rootName: string,
  programRefs: Record<WorkspaceProgramId, WorkspaceProgramRef>,
): {
  panes: WorkspacePanes
  stateHandles: Record<BaseWorkspacePaneId, DocHandle<WorkspaceAppStateDoc>>
} {
  const rootSelection: SelectedEntry = {
    entryId: null,
    type: 'folder',
    url: rootUrl,
    parentUrl: null,
    name: rootName,
  }
  const stateHandles = {
    files: createWorkspaceAppState(repo, {
      selected: rootSelection,
      closedFolderEntryIds: [],
    }),
    state: createWorkspaceAppState(repo, {
      colorMode: 'auto',
    }),
    viewer: createWorkspaceAppState(repo, {
      mode: 'view',
      selected: rootSelection,
      selectedUrl: rootUrl,
    }),
    terminal: createWorkspaceAppState(repo, {}),
  }
  const paneDefinitions = [
    {
      paneId: 'files',
      programId: 'patchpit:file-explorer',
      stateHandle: stateHandles.files,
      subject: { kind: 'doc', url: rootUrl, type: 'folder' },
    },
    {
      paneId: 'state',
      programId: 'patchpit:os',
      stateHandle: stateHandles.state,
    },
    {
      paneId: 'viewer',
      programId: 'patchpit:file-viewer',
      stateHandle: stateHandles.viewer,
      subject: { kind: 'selection', paneId: 'files' },
    },
    {
      paneId: 'terminal',
      programId: 'patchpit:bash',
      stateHandle: stateHandles.terminal,
      subject: { kind: 'doc', url: rootUrl, type: 'folder' },
    },
  ] satisfies readonly DefaultWorkspacePaneDefinition[]
  const panes: WorkspacePanes = {}
  for (const { paneId, programId, stateHandle, subject } of paneDefinitions) {
    panes[paneId] = createWorkspacePane({
      paneId,
      program: programRefs[programId],
      stateUrl: stateHandle.url,
      subject,
    })
  }

  return {
    panes,
    stateHandles,
  }
}

type DefaultWorkspacePaneDefinition = {
  paneId: BaseWorkspacePaneId
  programId: WorkspaceProgramId
  stateHandle: DocHandle<WorkspaceAppStateDoc>
  subject?: WorkspaceSubjectRef
}

function createPatchpitMount(
  repo: Repo,
  workspaceUrl: AutomergeUrl,
  stateHandles: Record<BaseWorkspacePaneId, DocHandle<WorkspaceAppStateDoc>>,
): {
  patchpitHandle: DocHandle<FolderDoc>
  appInstancesHandle: DocHandle<FolderDoc>
} {
  const appInstancesHandle = createFolder(
    repo,
    'apps',
    baseWorkspacePaneIds.map((paneId) => ({
      name: appInstanceStateFileName(paneId),
      type: 'file',
      url: stateHandles[paneId].url,
    })),
  )
  const runHandle = createFolder(repo, 'run', [
    {
      name: 'apps',
      type: 'folder',
      url: appInstancesHandle.url,
    },
  ])
  const wmHandle = createFolder(repo, 'wm', [
    {
      name: 'state.automerge',
      type: 'file',
      url: workspaceUrl,
    },
  ])
  const patchpitHandle = createFolder(repo, 'patchpit', [
    {
      name: 'wm',
      type: 'folder',
      url: wmHandle.url,
    },
    {
      name: 'run',
      type: 'folder',
      url: runHandle.url,
    },
  ])
  return { patchpitHandle, appInstancesHandle }
}

function createWorkspaceProgramRefs(
  urls: Partial<Record<WorkspaceProgramId, AutomergeUrl>>,
): Record<WorkspaceProgramId, WorkspaceProgramRef> {
  return Object.fromEntries(
    Object.entries(workspacePrograms).map(([id, program]) => [
      id,
      {
        id,
        name: program.name,
        url: urls[id as WorkspaceProgramId] ?? createEphemeralProgramUrl(id),
      },
    ]),
  ) as Record<WorkspaceProgramId, WorkspaceProgramRef>
}

function createEphemeralProgramUrl(id: string): AutomergeUrl {
  throw new Error(`missing Automerge program doc for ${id}`)
}

function createWorkspaceProgram(
  repo: Repo,
  id: WorkspaceProgramId,
  program: { name: string; entry: string },
): DocHandle<WorkspaceProgramDoc> {
  return repo.create<WorkspaceProgramDoc>({
    '@patchwork': { type: 'patchpit-program', version: 1 },
    id,
    name: program.name,
    entry: program.entry,
  })
}

function createFixtureFolder(
  repo: Repo,
  folder: FilesystemFixtureFolder,
  context: FixtureBuildContext,
): DocHandle<FolderDoc> {
  const handle = createFolder(
    repo,
    folder.name,
    folder.entries.map((entry) => createFixtureEntry(repo, entry, context)),
  )
  if (folder.name === 'mnt') context.mountHandles.mnt = handle
  return handle
}

function createFixtureEntry(
  repo: Repo,
  entry: FilesystemFixtureEntry,
  context: FixtureBuildContext,
): FolderEntry {
  if (entry.type === 'file' && isUrlFile(entry)) {
    return { name: entry.name, type: entry.type, url: entry.url }
  }

  if (entry.type === 'file' && entry.role === 'program') {
    const program = workspaceProgramFromContent(entry.content)
    const handle = program
      ? createWorkspaceProgram(repo, program.id, program)
      : createFile(repo, entry.name, entry.role, entry.content)
    if (program) context.programUrls[program.id] = handle.url
    return { name: entry.name, type: entry.type, url: handle.url }
  }

  const handle =
    entry.type === 'folder'
      ? createFixtureFolder(repo, entry, context)
      : createFile(repo, entry.name, entry.role, entry.content)

  return { name: entry.name, type: entry.type, url: handle.url }
}

function isUrlFile(
  entry: FilesystemFixtureFile,
): entry is FilesystemFixtureFile & { url: string } {
  return 'url' in entry
}

type FixtureBuildContext = {
  mountHandles: {
    mnt?: DocHandle<FolderDoc>
  }
  programUrls: Partial<Record<WorkspaceProgramId, AutomergeUrl>>
}

function workspaceProgramFromContent(
  content: FilesystemFixtureDocFile['content'],
): (WorkspaceProgramDoc & { entry: string }) | null {
  if (!isJsonRecord(content)) return null
  if (
    !isWorkspaceProgramId(content.id) ||
    typeof content.entry !== 'string' ||
    typeof content.title !== 'string'
  ) {
    return null
  }
  return {
    '@patchwork': { type: 'patchpit-program', version: 1 },
    id: content.id,
    name: content.title,
    entry: content.entry,
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
