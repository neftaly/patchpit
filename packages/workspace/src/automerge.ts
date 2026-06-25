import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import { normalizeWorkspacePanesWithProgramUrlPolicy } from './model.js'
import type { WorkspacePanes } from './model.js'

export function normalizeWorkspacePanes(
  panes: unknown,
  defaults: WorkspacePanes,
): WorkspacePanes {
  return normalizeWorkspacePanesWithProgramUrlPolicy(
    panes,
    defaults,
    isValidAutomergeUrl,
  )
}
