import { Repo, isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import mime from 'mime/lite'
import type { JsonRecord } from '../json-doc-editor.js'
import { filesystemFixture } from './fixture.js'
import type { FilesystemFixtureEntry, FilesystemFixtureFolder } from './fixture.js'

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
  url: AutomergeUrl
}

export type FolderDoc = PatchworkTag<'folder'> & {
  name: string
  entries: FolderEntry[]
}

export type FileDoc = PatchworkTag<'file'> & {
  name: string
  extension: string
  mimeType: string
  content: string
  metadata: {
    role: string
  }
}

export type FilesystemDemoState = {
  repo: Repo
  rootHandle: DocHandle<FolderDoc>
  rootEntryName: string
}

export function createFilesystemDemoState(
  repo = new Repo(),
): FilesystemDemoState {
  const rootHandle = createFixtureFolder(repo, filesystemFixture)
  return { repo, rootHandle, rootEntryName: filesystemFixture.name }
}

export function createFolder(
  repo: Repo,
  name: string,
  entries: FolderEntry[],
): DocHandle<FolderDoc> {
  return repo.create<FolderDoc>({
    '@patchwork': { type: 'folder', version: 1 },
    name,
    entries,
  })
}

export function createFile(
  repo: Repo,
  name: string,
  role: string,
  content: string | JsonRecord,
): DocHandle<FileDoc> {
  const text =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  return repo.create<FileDoc>({
    '@patchwork': { type: 'file', version: 1 },
    name,
    extension: extensionFromName(name),
    mimeType: mimeTypeFromName(name),
    content: text,
    metadata: { role },
  })
}

function createFixtureFolder(
  repo: Repo,
  folder: FilesystemFixtureFolder,
): DocHandle<FolderDoc> {
  return createFolder(
    repo,
    folder.name,
    folder.entries.map((entry) => createFixtureEntry(repo, entry)),
  )
}

function createFixtureEntry(
  repo: Repo,
  entry: FilesystemFixtureEntry,
): FolderEntry {
  const handle =
    entry.type === 'folder'
      ? createFixtureFolder(repo, entry)
      : createFile(repo, entry.name, entry.role, entry.content)

  return { name: entry.name, type: entry.type, url: handle.url }
}

export async function addEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  type: EntryType,
  name: string,
) {
  const entry: FolderEntry =
    type === 'folder'
      ? {
          name,
          type,
          url: createFolder(repo, name, []).url,
        }
      : {
          name,
          type,
          url: createFile(repo, name, 'source', '').url,
        }

  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  folderHandle.change((draft) => {
    draft.entries.push(entry)
  })
}

export async function renameEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  entryUrl: AutomergeUrl,
  name: string,
) {
  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  folderHandle.change((draft) => {
    const entry = draft.entries.find((item) => item.url === entryUrl)
    if (entry) entry.name = name
  })
}

export async function deleteEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  entryUrl: AutomergeUrl,
) {
  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  folderHandle.change((draft) => {
    const index = draft.entries.findIndex((item) => item.url === entryUrl)
    if (index !== -1) draft.entries.splice(index, 1)
  })
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

function isPatchworkDoc(doc: JsonRecord, type: EntryType): boolean {
  return isJsonRecord(doc['@patchwork']) && doc['@patchwork'].type === type
}

function isFolderEntry(value: unknown): value is FolderEntry {
  return (
    isJsonRecord(value) &&
    typeof value.name === 'string' &&
    (value.type === 'folder' || value.type === 'file') &&
    isValidAutomergeUrl(value.url)
  )
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function extensionFromName(name: string): string {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index + 1)
}

function mimeTypeFromName(name: string): string {
  return mime.getType(name) ?? 'application/octet-stream'
}
