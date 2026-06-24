import type { DocHandle } from '@automerge/automerge-repo'
import type { CSSProperties, MouseEvent } from 'react'
import { useResolvedHandle } from './hooks.js'
import { isAutomergeEntryUrl } from './model.js'
import type { FolderDoc } from './model.js'
import type { FolderEntryRef } from './queries.js'
import { useFolderEntries } from './queries.js'
import { useFilesystemDemo } from './state.js'
import type { TreeContextTarget, TreeNodeRef } from './state.js'
import { childNode } from './tree-state.js'

export function FolderTreeItem({
  handle,
  node,
}: {
  handle: DocHandle<FolderDoc>
  node: TreeNodeRef
}) {
  const { selected, isFolderOpen, openContextMenu, selectNode, toggleFolder } =
    useFilesystemDemo()
  const entries = useFolderEntries(handle)
  const isOpen = isFolderOpen(node.entryId)
  const isSelected = isSelectedNode(selected.entryId, node.entryId)

  return (
    <li role="treeitem" aria-expanded={isOpen} aria-selected={isSelected}>
      <button
        className="tree-item tree-folder"
        style={treeItemStyle(node.depth)}
        type="button"
        onClick={() => {
          toggleFolder(node.entryId)
          selectNode(node)
        }}
        onContextMenu={(event) =>
          openTreeContextMenu(event, openContextMenu, node)
        }
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">{isOpen ? '📂' : '📁'}</span> {node.name}
      </button>
      {isOpen && (
        <ul role="group">
          {entries.map((entry) =>
            entry.type === 'folder' ? (
              <ResolvedFolderTreeItem
                key={entry.objectId}
                node={childNode(entryNode(entry), handle.url, node.depth)}
                entry={entry}
              />
            ) : (
              <FileTreeItem
                key={entry.objectId}
                node={childNode(entryNode(entry), handle.url, node.depth)}
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
  entry: FolderEntryRef
}) {
  const { repo } = useFilesystemDemo()
  const folderUrl = isAutomergeEntryUrl(entry.url) ? entry.url : null
  const handle = useResolvedHandle<FolderDoc>(repo, folderUrl)
  if (!folderUrl) return null
  if (!handle) return <li role="treeitem">folder {entry.name} loading</li>

  return <FolderTreeItem handle={handle} node={node} />
}

function FileTreeItem({ node }: { node: TreeNodeRef }) {
  const { openContextMenu, selected, selectNode } = useFilesystemDemo()
  const isSelected = isSelectedNode(selected.entryId, node.entryId)
  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        className="tree-item tree-file"
        style={treeItemStyle(node.depth)}
        type="button"
        onClick={() => selectNode(node)}
        onContextMenu={(event) =>
          openTreeContextMenu(event, openContextMenu, node)
        }
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">📄</span> {node.name}
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

function entryNode(entry: FolderEntryRef): Pick<
  TreeNodeRef,
  'entryId' | 'type' | 'url' | 'name'
> {
  return {
    entryId: entry.objectId,
    type: entry.type,
    url: entry.url,
    name: entry.name,
  }
}

function isSelectedNode(
  selectedEntryId: string | null,
  nodeEntryId: string | null,
): boolean {
  return selectedEntryId === nodeEntryId
}
