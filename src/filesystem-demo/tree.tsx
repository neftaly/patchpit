import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import type { CSSProperties, MouseEvent } from 'react'
import { useDocument } from '../tarstate-automerge.js'
import { useResolvedHandle } from './hooks.js'
import type { FolderDoc, FolderEntry } from './model.js'
import { useFilesystemDemo } from './state.js'
import type { TreeContextTarget } from './state.js'

export function FolderTreeItem({
  handle,
  entryName,
  parentUrl,
  depth = 0,
}: {
  handle: DocHandle<FolderDoc>
  entryName: string
  parentUrl: AutomergeUrl | null
  depth?: number
}) {
  const {
    selected,
    isFolderOpen,
    openContextMenu,
    select,
    toggleFolder,
  } = useFilesystemDemo()
  const folder = useDocument(handle)
  const isOpen = isFolderOpen(handle.url)
  const isSelected = selected.url === handle.url

  return (
    <li role="treeitem" aria-expanded={isOpen} aria-selected={isSelected}>
      <button
        className="tree-item tree-folder"
        style={treeItemStyle(depth)}
        type="button"
        onClick={() => {
          toggleFolder(handle.url)
          select({ type: 'folder', url: handle.url, parentUrl })
        }}
        onContextMenu={(event) =>
          openTreeContextMenu(event, openContextMenu, {
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
                entry={entry}
                parentUrl={handle.url}
                depth={depth + 1}
              />
            ) : (
              <FileTreeItem
                key={entry.url}
                entry={entry}
                parentUrl={handle.url}
                depth={depth + 1}
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
  depth,
}: {
  entry: FolderEntry
  parentUrl: AutomergeUrl
  depth: number
}) {
  const { repo } = useFilesystemDemo()
  const handle = useResolvedHandle<FolderDoc>(repo, entry.url)
  if (!handle) return <li role="treeitem">folder {entry.name} loading</li>

  return (
    <FolderTreeItem
      handle={handle}
      entryName={entry.name}
      parentUrl={parentUrl}
      depth={depth}
    />
  )
}

function FileTreeItem({
  entry,
  parentUrl,
  depth,
}: {
  entry: FolderEntry
  parentUrl: AutomergeUrl
  depth: number
}) {
  const { openContextMenu, selected, select } = useFilesystemDemo()
  const isSelected = selected.url === entry.url
  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        className="tree-item tree-file"
        style={treeItemStyle(depth)}
        type="button"
        onClick={() => select({ type: 'file', url: entry.url, parentUrl })}
        onContextMenu={(event) =>
          openTreeContextMenu(event, openContextMenu, {
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

function openTreeContextMenu(
  event: MouseEvent,
  openContextMenu: (x: number, y: number, target: TreeContextTarget) => void,
  target: TreeContextTarget,
) {
  event.preventDefault()
  openContextMenu(event.clientX, event.clientY, target)
}

function treeItemStyle(depth: number): CSSProperties {
  return { '--tree-indent': `${depth}rem` } as CSSProperties
}
