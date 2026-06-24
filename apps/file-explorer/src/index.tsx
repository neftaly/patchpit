import type { AutomergeUrl, DocHandle, Repo } from '@automerge/automerge-repo'
import type { CSSProperties, MouseEvent } from 'react'
import { useEffect, useState } from 'react'
import { isAutomergeEntryUrl } from '@patchpit/filesystem'
import type { FolderDoc } from '@patchpit/filesystem'
import type { FolderEntryRef } from './queries.js'
import { useFolderEntries } from './queries.js'
import { fileIconForName } from './file-icons.js'
import type { SelectedEntry, WorkspacePaneId } from '@patchpit/workspace'
import type { TreeContextTarget, TreeNodeRef } from './tree-state.js'
import { childNode } from './tree-state.js'

export type FileExplorerProps = {
  handle: DocHandle<FolderDoc>
  node: TreeNodeRef
  paneId: WorkspacePaneId
  repo: Repo
  selected: SelectedEntry
  isFolderOpen: (paneId: WorkspacePaneId, entryId: string | null) => boolean
  onContextMenu: (
    paneId: WorkspacePaneId,
    x: number,
    y: number,
    target: TreeContextTarget,
  ) => void
  onSelectNode: (paneId: WorkspacePaneId, node: TreeNodeRef) => void
  onToggleFolder: (paneId: WorkspacePaneId, entryId: string | null) => void
}

export function FileExplorer(props: FileExplorerProps) {
  return (
    <nav className="tree-pane" aria-label="project explorer">
      <ul className="tree" role="tree" aria-label="project files">
        <FolderTreeItem {...props} />
      </ul>
    </nav>
  )
}

function FolderTreeItem({
  handle,
  isFolderOpen,
  node,
  onContextMenu,
  onSelectNode,
  onToggleFolder,
  paneId,
  repo,
  selected,
}: FileExplorerProps) {
  const entries = useFolderEntries(handle)
  const isOpen = isFolderOpen(paneId, node.entryId)
  const isSelected = isSelectedNode(selected.entryId, node.entryId)

  return (
    <li role="treeitem" aria-expanded={isOpen} aria-selected={isSelected}>
      <button
        className="tree-item tree-folder"
        style={treeItemStyle(node.depth)}
        type="button"
        onClick={() => {
          onToggleFolder(paneId, node.entryId)
          onSelectNode(paneId, node)
        }}
        onContextMenu={(event) =>
          openTreeContextMenu(event, onContextMenu, paneId, node)
        }
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">{isOpen ? '📂' : '📁'}</span>
        <span className="tree-item-title">{node.name}</span>
      </button>
      {isOpen && (
        <ul role="group">
          {entries.map((entry) =>
            entry.type === 'folder' ? (
              <ResolvedFolderTreeItem
                key={entry.objectId}
                node={childNode(entryNode(entry), handle.url, node.depth)}
                entry={entry}
                isFolderOpen={isFolderOpen}
                onContextMenu={onContextMenu}
                onSelectNode={onSelectNode}
                onToggleFolder={onToggleFolder}
                paneId={paneId}
                repo={repo}
                selected={selected}
              />
            ) : (
              <FileTreeItem
                key={entry.objectId}
                node={childNode(entryNode(entry), handle.url, node.depth)}
                onContextMenu={onContextMenu}
                onSelectNode={onSelectNode}
                paneId={paneId}
                selected={selected}
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
  isFolderOpen,
  onContextMenu,
  onSelectNode,
  onToggleFolder,
  paneId,
  repo,
  selected,
}: {
  node: TreeNodeRef
  entry: FolderEntryRef
  isFolderOpen: FileExplorerProps['isFolderOpen']
  onContextMenu: FileExplorerProps['onContextMenu']
  onSelectNode: FileExplorerProps['onSelectNode']
  onToggleFolder: FileExplorerProps['onToggleFolder']
  paneId: WorkspacePaneId
  repo: Repo
  selected: SelectedEntry
}) {
  const folderUrl = isAutomergeEntryUrl(entry.url) ? entry.url : null
  const handle = useResolvedHandle<FolderDoc>(repo, folderUrl)
  if (!folderUrl) return null
  if (!handle) {
    return (
      <li role="treeitem">
        <span className="tree-item-title">folder {entry.name} loading</span>
      </li>
    )
  }

  return (
    <FolderTreeItem
      handle={handle}
      isFolderOpen={isFolderOpen}
      node={node}
      onContextMenu={onContextMenu}
      onSelectNode={onSelectNode}
      onToggleFolder={onToggleFolder}
      paneId={paneId}
      repo={repo}
      selected={selected}
    />
  )
}

function FileTreeItem({
  node,
  onContextMenu,
  onSelectNode,
  paneId,
  selected,
}: {
  node: TreeNodeRef
  onContextMenu: FileExplorerProps['onContextMenu']
  onSelectNode: FileExplorerProps['onSelectNode']
  paneId: WorkspacePaneId
  selected: SelectedEntry
}) {
  const isSelected = isSelectedNode(selected.entryId, node.entryId)
  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        className="tree-item tree-file"
        style={treeItemStyle(node.depth)}
        type="button"
        onClick={() => onSelectNode(paneId, node)}
        onContextMenu={(event) =>
          openTreeContextMenu(event, onContextMenu, paneId, node)
        }
        aria-pressed={isSelected}
      >
        <span aria-hidden="true">{fileIconForName(node.name)}</span>
        <span className="tree-item-title">{node.name}</span>
      </button>
    </li>
  )
}

function useResolvedHandle<T>(
  repo: Repo,
  url: AutomergeUrl | null,
): DocHandle<T> | null {
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
  }, [repo, url])

  return handle
}

function openTreeContextMenu(
  event: MouseEvent,
  openContextMenu: (
    paneId: string,
    x: number,
    y: number,
    target: TreeContextTarget,
  ) => void,
  paneId: string,
  target: TreeContextTarget,
) {
  event.preventDefault()
  openContextMenu(paneId, event.clientX, event.clientY, target)
}

function treeItemStyle(depth: number): CSSProperties {
  return { '--tree-indent': `${depth}rem` } as CSSProperties
}

function entryNode(
  entry: FolderEntryRef,
): Pick<TreeNodeRef, 'entryId' | 'type' | 'url' | 'name'> {
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
