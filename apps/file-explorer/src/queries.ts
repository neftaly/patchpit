import { getObjectId } from '@automerge/automerge'
import type { ObjID } from '@automerge/automerge'
import type { DocHandle } from '@automerge/automerge-repo'
import { useDocument } from '@patchpit/tarstate-automerge/document'
import type { FolderDoc, FolderEntry } from '@patchpit/filesystem'

export type FolderEntryRef = FolderEntry & {
  objectId: ObjID
}

export function useFolderEntries(
  handle: DocHandle<FolderDoc>,
): readonly FolderEntryRef[] {
  const folder = useDocument(handle)
  return folder.entries.flatMap((entry) => {
    const objectId = getObjectId(entry)
    return objectId ? [{ ...entry, objectId }] : []
  })
}
