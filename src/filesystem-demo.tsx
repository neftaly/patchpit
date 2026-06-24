import { Repo, isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { DocHandle } from '@automerge/automerge-repo'
import { useEffect, useState } from 'react'
import { JsonDocEditor, isJsonRecord } from './json-doc-editor.js'
import type { JsonRecord } from './json-doc-editor.js'
import { useDocument } from './tarstate/index.js'

type PatchworkTag<T extends string> = {
  '@patchwork': {
    type: T
    version: 1
  }
}

type EntryType = 'folder' | 'file'

type FolderEntry = {
  name: string
  type: EntryType
  url: AutomergeUrl
}

type FolderDoc = PatchworkTag<'folder'> & {
  name: string
  entries: FolderEntry[]
}

type FileDoc = PatchworkTag<'file'> & {
  name: string
  extension: string
  mimeType: string
  content: string
  metadata: {
    role: string
  }
}

type SelectedDoc =
  | { type: 'folder'; url: AutomergeUrl; parentUrl: AutomergeUrl | null }
  | { type: 'file'; url: AutomergeUrl; parentUrl: AutomergeUrl }

const repo = new Repo()

const manifestHandle = createFile('probability.json', 'manifest', {
  title: 'Tiny Checkers',
  board: 'assets/board.md',
  rules: 'src/rules.ts',
})
const rulesHandle = createFile(
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
  'board.md',
  'asset',
  '# Board\n\n8x8 grid, alternating dark and light squares.\n',
)
const coverHandle = createFile(
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
  'notes.md',
  'notes',
  '# Notes\n\nThe folder owns path resolution. File docs keep stable identity.\n',
)

const srcHandle = createFolder('src', [
  { name: 'rules.ts', type: 'file', url: rulesHandle.url },
])
const assetsHandle = createFolder('assets', [
  { name: 'board.md', type: 'file', url: boardHandle.url },
  { name: 'cover.svg', type: 'file', url: coverHandle.url },
])
const rootHandle = createFolder('tiny-checkers', [
  { name: 'probability.json', type: 'file', url: manifestHandle.url },
  { name: 'src', type: 'folder', url: srcHandle.url },
  { name: 'assets', type: 'folder', url: assetsHandle.url },
  { name: 'notes.md', type: 'file', url: notesHandle.url },
])
const rootEntryName = 'tiny-checkers'

export function FilesystemDemo() {
  const [closedUrls, setClosedUrls] = useState<Set<AutomergeUrl>>(
    () => new Set(),
  )
  const [selected, setSelected] = useState<SelectedDoc>({
    type: 'folder',
    url: rootHandle.url,
    parentUrl: null,
  })
  function toggleFolder(url: AutomergeUrl) {
    setClosedUrls((current) => {
      const next = new Set(current)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function select(next: SelectedDoc) {
    setSelected(next)
  }

  return (
    <main className="app">
      <div className="workspace">
        <nav className="tree-pane" aria-label="project explorer">
          <ul className="tree" role="tree" aria-label="project files">
            <FolderTreeItem
              handle={rootHandle}
              entryName={rootEntryName}
              parentUrl={null}
              selectedUrl={selected.url}
              closedUrls={closedUrls}
              onToggle={toggleFolder}
              onSelect={select}
            />
          </ul>
        </nav>

        <SelectedDocPane selected={selected} />
      </div>
    </main>
  )
}

function FolderTreeItem({
  handle,
  entryName,
  parentUrl,
  selectedUrl,
  closedUrls,
  onToggle,
  onSelect,
}: {
  handle: DocHandle<FolderDoc>
  entryName: string
  parentUrl: AutomergeUrl | null
  selectedUrl: AutomergeUrl
  closedUrls: ReadonlySet<AutomergeUrl>
  onToggle: (url: AutomergeUrl) => void
  onSelect: (doc: SelectedDoc) => void
}) {
  const folder = useDocument(handle)
  const isOpen = !closedUrls.has(handle.url)
  const isSelected = selectedUrl === handle.url

  return (
    <li role="treeitem" aria-expanded={isOpen} aria-selected={isSelected}>
      <button
        className="tree-item tree-folder"
        type="button"
        onClick={() => {
          onToggle(handle.url)
          onSelect({ type: 'folder', url: handle.url, parentUrl })
        }}
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">{isOpen ? '📂' : '📁'}</span> {entryName}
      </button>
      <TreeActions folderUrl={handle.url} />
      {isOpen && (
        <ul role="group">
          {folder.entries.map((entry) =>
            entry.type === 'folder' ? (
              <ResolvedFolderTreeItem
                key={entry.url}
                entry={entry}
                parentUrl={handle.url}
                selectedUrl={selectedUrl}
                closedUrls={closedUrls}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ) : (
              <FileTreeItem
                key={entry.url}
                entry={entry}
                parentUrl={handle.url}
                selectedUrl={selectedUrl}
                onSelect={onSelect}
              />
            ),
          )}
        </ul>
      )}
    </li>
  )
}

function ResolvedFolderTreeItem({
  entry,
  parentUrl,
  selectedUrl,
  closedUrls,
  onToggle,
  onSelect,
}: {
  entry: FolderEntry
  parentUrl: AutomergeUrl
  selectedUrl: AutomergeUrl
  closedUrls: ReadonlySet<AutomergeUrl>
  onToggle: (url: AutomergeUrl) => void
  onSelect: (doc: SelectedDoc) => void
}) {
  const handle = useFolderHandle(entry.url)
  if (!handle) return <li role="treeitem">folder {entry.name} loading</li>

  return (
    <FolderTreeItem
      handle={handle}
      entryName={entry.name}
      parentUrl={parentUrl}
      selectedUrl={selectedUrl}
      closedUrls={closedUrls}
      onToggle={onToggle}
      onSelect={onSelect}
    />
  )
}

function FileTreeItem({
  entry,
  parentUrl,
  selectedUrl,
  onSelect,
}: {
  entry: FolderEntry
  parentUrl: AutomergeUrl
  selectedUrl: AutomergeUrl
  onSelect: (doc: SelectedDoc) => void
}) {
  const isSelected = selectedUrl === entry.url
  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        className="tree-item tree-file"
        type="button"
        onClick={() => onSelect({ type: 'file', url: entry.url, parentUrl })}
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">📄</span> {entry.name}
      </button>
    </li>
  )
}

function TreeActions({ folderUrl }: { folderUrl: AutomergeUrl }) {
  return (
    <span className="tree-actions">
      <button
        className="tree-action"
        type="button"
        aria-label="add file"
        onClick={() => void addEntry(folderUrl, 'file')}
      >
        +f
      </button>
      <button
        className="tree-action"
        type="button"
        aria-label="add folder"
        onClick={() => void addEntry(folderUrl, 'folder')}
      >
        +d
      </button>
    </span>
  )
}

function SelectedDocPane({ selected }: { selected: SelectedDoc }) {
  const handle = useResolvedHandle<FolderDoc | FileDoc>(selected.url)
  if (!handle) return null

  return <SelectedDocContent handle={handle} type={selected.type} />
}

function SelectedDocContent({
  handle,
  type,
}: {
  handle: DocHandle<FolderDoc | FileDoc>
  type: EntryType
}) {
  const doc = useDocument(handle)

  if (type === 'folder' && isFolderDoc(doc)) {
    return (
      <section className="detail-pane">
        <h2>
          <b>title:</b> {doc.name}
        </h2>
        <JsonDocEditor
          title="folder doc"
          handle={handle as DocHandle<FolderDoc>}
          validate={validateFolderDoc}
        />
      </section>
    )
  }

  if (type === 'file' && isFileDoc(doc)) {
    return (
      <section className="detail-pane">
        <h2>
          <b>title:</b> {doc.name}
        </h2>
        <JsonDocEditor
          title="file doc"
          handle={handle as DocHandle<FileDoc>}
          validate={validateFileDoc}
        />
        <FilePreview doc={doc} />
      </section>
    )
  }

  return (
    <section className="detail-pane">
      <h2>selected {type}</h2>
      <p>doc shape does not match the selected tree item</p>
    </section>
  )
}

function FilePreview({ doc }: { doc: FileDoc }) {
  return (
    <>
      <h3>preview</h3>
      {doc.mimeType.startsWith('image/') ? (
        <p className="asset-preview">
          <img src={imageDataUrl(doc)} alt={doc.name} />
        </p>
      ) : (
        <pre className="file-preview">{doc.content}</pre>
      )}
    </>
  )
}

function useFolderHandle(
  url: AutomergeUrl | null,
): DocHandle<FolderDoc> | null {
  return useResolvedHandle<FolderDoc>(url)
}

function useResolvedHandle<T>(url: AutomergeUrl | null): DocHandle<T> | null {
  const [handle, setHandle] = useState<DocHandle<T> | null>(null)

  useEffect(() => {
    let ignore = false
    setHandle(null)
    if (!url) return

    void repo.find<T>(url).then((nextHandle) => {
      if (!ignore) setHandle(nextHandle)
    })

    return () => {
      ignore = true
    }
  }, [url])

  return handle
}

function createFolder(
  name: string,
  entries: FolderEntry[],
): DocHandle<FolderDoc> {
  return repo.create<FolderDoc>({
    '@patchwork': { type: 'folder', version: 1 },
    name,
    entries,
  })
}

function createFile(
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

async function addEntry(folderUrl: AutomergeUrl, type: EntryType) {
  const name = window.prompt(`new ${type} name`)?.trim()
  if (!name) return

  const entry: FolderEntry =
    type === 'folder'
      ? {
          name,
          type,
          url: createFolder(name, []).url,
        }
      : {
          name,
          type,
          url: createFile(name, 'source', '').url,
        }

  const folderHandle = await repo.find<FolderDoc>(folderUrl)
  folderHandle.change((draft) => {
    draft.entries.push(entry)
  })
}

function validateFolderDoc(doc: JsonRecord): string | null {
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

function validateFileDoc(doc: JsonRecord): string | null {
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

function isPatchworkDoc(doc: JsonRecord, type: EntryType): boolean {
  return isJsonRecord(doc['@patchwork']) && doc['@patchwork'].type === type
}

function isFolderDoc(value: unknown): value is FolderDoc {
  return isJsonRecord(value) && validateFolderDoc(value) === null
}

function isFileDoc(value: unknown): value is FileDoc {
  return isJsonRecord(value) && validateFileDoc(value) === null
}

function isFolderEntry(value: unknown): value is FolderEntry {
  return (
    isJsonRecord(value) &&
    typeof value.name === 'string' &&
    (value.type === 'folder' || value.type === 'file') &&
    isValidAutomergeUrl(value.url)
  )
}

function extensionFromName(name: string): string {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index + 1)
}

function mimeTypeFromName(name: string): string {
  if (name.endsWith('.json')) return 'application/json'
  if (name.endsWith('.md')) return 'text/markdown'
  if (name.endsWith('.svg')) return 'image/svg+xml'
  if (name.endsWith('.ts')) return 'text/typescript'
  return 'text/plain'
}

function imageDataUrl(file: FileDoc): string {
  return `data:${file.mimeType};utf8,${encodeURIComponent(file.content)}`
}
