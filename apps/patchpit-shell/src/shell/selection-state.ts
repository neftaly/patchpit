import type { SelectedDoc } from '@patchpit/file-explorer/tree-state'
import type {
  WorkspacePaneId,
  WorkspaceSubjectRef,
} from '@patchpit/workspace'

const rootFolderOpenId = 'root'

type SubjectSelectionOptions = {
  rootSelection: SelectedDoc
  rootUrl: string
  seen: Set<WorkspacePaneId>
  selectedForPane: (paneId: WorkspacePaneId) => SelectedDoc
}

export function folderOpenId(entryId: string | null): string {
  return entryId ?? rootFolderOpenId
}

export function selectionFromSubject(
  subject: WorkspaceSubjectRef | undefined,
  options: SubjectSelectionOptions,
): SelectedDoc | null {
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
