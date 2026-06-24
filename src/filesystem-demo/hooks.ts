import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { useEffect, useState } from 'react'

export function useResolvedHandle<T>(
  repo: Repo,
  url: AnyDocumentId | null,
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
