import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { EntryType } from '@patchpit/filesystem'
import { isWorkspaceProgramId } from './programs.js'
import type { WorkspaceProgramId, WorkspaceProgramRef } from './programs.js'

type JsonRecord = Record<string, unknown>

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

export type WorkspacePaneId = string
export type BaseWorkspacePaneId = (typeof baseWorkspacePaneIds)[number]
export type WorkspaceLayout = WorkspacePaneId | WorkspaceSplitLayout
export type WorkspaceSplitLayout = {
  direction: 'row' | 'column'
  first: WorkspaceLayout
  second: WorkspaceLayout
  splitPercentage?: number
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

export type CreateWorkspacePaneInput = {
  paneId: WorkspacePaneId
  program: WorkspaceProgramRef
  stateUrl: AutomergeUrl
  subject?: WorkspaceSubjectRef | undefined
}

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

export function normalizeWorkspacePanesWithProgramUrlPolicy(
  panes: unknown,
  defaults: WorkspacePanes,
  isProgramUrl: (url: string) => boolean,
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
      isProgramUrl,
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
  return createWorkspacePane({
    paneId,
    program,
    stateUrl,
    subject: sourcePane?.subject,
  })
}

export function createWorkspacePane({
  paneId,
  program,
  stateUrl,
  subject,
}: CreateWorkspacePaneInput): WorkspacePane {
  const pane: WorkspacePane = {
    id: paneId,
    program: { ...program },
    state: { url: stateUrl },
  }
  const clonedSubject = cloneOptionalSubject(subject)
  if (clonedSubject) pane.subject = clonedSubject
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

export function appInstanceStateFileName(
  instanceId: WorkspacePaneId,
  stateUrl?: AutomergeUrl,
): string {
  const stateToken = stateUrl ? `.${appInstanceStateFileToken(stateUrl)}` : ''
  return `${instanceId}${stateToken}.state.automerge`
}

function appInstanceStateFileToken(stateUrl: AutomergeUrl): string {
  return stateUrl
    .replace(/^automerge:/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cloneWorkspaceLayout(layout: WorkspaceLayout): WorkspaceLayout {
  if (typeof layout === 'string') return layout
  const next: WorkspaceSplitLayout = {
    direction: layout.direction,
    first: cloneWorkspaceLayout(layout.first),
    second: cloneWorkspaceLayout(layout.second),
  }
  if (layout.splitPercentage !== undefined) {
    next.splitPercentage = layout.splitPercentage
  }
  return next
}

function cloneWorkspacePanes(panes: WorkspacePanes): WorkspacePanes {
  return Object.fromEntries(
    Object.entries(panes).map(([paneId, pane]) => [
      paneId,
      cloneWorkspacePane(pane),
    ]),
  )
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
  isProgramUrl: (url: string) => boolean,
): WorkspacePane | null {
  if (!isJsonRecord(pane)) return cloneWorkspacePane(fallback)

  const subject = normalizeSubjectRef(pane.subject, fallback.subject)
  const next: WorkspacePane = {
    id: isWorkspacePaneId(pane.id) ? pane.id : expectedPaneId,
    program: normalizeProgramRef(pane.program, fallback.program, isProgramUrl),
    state: normalizePaneStateRef(pane.state, fallback.state),
  }
  if (subject) next.subject = subject
  return next
}

function cloneWorkspacePane(pane: WorkspacePane): WorkspacePane {
  const next: WorkspacePane = {
    id: pane.id,
    program: { ...pane.program },
    state: { ...pane.state },
  }
  if (pane.subject) next.subject = cloneSubject(pane.subject)
  return next
}

function normalizeProgramRef(
  program: unknown,
  fallback: WorkspaceProgramRef,
  isProgramUrl: (url: string) => boolean,
): WorkspaceProgramRef {
  if (!isJsonRecord(program)) return { ...fallback }
  return {
    id: isWorkspaceProgramId(program.id) ? program.id : fallback.id,
    name: typeof program.name === 'string' ? program.name : fallback.name,
    url:
      typeof program.url === 'string' && isProgramUrl(program.url)
        ? (program.url as AutomergeUrl)
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
  return subject ? cloneSubject(subject) : undefined
}

function cloneSubject(subject: WorkspaceSubjectRef): WorkspaceSubjectRef {
  return { ...subject }
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
