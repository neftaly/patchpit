import { imageDataUrl } from '@patchpit/filesystem/model'
import type {
  FileDoc,
  FolderDoc,
  FolderEntry,
} from '@patchpit/filesystem/model'

export { ExternalUrlPreview } from './url-preview.js'

export function FolderPreview({ doc }: { doc: FolderDoc }) {
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

export function FilePreview({ doc }: { doc: FileDoc }) {
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
