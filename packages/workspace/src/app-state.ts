import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { EntryType } from '@patchpit/filesystem'
import type { WorkspacePaneId } from './model.js'
import type { WorkspaceProgramId } from './programs.js'

export type JsonRecord = Record<string, unknown>

export const viewerModes = ['view', 'source'] as const

export type ColorMode = 'light' | 'auto' | 'dark'
export type ViewerMode = (typeof viewerModes)[number]

export type WorkspaceAppStateDoc = {
  '@patchwork': {
    type: 'workspace-app-state'
    version: 1
  }
  state: JsonRecord
}

export type SelectedEntry = {
  entryId: string | null
  type: EntryType
  url: string
  parentUrl: AutomergeUrl | null
  name: string
}

export type SelectedEntryInput = Pick<SelectedEntry, 'type' | 'url' | 'name'> &
  Partial<Pick<SelectedEntry, 'entryId' | 'parentUrl'>>

export type FileExplorerAppState = {
  selected?: SelectedEntry
  closedFolderEntryIds: string[]
}

export type OsAppState = {
  colorMode: ColorMode
}

export type FileViewerAppState = {
  mode: ViewerMode
  selected?: SelectedEntry
  selectedUrl: string | null
}

export type BashAppState = Record<string, never>

export type WorkspaceAppState =
  | BashAppState
  | FileExplorerAppState
  | FileViewerAppState
  | OsAppState

export type WorkspaceAppStates = Record<WorkspacePaneId, WorkspaceAppState>

export function normalizeFileExplorerAppState(
  state: unknown,
): FileExplorerAppState {
  if (!isJsonRecord(state)) {
    return { closedFolderEntryIds: [] }
  }

  const selected = normalizeSelectedEntry(state.selected)
  const next: FileExplorerAppState = {
    closedFolderEntryIds: Array.isArray(state.closedFolderEntryIds)
      ? state.closedFolderEntryIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  }
  if (selected) next.selected = selected
  return next
}

export function normalizeOsAppState(state: unknown): OsAppState {
  if (!isJsonRecord(state) || !isColorMode(state.colorMode)) {
    return { colorMode: 'auto' }
  }

  return { colorMode: state.colorMode }
}

export function normalizeFileViewerAppState(
  state: unknown,
): FileViewerAppState {
  const selected = isJsonRecord(state)
    ? normalizeSelectedEntry(state.selected)
    : undefined
  const next: FileViewerAppState = {
    mode: isJsonRecord(state) && isViewerMode(state.mode) ? state.mode : 'view',
    selectedUrl:
      isJsonRecord(state) &&
      (typeof state.selectedUrl === 'string' || state.selectedUrl === null)
        ? state.selectedUrl
        : null,
  }
  if (selected) next.selected = selected
  return next
}

export function normalizeBashAppState(_state: unknown): BashAppState {
  return {}
}

export function normalizeWorkspaceAppState(
  programId: WorkspaceProgramId,
  state: unknown,
): WorkspaceAppState {
  switch (programId) {
    case 'patchpit:file-explorer':
      return normalizeFileExplorerAppState(state)
    case 'patchpit:file-viewer':
      return normalizeFileViewerAppState(state)
    case 'patchpit:os':
      return normalizeOsAppState(state)
    case 'patchpit:bash':
      return normalizeBashAppState(state)
  }
}

export function defaultWorkspaceAppState(
  programId: WorkspaceProgramId,
  selectedInput: SelectedEntryInput,
): WorkspaceAppState {
  const selected = selectedEntry(selectedInput)
  switch (programId) {
    case 'patchpit:file-explorer':
      return { selected, closedFolderEntryIds: [] }
    case 'patchpit:file-viewer':
      return { mode: 'view', selected, selectedUrl: selected.url }
    case 'patchpit:os':
      return { colorMode: 'auto' }
    case 'patchpit:bash':
      return {}
  }
}

export function selectedEntry(input: SelectedEntryInput): SelectedEntry {
  return {
    entryId: input.entryId ?? null,
    type: input.type,
    url: input.url,
    parentUrl: input.parentUrl ?? null,
    name: input.name,
  }
}

function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'auto' || value === 'dark'
}

function isViewerMode(value: unknown): value is ViewerMode {
  return value === 'view' || value === 'source'
}

function normalizeSelectedEntry(value: unknown): SelectedEntry | undefined {
  if (!isJsonRecord(value)) return undefined
  if (
    (value.type !== 'folder' && value.type !== 'file') ||
    typeof value.url !== 'string' ||
    typeof value.name !== 'string' ||
    (typeof value.entryId !== 'string' && value.entryId !== null) ||
    (typeof value.parentUrl !== 'string' && value.parentUrl !== null)
  ) {
    return undefined
  }

  return {
    entryId: value.entryId,
    type: value.type,
    url: value.url,
    parentUrl: value.parentUrl as AutomergeUrl | null,
    name: value.name,
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
