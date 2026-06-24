import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { useEffect, useState } from 'react'
import { fromObjects } from '@patchpit/tarstate'
import type { ObjectDoc, RelationSource } from '@patchpit/tarstate'
import type { QueryState } from '@patchpit/tarstate-react'
import { useDocument } from './document.js'
import { collectAutomergeSnapshot } from './snapshot.js'

type StringDocumentId = Extract<AnyDocumentId, string>

export type AutomergeSourceOptions = {
  readonly repo: Repo
  readonly linkField?: string
  readonly isLink?: (src: string) => src is StringDocumentId
}

export function useAutomergeSource<T extends ObjectDoc>(
  handle: DocHandle<T>,
  {
    repo,
    linkField = 'src',
    isLink = isValidAutomergeUrl,
  }: AutomergeSourceOptions,
): QueryState<RelationSource> {
  const root = useDocument(handle)
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<QueryState<RelationSource>>(() =>
    readySource([handle.doc()]),
  )

  useEffect(() => {
    let alive = true
    const unsubs: Array<() => void> = []
    setState((current) => ({ ...current, status: 'loading', isLoading: true }))

    collectAutomergeSnapshot(root, { repo, linkField, isLink }).then(
      ({ docs, handles }) => {
        if (!alive) return
        for (const linked of handles) {
          const notify = () => setVersion((current) => current + 1)
          linked.on('change', notify)
          linked.on('delete', notify)
          unsubs.push(() => {
            linked.off('change', notify)
            linked.off('delete', notify)
          })
        }
        setState(readySource(docs))
      },
      (error) => {
        if (!alive) return
        setState({
          data: fromObjects([root]),
          status: 'error',
          error,
          isLoading: false,
        })
      },
    )

    return () => {
      alive = false
      for (const unsub of unsubs) unsub()
    }
  }, [isLink, linkField, repo, root, version])

  return state
}

function readySource(
  docs: ReadonlyArray<ObjectDoc>,
): QueryState<RelationSource> {
  return {
    data: fromObjects(docs),
    status: 'success',
    error: null,
    isLoading: false,
  }
}
