import { FileExplorer } from '@patchpit/file-explorer'
import { treeRootNode } from '@patchpit/file-explorer/tree-state'
import type { BuiltinAppRenderContext } from '../builtin-app-registry.js'

export default function FileExplorerBuiltinApp({
  isFolderOpen,
  openContextMenu,
  paneId,
  repo,
  rootEntryName,
  rootHandle,
  selectNode,
  selected,
  toggleFolder,
}: BuiltinAppRenderContext) {
  return (
    <FileExplorer
      handle={rootHandle}
      isFolderOpen={isFolderOpen}
      node={treeRootNode(rootHandle.url, rootEntryName)}
      onContextMenu={openContextMenu}
      onSelectNode={selectNode}
      onToggleFolder={toggleFolder}
      paneId={paneId}
      repo={repo}
      selected={selected}
    />
  )
}
