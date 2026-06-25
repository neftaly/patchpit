import { Repo } from '@automerge/automerge-repo'
import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import mime from 'mime/lite'
import type { EntryType, FileDoc, FolderDoc, FolderEntry } from './model.js'
import {
  addFolderEntry,
  removeFolderEntryByUrl,
  renameFolderEntryByUrl,
  upsertFolderEntryByName,
} from './write.js'

type JsonRecord = Record<string, unknown>

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
    mimeType: mime.getType(name) ?? 'application/octet-stream',
    content: text,
    metadata: { role },
  })
}

export function addLinkedAutomergeFile(
  folderHandle: DocHandle<FolderDoc>,
  name: string,
  url: AutomergeUrl,
) {
  upsertFolderEntryByName(folderHandle, { name, type: 'file', url })
}

export function removeLinkedAutomergeFile(
  folderHandle: DocHandle<FolderDoc>,
  url: AutomergeUrl,
) {
  removeFolderEntryByUrl(folderHandle, url)
}

export async function addEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  type: EntryType,
  name: string,
) {
  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  addFolderEntry(folderHandle, createEmptyEntry(repo, type, name))
}

export async function renameEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  entryUrl: string,
  name: string,
) {
  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  renameFolderEntryByUrl(folderHandle, entryUrl, name)
}

export async function deleteEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  entryUrl: string,
) {
  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  removeFolderEntryByUrl(folderHandle, entryUrl)
}

function createEmptyEntry(
  repo: Repo,
  type: EntryType,
  name: string,
): FolderEntry {
  const handle =
    type === 'folder'
      ? createFolder(repo, name, [])
      : createFile(repo, name, 'source', '')

  return { name, type, url: handle.url }
}

function extensionFromName(name: string): string {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index + 1)
}
