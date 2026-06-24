import { Repo } from '@automerge/automerge-repo'
import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import mime from 'mime/lite'
import { filesystemFixture } from './fixture.js'
import type {
  FilesystemFixtureEntry,
  FilesystemFixtureFolder,
} from './fixture.js'
import type { EntryType, FileDoc, FolderDoc, FolderEntry } from './model.js'

type JsonRecord = Record<string, unknown>

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
    mimeType: mime.getType(name) ?? 'application/octet-stream',
    content: text,
    metadata: { role },
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
