import type { DocHandle } from '@automerge/automerge-repo'
import { useDocument } from '@patchpit/tarstate-automerge/document'
import { folderEntryObjectId } from '@patchpit/filesystem'
import type {
  FolderDoc,
  FolderEntry,
  FolderEntryObjectId,
} from '@patchpit/filesystem'

export type FolderEntryRef = FolderEntry & {
  objectId: FolderEntryObjectId
}

export function useFolderEntries(
  handle: DocHandle<FolderDoc>,
): readonly FolderEntryRef[] {
  const folder = useDocument(handle)
  return folder.entries.flatMap((entry) => {
    const objectId = folderEntryObjectId(entry)
    return objectId ? [{ ...entry, objectId }] : []
  })
}
