import type { SelectedEntry } from './app-state.js'
import type { WorkspacePaneId, WorkspaceSubjectRef } from './model.js'

const rootFolderOpenId = 'root'

type SubjectSelectionOptions = {
  rootSelection: SelectedEntry
  rootUrl: string
  seen: Set<WorkspacePaneId>
  selectedForPane: (paneId: WorkspacePaneId) => SelectedEntry
}

export function folderOpenId(entryId: string | null): string {
  return entryId ?? rootFolderOpenId
}

export function selectionFromSubject(
  subject: WorkspaceSubjectRef | undefined,
  options: SubjectSelectionOptions,
): SelectedEntry | null {
  if (!subject) return null
  if (subject.kind === 'doc') {
    return subject.url === options.rootUrl
      ? options.rootSelection
      : {
          entryId: null,
          type: subject.type,
          url: subject.url,
          parentUrl: null,
          name: subject.type,
        }
  }
  if (options.seen.has(subject.paneId)) return null
  options.seen.add(subject.paneId)
  return options.selectedForPane(subject.paneId)
}
