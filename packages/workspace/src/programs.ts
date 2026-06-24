import type { AutomergeUrl } from '@automerge/automerge-repo'

export type WorkspaceProgramId =
  | 'patchpit:file-explorer'
  | 'patchpit:os'
  | 'patchpit:file-viewer'
  | 'patchpit:bash'

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
