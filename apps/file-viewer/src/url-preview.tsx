import { Suspense, lazy } from 'react'

const RoyalGltfPreview = lazy(() =>
  import('./royal-preview.js').then((module) => ({
    default: module.RoyalGltfPreview,
  })),
)

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
        <Suspense fallback={<p className="file-preview">loading model...</p>}>
          <RoyalGltfPreview name={name} src={url} />
        </Suspense>
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
