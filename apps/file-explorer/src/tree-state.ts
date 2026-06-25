import type { AutomergeUrl } from '@automerge/automerge-repo'

export type FileExplorerPaneId = string

export type ResourceEntryType = 'folder' | 'file'

export type ResourceSelection = {
  entryId: string | null
  type: ResourceEntryType
  url: string
  parentUrl: AutomergeUrl | null
  name: string
}

export type TreeNodeRef = ResourceSelection & {
  depth: number
}

export type SelectedDoc = ResourceSelection

export type ResourceActionTarget = TreeNodeRef

export type TreeContextTarget = ResourceActionTarget

export type ContextMenuState = {
  x: number
  y: number
  target: TreeContextTarget
}

export function selectionFromNode(node: TreeNodeRef): SelectedDoc {
  return {
    entryId: node.entryId,
    type: node.type,
    url: node.url,
    parentUrl: node.parentUrl,
    name: node.name,
  }
}

export function treeRootNode(url: AutomergeUrl, name: string): TreeNodeRef {
  return {
    entryId: null,
    type: 'folder',
    url,
    parentUrl: null,
    name,
    depth: 0,
  }
}

export function childNode(
  entry: Pick<TreeNodeRef, 'entryId' | 'type' | 'url' | 'name'>,
  parentUrl: AutomergeUrl,
  parentDepth: number,
): TreeNodeRef {
  return {
    entryId: entry.entryId,
    type: entry.type,
    url: entry.url,
    parentUrl,
    name: entry.name,
    depth: parentDepth + 1,
  }
}
