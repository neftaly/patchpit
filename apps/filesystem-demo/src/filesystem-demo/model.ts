import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'

type JsonRecord = Record<string, unknown>

type PatchworkTag<T extends string> = {
  '@patchwork': {
    type: T
    version: 1
  }
}

export type EntryType = 'folder' | 'file'

export type FolderEntry = {
  name: string
  type: EntryType
  url: string
}

export type FolderDoc = PatchworkTag<'folder'> & {
  name: string
  entries: FolderEntry[]
}

export type FileDoc = PatchworkTag<'file'> & {
  name: string
  extension: string
  mimeType: string
  metadata: {
    role: string
  }
  content: string
}

export function validateFolderDoc(doc: JsonRecord): string | null {
  if (!isPatchworkDoc(doc, 'folder')) {
    return 'folder doc needs @patchwork.type: "folder".'
  }
  if (typeof doc.name !== 'string') {
    return 'folder doc needs name: string.'
  }
  if (!Array.isArray(doc.entries) || !doc.entries.every(isFolderEntry)) {
    return 'folder doc needs entries with string name/type/url.'
  }
  return null
}

export function validateFileDoc(doc: JsonRecord): string | null {
  if (!isPatchworkDoc(doc, 'file')) {
    return 'file doc needs @patchwork.type: "file".'
  }
  if (
    typeof doc.name !== 'string' ||
    typeof doc.extension !== 'string' ||
    typeof doc.mimeType !== 'string' ||
    typeof doc.content !== 'string'
  ) {
    return 'file doc needs string name/extension/mimeType/content.'
  }
  if (!isJsonRecord(doc.metadata) || typeof doc.metadata.role !== 'string') {
    return 'file doc needs metadata.role: string.'
  }
  return null
}

export function isFolderDoc(value: unknown): value is FolderDoc {
  return isJsonRecord(value) && validateFolderDoc(value) === null
}

export function isFileDoc(value: unknown): value is FileDoc {
  return isJsonRecord(value) && validateFileDoc(value) === null
}

export function imageDataUrl(file: FileDoc): string {
  return `data:${file.mimeType};utf8,${encodeURIComponent(file.content)}`
}

export function isAutomergeEntryUrl(url: string): url is AutomergeUrl {
  return isValidAutomergeUrl(url)
}

export function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function isPatchworkDoc(doc: JsonRecord, type: EntryType): boolean {
  return isJsonRecord(doc['@patchwork']) && doc['@patchwork'].type === type
}

function isFolderEntry(value: unknown): value is FolderEntry {
  if (
    !isJsonRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.url !== 'string' ||
    (value.type !== 'folder' && value.type !== 'file')
  ) {
    return false
  }

  return value.type === 'folder'
    ? isAutomergeEntryUrl(value.url)
    : isAutomergeEntryUrl(value.url) || isExternalUrl(value.url)
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
