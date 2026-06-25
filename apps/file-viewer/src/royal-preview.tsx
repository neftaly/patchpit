import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Rgba } from 'renderer'
import type {} from 'renderer/react'
import { createRoot as createRendererRoot } from './royal-offscreen-root.js'
import type { RendererRoot } from './royal-offscreen-root.js'

const GLTF_CLEAR_COLOR: Rgba = [0.02, 0.024, 0.03, 1]

export function RoyalGltfPreview({ name, src }: { name: string; src: string }) {
  return (
    <RoyalPreviewStage ariaLabel={`${name} glTF preview`}>
      <GltfPreviewScene src={src} />
    </RoyalPreviewStage>
  )
}

function RoyalPreviewStage({
  ariaLabel,
  children,
}: {
  ariaLabel: string
  children: ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [root, setRoot] = useState<RendererRoot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    let nextRoot: RendererRoot
    try {
      nextRoot = createRendererRoot(host)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      return undefined
    }

    setRoot(nextRoot)
    setError(null)

    return () => {
      nextRoot.unmount()
      setRoot(null)
    }
  }, [])

  useEffect(() => {
    if (!root) return

    try {
      root.render(children)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [children, root])

  return (
    <div className="royal-preview">
      <div
        ref={hostRef}
        className="royal-preview-host"
        aria-label={ariaLabel}
      />
      {error && (
        <p className="royal-preview-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function GltfPreviewScene({ src }: { src: string }) {
  return (
    <scene>
      <pass clearColor={GLTF_CLEAR_COLOR}>
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
  )
}
