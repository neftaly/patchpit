import type { DocHandle } from '@automerge/automerge-repo'
import { useObjectQuery } from '../tarstate-react.js'
import { useDocument } from '../tarstate-automerge.js'
import { all, defineSchema } from '../tarstate/index.js'
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
