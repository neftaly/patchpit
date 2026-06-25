import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import {
  isExternalUrl,
  isFolderEntryShape,
  isJsonRecord,
  validateFolderDocShape,
} from './model.js'
import type { FolderDoc, FolderEntry, JsonRecord } from './model.js'

export function validateFolderDoc(doc: JsonRecord): string | null {
  const shapeError = validateFolderDocShape(doc)
  if (shapeError) return shapeError
  if (!(doc.entries as FolderEntry[]).every(isValidFolderEntryUrl)) {
    return 'folder doc needs entries with valid urls.'
  }
  return null
}

export function isFolderDoc(value: unknown): value is FolderDoc {
  return isJsonRecord(value) && validateFolderDoc(value) === null
}

export function isAutomergeEntryUrl(url: string): url is AutomergeUrl {
  return isValidAutomergeUrl(url)
}

function isValidFolderEntryUrl(entry: FolderEntry): boolean {
  if (!isFolderEntryShape(entry)) return false
  return entry.type === 'folder'
    ? isAutomergeEntryUrl(entry.url)
    : isAutomergeEntryUrl(entry.url) || isExternalUrl(entry.url)
}
