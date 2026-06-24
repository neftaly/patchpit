import type { DocHandle } from '@automerge/automerge-repo'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

export function useDocument<T>(handle: DocHandle<T>): T {
  return useSyncExternalStore(
    (notify) => {
      handle.on('change', notify)
      handle.on('delete', notify)
      return () => {
        handle.off('change', notify)
        handle.off('delete', notify)
      }
    },
    () => handle.doc() as T,
    () => handle.doc() as T,
  )
}

export function useDocumentMap<T>(
  handles: Readonly<Record<string, DocHandle<T>>>,
): Readonly<Record<string, T>> {
  const entries = useMemo(() => Object.entries(handles), [handles])
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const notify = () => setVersion((current) => current + 1)
    for (const [, handle] of entries) {
      handle.on('change', notify)
      handle.on('delete', notify)
    }
    return () => {
      for (const [, handle] of entries) {
        handle.off('change', notify)
        handle.off('delete', notify)
      }
    }
  }, [entries])

  return useMemo(
    () =>
      Object.fromEntries(
        entries.map(([key, handle]) => [key, handle.doc() as T]),
      ),
    [entries, version],
  )
}
