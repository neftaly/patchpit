import type { ReactNode } from 'react'
import type { TerminalFileSystem } from '@patchpit/bash-terminal'
import type { WorkspacePaneId } from '@patchpit/workspace'
import { renderBuiltinApp } from './builtin-app-registry.js'
import type {
  BuiltinAppRegistry,
  BuiltinAppRenderContext,
} from './builtin-app-registry.js'
import { useFilesystemDemo } from './state.js'

export type BuiltinAppHostProps = {
  paneId: WorkspacePaneId
  registry: BuiltinAppRegistry
  statePane?: ReactNode
  terminalFileSystem: TerminalFileSystem
}

export function BuiltinAppHost({
  paneId,
  registry,
  statePane,
  terminalFileSystem,
}: BuiltinAppHostProps) {
  const {
    repo,
    rootHandle,
    rootEntryName,
    isFolderOpen,
    openContextMenu,
    selectNode,
    selected,
    selectedForPane,
    setViewerMode,
    toggleFolder,
    viewerModeForPane,
    workspacePanes,
  } = useFilesystemDemo()
  const programId = workspacePanes[paneId]?.program.id
  const context: BuiltinAppRenderContext = {
    paneId,
    statePane,
    terminalFileSystem,
    repo,
    rootHandle,
    rootEntryName,
    isFolderOpen,
    openContextMenu,
    selectNode,
    selected,
    selectedForPane,
    setViewerMode,
    toggleFolder,
    viewerModeForPane,
  }

  return renderBuiltinApp(registry, programId, context)
}
