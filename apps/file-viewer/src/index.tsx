import type { AutomergeUrl, DocHandle, Repo } from '@automerge/automerge-repo'
import {
  JsonDocEditor,
  isJsonRecord,
  patchJsonRecord,
} from '@patchpit/json-doc-editor'
import type { JsonRecord } from '@patchpit/json-doc-editor'
import { useDocument } from '@patchpit/tarstate-automerge/document'
import { useEffect, useState } from 'react'
import {
  isAutomergeEntryUrl,
  isFileDoc,
  isFolderDoc,
  validateFileDoc,
  validateFolderDoc,
} from '@patchpit/filesystem'
import type { FileDoc, FolderDoc } from '@patchpit/filesystem'
import { viewerModes } from '@patchpit/workspace'
import type { SelectedEntry, ViewerMode, WorkspacePaneId } from '@patchpit/workspace'
import { ExternalUrlPreview, FilePreview, FolderPreview } from './preview.js'

export type FileViewerProps = {
  paneId: WorkspacePaneId
  repo: Repo
  selected: SelectedEntry
  mode: ViewerMode
  onModeChange: (paneId: WorkspacePaneId, mode: ViewerMode) => void
}

export function FileViewer({
  mode,
  onModeChange,
  paneId,
  repo,
  selected,
}: FileViewerProps) {
  const handle = useResolvedHandle<JsonRecord>(
    repo,
    isAutomergeEntryUrl(selected.url) ? selected.url : null,
  )
  if (!isAutomergeEntryUrl(selected.url)) {
    return (
      <ExternalUrlPane
        mode={mode}
        selected={selected}
        onModeChange={(nextMode) => onModeChange(paneId, nextMode)}
      />
    )
  }
  if (!handle) return null

  return (
    <SelectedDocContent
      handle={handle}
      mode={mode}
      selected={selected}
      onModeChange={(nextMode) => onModeChange(paneId, nextMode)}
    />
  )
}

function SelectedDocContent({
  handle,
  mode,
  selected,
  onModeChange,
}: {
  handle: DocHandle<JsonRecord>
  mode: ViewerMode
  selected: SelectedEntry
  onModeChange: (mode: ViewerMode) => void
}) {
  const doc = useDocument(handle)

  if (selected.type === 'folder' && isFolderDoc(doc)) {
    return (
      <section className="detail-pane">
        <ViewerHeader
          mode={mode}
          title={doc.name}
          onModeChange={onModeChange}
        />
        {mode === 'source' ? (
          <JsonDocEditor
            title="doc"
            url={handle.url}
            value={doc}
            onApply={(next) =>
              patchAutomergeDoc(handle as DocHandle<FolderDoc>, next)
            }
            validate={validateFolderDoc}
          />
        ) : (
          <FolderPreview doc={doc} />
        )}
      </section>
    )
  }

  if (selected.type === 'file' && isFileDoc(doc)) {
    return (
      <section className="detail-pane">
        <ViewerHeader
          mode={mode}
          title={doc.name}
          onModeChange={onModeChange}
        />
        {mode === 'source' ? (
          <JsonDocEditor
            title="doc"
            url={handle.url}
            value={doc}
            onApply={(next) =>
              patchAutomergeDoc(handle as DocHandle<FileDoc>, next)
            }
            validate={validateFileDoc}
          />
        ) : (
          <FilePreview doc={doc} />
        )}
      </section>
    )
  }

  if (isJsonRecord(doc)) {
    return (
      <GenericAutomergeDocContent
        doc={doc}
        handle={handle}
        mode={mode}
        selected={selected}
        onModeChange={onModeChange}
      />
    )
  }

  return (
    <section className="detail-pane">
      <h2>selected {selected.type}</h2>
      <p>doc shape does not match the selected tree item</p>
    </section>
  )
}

function ViewerHeader({
  mode,
  title,
  onModeChange,
}: {
  mode: ViewerMode
  title: string
  onModeChange: (mode: ViewerMode) => void
}) {
  return (
    <header className="doc-header">
      <h2 className="doc-title">
        <b>title:</b> {title}
      </h2>
      <select
        className="viewer-mode-select"
        aria-label="file viewer mode"
        value={mode}
        onChange={(event) =>
          onModeChange(event.currentTarget.value as ViewerMode)
        }
      >
        {viewerModes.map((viewerMode) => (
          <option key={viewerMode} value={viewerMode}>
            {viewerMode}
          </option>
        ))}
      </select>
    </header>
  )
}

function patchAutomergeDoc<T extends JsonRecord>(
  handle: DocHandle<T>,
  next: JsonRecord,
) {
  handle.change((draft) => {
    patchJsonRecord(draft, next)
  })
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

function GenericAutomergeDocContent({
  doc,
  handle,
  mode,
  selected,
  onModeChange,
}: {
  doc: JsonRecord
  handle: DocHandle<JsonRecord>
  mode: ViewerMode
  selected: SelectedEntry
  onModeChange: (mode: ViewerMode) => void
}) {
  return (
    <section className="detail-pane">
      <ViewerHeader
        mode={mode}
        title={selected.name}
        onModeChange={onModeChange}
      />
      {mode === 'source' ? (
        <JsonDocEditor
          title="doc"
          url={handle.url}
          value={doc}
          onApply={(next) => patchAutomergeDoc(handle, next)}
        />
      ) : (
        <pre className="file-preview">{JSON.stringify(doc, null, 2)}</pre>
      )}
    </section>
  )
}

function ExternalUrlPane({
  mode,
  selected,
  onModeChange,
}: {
  mode: ViewerMode
  selected: SelectedEntry
  onModeChange: (mode: ViewerMode) => void
}) {
  return (
    <section className="detail-pane">
      <ViewerHeader
        mode={mode}
        title={selected.name}
        onModeChange={onModeChange}
      />
      {mode === 'source' ? (
        <pre className="file-preview">{selected.url}</pre>
      ) : (
        <ExternalUrlPreview name={selected.name} url={selected.url} />
      )}
    </section>
  )
}
