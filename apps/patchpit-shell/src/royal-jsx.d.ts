import type { RendererIntrinsicElements } from 'renderer/react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends RendererIntrinsicElements {}
  }
}
