import type { AutomergeUrl, DocHandle, Repo } from '@automerge/automerge-repo'
import { useDocument } from '../tarstate/index.js'
import { useResolvedHandle } from './hooks.js'
import type { EntryType, FolderDoc, FolderEntry, SelectedDoc } from './model.js'

type AddEntryHandler = (folderUrl: AutomergeUrl, type: EntryType) => void

export function FolderTreeItem({
  repo,
  handle,
  entryName,
  parentUrl,
  selectedUrl,
  closedUrls,
  onToggle,
  onSelect,
  onAddEntry,
}: {
  repo: Repo
  handle: DocHandle<FolderDoc>
  entryName: string
  parentUrl: AutomergeUrl | null
  selectedUrl: AutomergeUrl
  closedUrls: ReadonlySet<AutomergeUrl>
  onToggle: (url: AutomergeUrl) => void
  onSelect: (doc: SelectedDoc) => void
  onAddEntry: AddEntryHandler
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
      <TreeActions folderUrl={handle.url} onAddEntry={onAddEntry} />
      {isOpen && (
        <ul role="group">
          {folder.entries.map((entry) =>
            entry.type === 'folder' ? (
              <ResolvedFolderTreeItem
                key={entry.url}
                repo={repo}
                entry={entry}
                parentUrl={handle.url}
                selectedUrl={selectedUrl}
                closedUrls={closedUrls}
                onToggle={onToggle}
                onSelect={onSelect}
                onAddEntry={onAddEntry}
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
  repo,
  entry,
  parentUrl,
  selectedUrl,
  closedUrls,
  onToggle,
  onSelect,
  onAddEntry,
}: {
  repo: Repo
  entry: FolderEntry
  parentUrl: AutomergeUrl
  selectedUrl: AutomergeUrl
  closedUrls: ReadonlySet<AutomergeUrl>
  onToggle: (url: AutomergeUrl) => void
  onSelect: (doc: SelectedDoc) => void
  onAddEntry: AddEntryHandler
}) {
  const handle = useResolvedHandle<FolderDoc>(repo, entry.url)
  if (!handle) return <li role="treeitem">folder {entry.name} loading</li>

  return (
    <FolderTreeItem
      repo={repo}
      handle={handle}
      entryName={entry.name}
      parentUrl={parentUrl}
      selectedUrl={selectedUrl}
      closedUrls={closedUrls}
      onToggle={onToggle}
      onSelect={onSelect}
      onAddEntry={onAddEntry}
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

function TreeActions({
  folderUrl,
  onAddEntry,
}: {
  folderUrl: AutomergeUrl
  onAddEntry: AddEntryHandler
}) {
  return (
    <span className="tree-actions">
      <button
        className="tree-action"
        type="button"
        aria-label="add file"
        onClick={() => onAddEntry(folderUrl, 'file')}
      >
        +f
      </button>
      <button
        className="tree-action"
        type="button"
        aria-label="add folder"
        onClick={() => onAddEntry(folderUrl, 'folder')}
      >
        +d
      </button>
    </span>
  )
}
