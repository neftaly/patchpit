import { Repo, isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import mime from 'mime/lite'
import type { JsonRecord } from '../json-doc-editor.js'

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
  const manifestHandle = createFile(repo, 'probability.json', 'manifest', {
    title: 'Tiny Checkers',
    board: 'assets/board.md',
    rules: 'src/rules.ts',
  })
  const rulesHandle = createFile(
    repo,
    'rules.ts',
    'source',
    [
      'export function legalMove(from: string, to: string) {',
      '  return from !== to',
      '}',
      '',
    ].join('\n'),
  )
  const boardHandle = createFile(
    repo,
    'board.md',
    'asset',
    '# Board\n\n8x8 grid, alternating dark and light squares.\n',
  )
  const coverHandle = createFile(
    repo,
    'cover.svg',
    'asset',
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">',
      '<rect width="160" height="100" fill="#f8f8f8"/>',
      '<rect x="20" y="20" width="120" height="60" fill="#fff" stroke="#111"/>',
      '<circle cx="58" cy="50" r="14" fill="#c33"/>',
      '<circle cx="102" cy="50" r="14" fill="#222"/>',
      '<text x="80" y="88" text-anchor="middle" font-family="monospace" font-size="10">tiny checkers</text>',
      '</svg>',
      '',
    ].join('\n'),
  )
  const notesHandle = createFile(
    repo,
    'notes.md',
    'notes',
    '# Notes\n\nThe folder owns path resolution. File docs keep stable identity.\n',
  )

  const srcHandle = createFolder(repo, 'src', [
    { name: 'rules.ts', type: 'file', url: rulesHandle.url },
  ])
  const assetsHandle = createFolder(repo, 'assets', [
    { name: 'board.md', type: 'file', url: boardHandle.url },
    { name: 'cover.svg', type: 'file', url: coverHandle.url },
  ])
  const rootHandle = createFolder(repo, 'tiny-checkers', [
    { name: 'probability.json', type: 'file', url: manifestHandle.url },
    { name: 'src', type: 'folder', url: srcHandle.url },
    { name: 'assets', type: 'folder', url: assetsHandle.url },
    { name: 'notes.md', type: 'file', url: notesHandle.url },
  ])

  return { repo, rootHandle, rootEntryName: 'tiny-checkers' }
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
