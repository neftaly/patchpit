import { FileViewer } from '@patchpit/file-viewer'
import type { BuiltinAppRenderContext } from '../builtin-app-registry.js'

export default function FileViewerBuiltinApp({
  paneId,
  repo,
  selectedForPane,
  setViewerMode,
  viewerModeForPane,
}: BuiltinAppRenderContext) {
  return (
    <FileViewer
      mode={viewerModeForPane(paneId)}
      paneId={paneId}
      repo={repo}
      selected={selectedForPane(paneId)}
      onModeChange={setViewerMode}
    />
  )
}
