import type { DocHandle } from '@automerge/automerge-repo'
import { all, defineSchema } from '@patchpit/tarstate'
import { useDocument } from '@patchpit/tarstate-automerge'
import { useObjectQuery } from '@patchpit/tarstate-react'
import type { FolderDoc, FolderEntry } from './model.js'

const schema = defineSchema({
  entries: { name: '', type: '', url: '' },
})

const folderEntries = all(schema.entries)

export function useFolderEntries(
  handle: DocHandle<FolderDoc>,
): readonly FolderEntry[] {
  const folder = useDocument(handle)
  const result = useObjectQuery(folder, folderEntries)
  return result.data as readonly FolderEntry[]
}
