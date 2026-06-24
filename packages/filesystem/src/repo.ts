import { Repo } from '@automerge/automerge-repo'
import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import mime from 'mime/lite'
import type { EntryType, FileDoc, FolderDoc, FolderEntry } from './index.js'

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
  folderHandle.change((draft) => {
    const existing = draft.entries.find((entry) => entry.name === name)
    if (existing) {
      existing.type = 'file'
      existing.url = url
      return
    }
    draft.entries.push({ name, type: 'file', url })
  })
}

export function removeLinkedAutomergeFile(
  folderHandle: DocHandle<FolderDoc>,
  url: AutomergeUrl,
) {
  folderHandle.change((draft) => {
    const index = draft.entries.findIndex((entry) => entry.url === url)
    if (index !== -1) draft.entries.splice(index, 1)
  })
}

export async function addEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  type: EntryType,
  name: string,
) {
  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  folderHandle.change((draft) => {
    draft.entries.push(createEmptyEntry(repo, type, name))
  })
}

export async function renameEntry(
  repo: Repo,
  folderUrl: AutomergeUrl,
  entryUrl: string,
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
  entryUrl: string,
) {
  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  folderHandle.change((draft) => {
    const index = draft.entries.findIndex((item) => item.url === entryUrl)
    if (index !== -1) draft.entries.splice(index, 1)
  })
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
