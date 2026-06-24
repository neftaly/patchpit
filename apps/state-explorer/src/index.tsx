import { useMemo, useState } from 'react'
import { useDocumentMap } from '@patchpit/tarstate-automerge'
import { workspaceStateFileName } from '@patchpit/workspace'
import type { DocHandle } from '@automerge/automerge-repo'
import type {
  WorkspaceAppStateDoc,
  WorkspacePaneId,
  WorkspacePanes,
} from '@patchpit/workspace'

export type StateExplorerProps = {
  workspaceAppStateHandles: Record<
    WorkspacePaneId,
    DocHandle<WorkspaceAppStateDoc>
  >
  workspacePaneIds: readonly WorkspacePaneId[]
  workspacePanes: WorkspacePanes
}

export function StateExplorer({
  workspaceAppStateHandles,
  workspacePaneIds,
  workspacePanes,
}: StateExplorerProps) {
  const docs = useDocumentMap(workspaceAppStateHandles)
  const inspectablePaneIds = useMemo(
    () => workspacePaneIds.filter((paneId) => Boolean(workspacePanes[paneId])),
    [workspacePaneIds, workspacePanes],
  )
  const [selectedPaneId, setSelectedPaneId] = useState<WorkspacePaneId>(
    () => inspectablePaneIds[0] ?? 'state',
  )
  const paneId = inspectablePaneIds.includes(selectedPaneId)
    ? selectedPaneId
    : inspectablePaneIds[0]
  const selectedDoc = paneId ? docs[paneId] : undefined

  return (
    <section className="state-explorer detail-pane">
      <header className="doc-header">
        <h2 className="doc-title">
          <b>title:</b> app state
        </h2>
      </header>
      <div className="state-explorer-layout">
        <ul className="state-explorer-list" aria-label="app state documents">
          {inspectablePaneIds.map((id) => {
            const pane = workspacePanes[id]
            const isSelected = id === paneId
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedPaneId(id)}
                >
                  <span>{pane?.program.name ?? id}</span>
                  <small>{workspaceStateFileName(id)}</small>
                </button>
              </li>
            )
          })}
        </ul>
        <pre className="state-explorer-doc" aria-label="selected app state">
          {selectedDoc ? JSON.stringify(selectedDoc, null, 2) : '{}'}
        </pre>
      </div>
    </section>
  )
}
