import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { EntryType } from '@patchpit/filesystem'

export type JsonRecord = Record<string, unknown>

type MosaicParentLike = {
  direction: 'row' | 'column'
  first: unknown
  second: unknown
  splitPercentage?: unknown
}

export const workspacePaneIds = [
  'files',
  'state',
  'viewer',
  'terminal',
] as const
export const baseWorkspacePaneIds = workspacePaneIds
export const viewerModes = ['view', 'source'] as const

export type WorkspacePaneId = string
export type BaseWorkspacePaneId = (typeof baseWorkspacePaneIds)[number]
export type WorkspaceLayout = WorkspacePaneId | WorkspaceSplitLayout
export type WorkspaceSplitLayout = {
  direction: 'row' | 'column'
  first: WorkspaceLayout
  second: WorkspaceLayout
  splitPercentage?: number
}
export type ColorMode = 'light' | 'auto' | 'dark'
export type ViewerMode = (typeof viewerModes)[number]
export type WorkspaceProgramId =
  | 'patchpit:file-explorer'
  | 'patchpit:os'
  | 'patchpit:file-viewer'
  | 'patchpit:bash'

export const workspacePrograms: Record<
  WorkspaceProgramId,
  { name: string; entry: string; fileName: string }
> = {
  'patchpit:file-explorer': {
    name: 'File explorer',
    entry: 'builtin:file-explorer',
    fileName: 'file-explorer.patchpit-program.automerge',
  },
  'patchpit:os': {
    name: 'Patchpit WM',
    entry: 'builtin:os',
    fileName: 'patchpit-os.patchpit-program.automerge',
  },
  'patchpit:file-viewer': {
    name: 'File viewer',
    entry: 'builtin:file-viewer',
    fileName: 'file-viewer.patchpit-program.automerge',
  },
  'patchpit:bash': {
    name: 'Bash',
    entry: 'builtin:bash',
    fileName: 'bash.patchpit-program.automerge',
  },
}

export type WorkspaceProgramRef = {
  id: WorkspaceProgramId
  name: string
  url: AutomergeUrl
}

export type WorkspaceProgramDoc = {
  '@patchwork': {
    type: 'patchpit-program'
    version: 1
  }
  id: WorkspaceProgramId
  name: string
  entry: string
}

export type WorkspaceSubjectRef =
  | { kind: 'doc'; url: string; type: EntryType }
  | { kind: 'selection'; paneId: WorkspacePaneId }

export type WorkspacePane = {
  id: WorkspacePaneId
  program: WorkspaceProgramRef
  state: {
    url: AutomergeUrl
  }
  subject?: WorkspaceSubjectRef
}

export type WorkspacePanes = Record<string, WorkspacePane>

export type WorkspaceAppStateDoc = {
  '@patchwork': {
    type: 'workspace-app-state'
    version: 1
  }
  paneId: WorkspacePaneId
  program: WorkspaceProgramRef
  state: JsonRecord
}

export type SelectedEntry = {
  entryId: string | null
  type: EntryType
  url: string
  parentUrl: AutomergeUrl | null
  name: string
}

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

export function defaultWorkspaceLayout(): WorkspaceLayout {
  return {
    direction: 'row',
    first: {
      direction: 'column',
      first: 'viewer',
      second: 'terminal',
      splitPercentage: 68,
    },
    second: {
      direction: 'column',
      first: 'files',
      second: 'state',
      splitPercentage: 50,
    },
    splitPercentage: 70,
  }
}

export function normalizeWorkspaceLayout(
  layout: unknown,
  panes: WorkspacePanes,
): WorkspaceLayout {
  const migrated = migrateLegacyWorkspaceLayout(layout)
  if (isCompleteWorkspaceLayout(migrated, panes)) {
    return cloneWorkspaceLayout(migrated)
  }
  const firstPaneId = Object.keys(panes)[0]
  if (firstPaneId) return firstPaneId
  return defaultWorkspaceLayout()
}

export function normalizeWorkspacePanes(
  panes: unknown,
  defaults: WorkspacePanes,
): WorkspacePanes {
  const defaultPane = defaults.viewer ?? Object.values(defaults)[0]
  if (!defaultPane) return {}
  if (!isJsonRecord(panes)) return cloneWorkspacePanes(defaults)

  const next: WorkspacePanes = {}
  for (const [paneId, pane] of Object.entries(panes)) {
    const normalized = normalizeWorkspacePane(
      pane,
      defaults[paneId] ?? defaultPane,
      paneId,
    )
    if (normalized) next[paneId] = normalized
  }
  return next
}

export function createWorkspacePaneInstance(
  defaults: WorkspacePanes,
  paneId: WorkspacePaneId,
  programId: WorkspaceProgramId,
  stateUrl: AutomergeUrl,
  program: WorkspaceProgramRef = workspaceProgramFor(defaults, programId),
): WorkspacePane {
  const sourcePane = workspacePaneWithProgram(defaults, programId)
  const pane: WorkspacePane = {
    id: paneId,
    program,
    state: { url: stateUrl },
  }
  if (sourcePane?.subject) {
    pane.subject = JSON.parse(
      JSON.stringify(sourcePane.subject),
    ) as WorkspaceSubjectRef
  }
  return pane
}

export function workspaceProgramFor(
  panes: WorkspacePanes,
  programId: WorkspaceProgramId,
): WorkspaceProgramRef {
  return { ...requiredWorkspacePaneWithProgram(panes, programId).program }
}

export function addPaneToWorkspaceLayout(
  layout: WorkspaceLayout,
  paneId: WorkspacePaneId,
): WorkspaceLayout {
  return {
    direction: 'column',
    first: layout,
    second: paneId,
    splitPercentage: 76,
  }
}

export function removePaneFromWorkspaceLayout(
  layout: WorkspaceLayout,
  paneId: WorkspacePaneId,
): WorkspaceLayout | null {
  if (layout === paneId) return null
  if (!isMosaicParent(layout)) return layout

  const first = removePaneFromWorkspaceLayout(layout.first, paneId)
  const second = removePaneFromWorkspaceLayout(layout.second, paneId)
  if (!first) return second
  if (!second) return first

  return { ...layout, first, second }
}

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
  selected: SelectedEntry,
): WorkspaceAppState {
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

export function workspaceStateFileName(paneId: WorkspacePaneId): string {
  return `${paneId}.automerge`
}

export function isWorkspaceProgramId(
  value: unknown,
): value is WorkspaceProgramId {
  return (
    value === 'patchpit:file-explorer' ||
    value === 'patchpit:os' ||
    value === 'patchpit:file-viewer' ||
    value === 'patchpit:bash'
  )
}

function cloneWorkspaceLayout(layout: WorkspaceLayout): WorkspaceLayout {
  return JSON.parse(JSON.stringify(layout)) as WorkspaceLayout
}

function cloneWorkspacePanes(panes: WorkspacePanes): WorkspacePanes {
  return JSON.parse(JSON.stringify(panes)) as WorkspacePanes
}

function workspacePaneWithProgram(
  panes: WorkspacePanes,
  programId: WorkspaceProgramId,
): WorkspacePane | undefined {
  return workspacePaneIds
    .map((paneId) => panes[paneId])
    .find((pane) => pane?.program.id === programId)
}

function requiredWorkspacePaneWithProgram(
  panes: WorkspacePanes,
  programId: WorkspaceProgramId,
): WorkspacePane {
  const fallbackPane = panes.viewer ?? Object.values(panes)[0]
  if (!fallbackPane) {
    throw new Error('workspace needs at least one pane')
  }
  return workspacePaneWithProgram(panes, programId) ?? fallbackPane
}

function migrateLegacyWorkspaceLayout(layout: unknown): unknown {
  if (!isMosaicParent(layout)) return layout
  if (!hasLegacyWorkspacePanes(layout)) return layout

  return {
    direction: 'row',
    first: 'viewer',
    second: {
      direction: 'column',
      first: 'files',
      second: 'state',
      splitPercentage: 50,
    },
    splitPercentage: invertedSplitPercentage(layout),
  }
}

function hasLegacyWorkspacePanes(layout: MosaicParentLike): boolean {
  const leaves = leafValues(layout)
  return leaves.includes('sidebar') && leaves.includes('detail')
}

function isCompleteWorkspaceLayout(
  layout: unknown,
  panes: WorkspacePanes,
): layout is WorkspaceLayout {
  const leaves = leafValues(layout)
  const paneIds = Object.keys(panes)
  return (
    isWorkspaceLayout(layout) &&
    paneIds.every((pane) => leaves.includes(pane)) &&
    leaves.every((pane) => typeof pane === 'string' && pane in panes) &&
    new Set(leaves).size === leaves.length
  )
}

function isWorkspaceLayout(layout: unknown): layout is WorkspaceLayout {
  if (isWorkspacePaneId(layout)) return true
  if (!isMosaicParent(layout)) return false
  return isWorkspaceLayout(layout.first) && isWorkspaceLayout(layout.second)
}

function isMosaicParent(layout: unknown): layout is MosaicParentLike {
  if (!layout || typeof layout !== 'object') return false
  const candidate = layout as Partial<MosaicParentLike>
  return (
    (candidate.direction === 'row' || candidate.direction === 'column') &&
    candidate.first !== undefined &&
    candidate.second !== undefined
  )
}

function isWorkspacePaneId(value: unknown): value is WorkspacePaneId {
  return typeof value === 'string' && value.length > 0
}

function normalizeWorkspacePane(
  pane: unknown,
  fallback: WorkspacePane,
  expectedPaneId: string,
): WorkspacePane | null {
  if (!isJsonRecord(pane)) return cloneWorkspacePane(fallback)

  const subject = normalizeSubjectRef(pane.subject, fallback.subject)
  const next: WorkspacePane = {
    id: isWorkspacePaneId(pane.id) ? pane.id : expectedPaneId,
    program: normalizeProgramRef(pane.program, fallback.program),
    state: normalizePaneStateRef(pane.state, fallback.state),
  }
  if (subject) next.subject = subject
  return next
}

function cloneWorkspacePane(pane: WorkspacePane): WorkspacePane {
  return JSON.parse(JSON.stringify(pane)) as WorkspacePane
}

function normalizeProgramRef(
  program: unknown,
  fallback: WorkspaceProgramRef,
): WorkspaceProgramRef {
  if (!isJsonRecord(program)) return { ...fallback }
  return {
    id: isWorkspaceProgramId(program.id) ? program.id : fallback.id,
    name: typeof program.name === 'string' ? program.name : fallback.name,
    url:
      typeof program.url === 'string' && isValidAutomergeUrl(program.url)
        ? program.url
        : fallback.url,
  }
}

function normalizePaneStateRef(
  state: unknown,
  fallback: WorkspacePane['state'],
): WorkspacePane['state'] {
  if (!isJsonRecord(state) || typeof state.url !== 'string') {
    return { ...fallback }
  }
  return { url: state.url as AutomergeUrl }
}

function normalizeSubjectRef(
  subject: unknown,
  fallback: WorkspaceSubjectRef | undefined,
): WorkspaceSubjectRef | undefined {
  if (!isJsonRecord(subject)) return cloneOptionalSubject(fallback)
  if (
    subject.kind === 'doc' &&
    typeof subject.url === 'string' &&
    (subject.type === 'folder' || subject.type === 'file')
  ) {
    return { kind: 'doc', url: subject.url, type: subject.type }
  }
  if (subject.kind === 'selection' && isWorkspacePaneId(subject.paneId)) {
    return { kind: 'selection', paneId: subject.paneId }
  }
  return cloneOptionalSubject(fallback)
}

function cloneOptionalSubject(
  subject: WorkspaceSubjectRef | undefined,
): WorkspaceSubjectRef | undefined {
  return subject
    ? (JSON.parse(JSON.stringify(subject)) as WorkspaceSubjectRef)
    : undefined
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

function leafValues(layout: unknown): unknown[] {
  if (!isMosaicParent(layout)) return [layout]
  return [...leafValues(layout.first), ...leafValues(layout.second)]
}

function splitPercentage(layout: MosaicParentLike): number | undefined {
  return typeof layout.splitPercentage === 'number'
    ? layout.splitPercentage
    : undefined
}

function invertedSplitPercentage(layout: MosaicParentLike): number | undefined {
  const split = splitPercentage(layout)
  if (split === undefined) return undefined
  return 100 - split
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
