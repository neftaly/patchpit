import type { AutomergeUrl, DocHandle, Repo } from '@automerge/automerge-repo'
import type { MouseEvent } from 'react'
import { useDocument } from '../tarstate-automerge.js'
import { useResolvedHandle } from './hooks.js'
import type { FolderDoc, FolderEntry, SelectedDoc } from './model.js'

export type TreeContextTarget = SelectedDoc & {
  entryName: string
}

export function FolderTreeItem({
  repo,
  handle,
  entryName,
  parentUrl,
  selectedUrl,
  closedUrls,
  onToggle,
  onSelect,
  onContextMenu,
}: {
  repo: Repo
  handle: DocHandle<FolderDoc>
  entryName: string
  parentUrl: AutomergeUrl | null
  selectedUrl: AutomergeUrl
  closedUrls: ReadonlySet<AutomergeUrl>
  onToggle: (url: AutomergeUrl) => void
  onSelect: (doc: SelectedDoc) => void
  onContextMenu: (event: MouseEvent, target: TreeContextTarget) => void
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
        onContextMenu={(event) =>
          onContextMenu(event, {
            type: 'folder',
            url: handle.url,
            parentUrl,
            entryName,
          })
        }
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">{isOpen ? '📂' : '📁'}</span> {entryName}
      </button>
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
                onContextMenu={onContextMenu}
              />
            ) : (
              <FileTreeItem
                key={entry.url}
                entry={entry}
                parentUrl={handle.url}
                selectedUrl={selectedUrl}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
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
  onContextMenu,
}: {
  repo: Repo
  entry: FolderEntry
  parentUrl: AutomergeUrl
  selectedUrl: AutomergeUrl
  closedUrls: ReadonlySet<AutomergeUrl>
  onToggle: (url: AutomergeUrl) => void
  onSelect: (doc: SelectedDoc) => void
  onContextMenu: (event: MouseEvent, target: TreeContextTarget) => void
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
      onContextMenu={onContextMenu}
    />
  )
}

function FileTreeItem({
  entry,
  parentUrl,
  selectedUrl,
  onSelect,
  onContextMenu,
}: {
  entry: FolderEntry
  parentUrl: AutomergeUrl
  selectedUrl: AutomergeUrl
  onSelect: (doc: SelectedDoc) => void
  onContextMenu: (event: MouseEvent, target: TreeContextTarget) => void
}) {
  const isSelected = selectedUrl === entry.url
  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        className="tree-item tree-file"
        type="button"
        onClick={() => onSelect({ type: 'file', url: entry.url, parentUrl })}
        onContextMenu={(event) =>
          onContextMenu(event, {
            type: 'file',
            url: entry.url,
            parentUrl,
            entryName: entry.name,
          })
        }
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">📄</span> {entry.name}
      </button>
    </li>
  )
}
