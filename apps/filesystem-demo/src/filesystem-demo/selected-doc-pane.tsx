import type { DocHandle } from '@automerge/automerge-repo'
import { JsonDocEditor, patchJsonRecord } from '@patchpit/json-doc-editor'
import type { JsonRecord } from '@patchpit/json-doc-editor'
import { useDocument } from '@patchpit/tarstate-automerge'
import { useSelectedDocHandle } from './hooks.js'
import {
  imageDataUrl,
  isFileDoc,
  isFolderDoc,
  validateFileDoc,
  validateFolderDoc,
} from './model.js'
import type { EntryType, FileDoc, FolderDoc } from './model.js'

export function SelectedDocPane() {
  const { handle, type } = useSelectedDocHandle()
  if (!handle) return null

  return <SelectedDocContent handle={handle} type={type} />
}

function SelectedDocContent({
  handle,
  type,
}: {
  handle: DocHandle<FolderDoc | FileDoc>
  type: EntryType
}) {
  const doc = useDocument(handle)

  if (type === 'folder' && isFolderDoc(doc)) {
    return (
      <section className="detail-pane">
        <h2 className="doc-title">
          <b>title:</b> {doc.name}
        </h2>
        <JsonDocEditor
          title="doc"
          url={handle.url}
          value={doc}
          onApply={(next) =>
            patchAutomergeDoc(handle as DocHandle<FolderDoc>, next)
          }
          validate={validateFolderDoc}
        />
      </section>
    )
  }

  if (type === 'file' && isFileDoc(doc)) {
    return (
      <section className="detail-pane">
        <h2 className="doc-title">
          <b>title:</b> {doc.name}
        </h2>
        <JsonDocEditor
          title="doc"
          url={handle.url}
          value={doc}
          onApply={(next) =>
            patchAutomergeDoc(handle as DocHandle<FileDoc>, next)
          }
          validate={validateFileDoc}
        />
        <FilePreview doc={doc} />
      </section>
    )
  }

  return (
    <section className="detail-pane">
      <h2>selected {type}</h2>
      <p>doc shape does not match the selected tree item</p>
    </section>
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

function FilePreview({ doc }: { doc: FileDoc }) {
  return (
    <>
      <h3>preview</h3>
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
