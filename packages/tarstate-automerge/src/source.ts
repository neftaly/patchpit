import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { useEffect, useState } from 'react'
import { fromObjects } from '@patchpit/tarstate/source'
import type { ObjectDoc, RelationSource } from '@patchpit/tarstate/source'
import type { QueryState } from '@patchpit/tarstate-react'
import { useDocument } from './document.js'
import { collectAutomergeSnapshot } from './snapshot.js'
import type { AutomergeSnapshotSubscription } from './snapshot.js'

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
    let subscription: AutomergeSnapshotSubscription | null = null
    const refreshVersion = () => setVersion((current) => current + 1)

    setState((current) => ({ ...current, status: 'loading', isLoading: true }))

    collectAutomergeSnapshot(root, { repo, linkField, isLink }).then(
      (snapshot) => {
        if (!alive) return
        subscription = snapshot.subscribe(refreshVersion)
        setState(readySource(snapshot.docs))
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
      subscription?.unsubscribe()
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
