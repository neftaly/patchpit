import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { fromObjects } from '@patchpit/tarstate'
import type { ObjectDoc, RelationSource } from '@patchpit/tarstate'
import { useQueries } from '@patchpit/tarstate-react'
import type {
  QueryMap,
  QueryResults,
  QueryState,
} from '@patchpit/tarstate-react'
import { collectAutomergeSnapshot } from './snapshot.js'

type StringDocumentId = Extract<AnyDocumentId, string>

export type AutomergeSourceOptions = {
  readonly repo: Repo
  readonly linkField?: string
  readonly isLink?: (src: string) => src is StringDocumentId
}

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

export function useAutomergeQueries<
  T extends ObjectDoc,
  Queries extends QueryMap,
>(
  handle: DocHandle<T>,
  queries: Queries,
  options: AutomergeSourceOptions,
): QueryState<QueryResults<Queries>> {
  const source = useAutomergeSource(handle, options)
  const query = useQueries(source.data, queries)

  if (source.status === 'error') {
    return {
      data: query.data,
      status: 'error',
      error: source.error,
      isLoading: false,
    }
  }

  if (source.isLoading) {
    return {
      data: query.data,
      status: query.status === 'error' ? 'error' : 'loading',
      error: query.error,
      isLoading: true,
    }
  }

  return query
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
