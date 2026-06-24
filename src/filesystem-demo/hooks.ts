import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { useEffect, useState } from 'react'
import type { FileDoc, FolderDoc } from './model.js'
import { useFilesystemDemo } from './state.js'

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

export function useFilesystemHandle<T>(
  url: AnyDocumentId | null,
): DocHandle<T> | null {
  const { repo } = useFilesystemDemo()
  return useResolvedHandle<T>(repo, url)
}

export function useSelectedDocHandle(): {
  handle: DocHandle<FolderDoc | FileDoc> | null
  type: 'folder' | 'file'
} {
  const { selected } = useFilesystemDemo()
  return {
    handle: useFilesystemHandle<FolderDoc | FileDoc>(selected.url),
    type: selected.type,
  }
}
