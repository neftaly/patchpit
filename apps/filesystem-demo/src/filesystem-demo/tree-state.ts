import type { AutomergeUrl } from '@automerge/automerge-repo'
import type { ObjID } from '@automerge/automerge'
import type { EntryType } from './model.js'
import type { SelectedEntry } from './repo.js'

export type TreeNodeRef = {
  entryId: ObjID | null
  type: EntryType
  url: string
  parentUrl: AutomergeUrl | null
  name: string
  depth: number
}

export type SelectedDoc = SelectedEntry

export type TreeContextTarget = TreeNodeRef

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

export function rootNode(url: AutomergeUrl, name: string): TreeNodeRef {
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
