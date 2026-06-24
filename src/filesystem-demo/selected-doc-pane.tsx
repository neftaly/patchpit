import type { DocHandle, Repo } from '@automerge/automerge-repo'
import { JsonDocEditor } from '../json-doc-editor.js'
import { useDocument } from '../tarstate/index.js'
import { useResolvedHandle } from './hooks.js'
import {
  imageDataUrl,
  isFileDoc,
  isFolderDoc,
  validateFileDoc,
  validateFolderDoc,
} from './model.js'
import type { EntryType, FileDoc, FolderDoc, SelectedDoc } from './model.js'

export function SelectedDocPane({
  repo,
  selected,
}: {
  repo: Repo
  selected: SelectedDoc
}) {
  const handle = useResolvedHandle<FolderDoc | FileDoc>(repo, selected.url)
  if (!handle) return null

  return <SelectedDocContent handle={handle} type={selected.type} />
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
          handle={handle as DocHandle<FolderDoc>}
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
          handle={handle as DocHandle<FileDoc>}
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
