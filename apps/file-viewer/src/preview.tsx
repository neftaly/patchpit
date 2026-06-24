import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RendererRoot } from 'renderer/react'
import type {} from 'renderer/react'
import { imageDataUrl } from '@patchpit/filesystem'
import type { FileDoc, FolderDoc, FolderEntry } from '@patchpit/filesystem'

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

export function ExternalUrlPreview({
  name,
  url,
}: {
  name: string
  url: string
}) {
  return (
    <>
      <h3>view</h3>
      {isGltfUrl(url) ? (
        <RoyalGltfPreview name={name} src={url} />
      ) : isImageUrl(url) ? (
        <p className="asset-preview">
          <img src={url} alt={name} />
        </p>
      ) : (
        <p className="file-preview">
          <a href={url}>{url}</a>
        </p>
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
