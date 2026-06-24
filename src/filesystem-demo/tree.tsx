import type { AutomergeUrl, DocHandle } from '@automerge/automerge-repo'
import type { CSSProperties, MouseEvent } from 'react'
import { useResolvedHandle } from './hooks.js'
import type { FolderDoc, FolderEntry } from './model.js'
import { useFolderEntries } from './queries.js'
import { useFilesystemDemo } from './state.js'
import type { TreeContextTarget, TreeNodeRef } from './state.js'

export function FolderTreeItem({
  handle,
  node,
}: {
  handle: DocHandle<FolderDoc>
  node: TreeNodeRef
}) {
  const {
    selected,
    isFolderOpen,
    openContextMenu,
    selectNode,
    toggleFolder,
  } = useFilesystemDemo()
  const entries = useFolderEntries(handle)
  const isOpen = isFolderOpen(handle.url)
  const isSelected = selected.url === handle.url

  return (
    <li role="treeitem" aria-expanded={isOpen} aria-selected={isSelected}>
      <button
        className="tree-item tree-folder"
        style={treeItemStyle(node.depth)}
        type="button"
        onClick={() => {
          toggleFolder(handle.url)
          selectNode(node)
        }}
        onContextMenu={(event) => openTreeContextMenu(event, openContextMenu, node)}
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">{isOpen ? '📂' : '📁'}</span> {node.name}
      </button>
      {isOpen && (
        <ul role="group">
          {entries.map((entry) =>
            entry.type === 'folder' ? (
              <ResolvedFolderTreeItem
                key={entry.url}
                node={childNode(entry, handle.url, node.depth)}
                entry={entry}
              />
            ) : (
              <FileTreeItem
                key={entry.url}
                node={childNode(entry, handle.url, node.depth)}
              />
            ),
          )}
        </ul>
      )}
    </li>
  )
}

function ResolvedFolderTreeItem({
  node,
  entry,
}: {
  node: TreeNodeRef
  entry: FolderEntry
}) {
  const { repo } = useFilesystemDemo()
  const handle = useResolvedHandle<FolderDoc>(repo, entry.url)
  if (!handle) return <li role="treeitem">folder {entry.name} loading</li>

  return (
    <FolderTreeItem
      handle={handle}
      node={node}
    />
  )
}

function FileTreeItem({
  node,
}: {
  node: TreeNodeRef
}) {
  const { openContextMenu, selected, selectNode } = useFilesystemDemo()
  const isSelected = selected.url === node.url
  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        className="tree-item tree-file"
        style={treeItemStyle(node.depth)}
        type="button"
        onClick={() => selectNode(node)}
        onContextMenu={(event) => openTreeContextMenu(event, openContextMenu, node)}
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">📄</span> {node.name}
      </button>
    </li>
  )
}

function childNode(
  entry: FolderEntry,
  parentUrl: AutomergeUrl,
  parentDepth: number,
): TreeNodeRef {
  return {
    type: entry.type,
    url: entry.url,
    parentUrl,
    name: entry.name,
    depth: parentDepth + 1,
  }
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
