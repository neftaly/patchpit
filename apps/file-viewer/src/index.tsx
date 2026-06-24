import type { AutomergeUrl, DocHandle, Repo } from '@automerge/automerge-repo'
import {
  JsonDocEditor,
  isJsonRecord,
  patchJsonRecord,
} from '@patchpit/json-doc-editor'
import type { JsonRecord } from '@patchpit/json-doc-editor'
import { useDocument } from '@patchpit/tarstate-automerge'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RendererRoot } from 'renderer/react'
import type {} from 'renderer/react'
import {
  imageDataUrl,
  isAutomergeEntryUrl,
  isFileDoc,
  isFolderDoc,
  validateFileDoc,
  validateFolderDoc,
} from '@patchpit/filesystem'
import type { FileDoc, FolderDoc, FolderEntry } from '@patchpit/filesystem'
import { viewerModes } from '@patchpit/workspace'
import type { SelectedEntry, ViewerMode, WorkspacePaneId } from '@patchpit/workspace'

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

function FolderPreview({ doc }: { doc: FolderDoc }) {
  return (
    <>
      <h3>view</h3>
      <ul className="folder-preview">
        {doc.entries.map((entry) => (
          <li key={entry.url}>
            <div
              className="folder-preview-thumb"
              data-entry-kind={folderEntryKind(entry)}
              aria-hidden="true"
            >
              <span>{folderEntryGlyph(entry)}</span>
            </div>
            <span className="folder-preview-name">{entry.name}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function folderEntryKind(entry: FolderEntry): string {
  if (entry.type === 'folder') return 'folder'
  const extension = extensionFromName(entry.name)
  if (isImageExtension(extension)) return 'image'
  if (extension === 'glb' || extension === 'gltf') return 'model'
  if (extension === 'json') return 'json'
  return 'file'
}

function folderEntryGlyph(entry: FolderEntry): string {
  if (entry.type === 'folder') return '/'
  const extension = extensionFromName(entry.name)
  if (!extension) return '*'
  return extension.slice(0, 4).toUpperCase()
}

function extensionFromName(name: string): string {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index + 1).toLowerCase()
}

function isImageExtension(extension: string): boolean {
  return ['avif', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp'].includes(
    extension,
  )
}

function FilePreview({ doc }: { doc: FileDoc }) {
  return (
    <>
      <h3>view</h3>
      {doc.mimeType.startsWith('image/') ? (
        <p className="asset-preview">
          <img src={imageDataUrl(doc)} alt={doc.name} />
        </p>
      ) : (
        <pre className="file-preview">{doc.content}</pre>
      )}
    </>
  )
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
        <>
          <h3>view</h3>
          {isGltfUrl(selected.url) ? (
            <RoyalGltfPreview name={selected.name} src={selected.url} />
          ) : isImageUrl(selected.url) ? (
            <p className="asset-preview">
              <img src={selected.url} alt={selected.name} />
            </p>
          ) : (
            <p className="file-preview">
              <a href={selected.url}>{selected.url}</a>
            </p>
          )}
        </>
      )}
    </section>
  )
}

function RoyalGltfPreview({ name, src }: { name: string; src: string }) {
  return (
    <Royal ariaLabel={`${name} glTF preview`}>
      <scene>
        <pass clearColor={[0.02, 0.024, 0.03, 1]}>
          <perspectiveCamera
            makeDefault
            position={[0, 0.15, 4]}
            verticalFov={0.62}
          />
          <hemisphereLight
            skyColor={[0.7, 0.86, 1]}
            groundColor={[0.36, 0.28, 0.2]}
            intensity={2.1}
          />
          <directionalLight
            color={[1, 0.96, 0.84]}
            direction={[0.35, 0.75, 0.55]}
            intensity={1.4}
          />
          <gltf src={src} scale={[1.35, 1.35, 1.35]} />
        </pass>
      </scene>
    </Royal>
  )
}

function Royal({
  ariaLabel,
  children,
}: {
  ariaLabel: string
  children: ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let root: RendererRoot | null = null
    let disposed = false
    setError(null)

    void import('renderer/react').then(
      ({ createRoot, RendererProvider }) => {
        if (disposed) return

        root = createRoot(host, {
          preserveDrawingBuffer: true,
          rendererMode: 'inline',
        })
        root.render(
          <RendererProvider root={root}>{children}</RendererProvider>,
        )
      },
      (caught: unknown) => {
        if (!disposed) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      },
    )

    return () => {
      disposed = true
      root?.unmount()
    }
  }, [children])

  return (
    <div className="royal-preview">
      <div ref={hostRef} className="royal-preview-host" aria-label={ariaLabel} />
      {error && (
        <p className="royal-preview-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function isImageUrl(url: string): boolean {
  try {
    return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

function isGltfUrl(url: string): boolean {
  try {
    return /\.(gltf|glb)$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}
