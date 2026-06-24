import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { EntryType } from './model.js'

export type TreeNodeRef = {
  type: EntryType
  url: AutomergeUrl
  parentUrl: AutomergeUrl | null
  name: string
  depth: number
}

export type SelectedDoc = Pick<TreeNodeRef, 'type' | 'url' | 'parentUrl'>

export type TreeContextTarget = TreeNodeRef

export type ContextMenuState = {
  x: number
  y: number
  target: TreeContextTarget
}

export function selectionFromNode(node: TreeNodeRef): SelectedDoc {
  return { type: node.type, url: node.url, parentUrl: node.parentUrl }
}

export function rootNode(url: AutomergeUrl, name: string): TreeNodeRef {
  return {
    type: 'folder',
    url,
    parentUrl: null,
    name,
    depth: 0,
  }
}

export function childNode(
  entry: Pick<TreeNodeRef, 'type' | 'url' | 'name'>,
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
