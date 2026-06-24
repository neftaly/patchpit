import { isValidAutomergeUrl } from '@automerge/automerge-repo'
import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { evaluate } from './evaluate.js'
import { fromObjects, linkValues } from './source.js'
import type { ObjectDoc, RelationSource } from './source.js'
import type { Atom, QB } from './types.js'

type QueryMap = Record<string, QB<Record<string, Atom>, string>>
type StringDocumentId = Extract<AnyDocumentId, string>
const queryIds = new WeakMap<object, number>()
let nextQueryId = 1

type QueryRows<Q> = Q extends QB<infer Row, string> ? ReadonlyArray<Row> : never

type QueryResults<Queries extends QueryMap> = {
  readonly [Name in keyof Queries]: QueryRows<Queries[Name]>
}

export type QueryStatus = 'loading' | 'success' | 'error'

export type QueryState<Data> = {
  readonly data: Data
  readonly status: QueryStatus
  readonly error: unknown
  readonly isLoading: boolean
}

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

export function useQueries<Queries extends QueryMap>(
  source: RelationSource,
  queries: Queries,
): QueryState<QueryResults<Queries>> {
  const signature = querySignature(queries)
  const empty = useMemo(() => emptyResults(queries), [signature])
  const [state, setState] = useState<QueryState<QueryResults<Queries>>>(() => ({
    data: empty,
    status: 'loading',
    error: null,
    isLoading: true,
  }))

  useEffect(() => {
    let alive = true
    setState((current) => ({ ...current, status: 'loading', isLoading: true }))

    Promise.all(
      Object.entries(queries).map(async ([name, query]) => {
        return [name, await evaluate(query, source)] as const
      }),
    ).then(
      (entries) => {
        if (!alive) return
        setState({
          data: Object.fromEntries(entries) as QueryResults<Queries>,
          status: 'success',
          error: null,
          isLoading: false,
        })
      },
      (error) => {
        if (!alive) return
        setState({
          data: empty,
          status: 'error',
          error,
          isLoading: false,
        })
      },
    )

    return () => {
      alive = false
    }
  }, [empty, signature, source])

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

function emptyResults<Queries extends QueryMap>(
  queries: Queries,
): QueryResults<Queries> {
  return Object.fromEntries(
    Object.keys(queries).map((name) => [name, []]),
  ) as unknown as QueryResults<Queries>
}

async function collectAutomergeSnapshot(
  root: ObjectDoc,
  { repo, linkField, isLink }: Required<AutomergeSourceOptions>,
): Promise<{
  readonly docs: ReadonlyArray<ObjectDoc>
  readonly handles: ReadonlyArray<DocHandle<ObjectDoc>>
}> {
  const seenDocs = new Set<ObjectDoc>()
  const seenLinks = new Set<string>()
  const pending = [root]
  const docs: ObjectDoc[] = []
  const handles: DocHandle<ObjectDoc>[] = []

  for (let index = 0; index < pending.length; index += 1) {
    const doc = pending[index]
    if (!doc || seenDocs.has(doc)) continue

    seenDocs.add(doc)
    docs.push(doc)

    for (const src of linkValues(doc[linkField])) {
      if (!isLink(src) || seenLinks.has(src)) continue

      seenLinks.add(src)
      const handle = await repo.find<ObjectDoc>(src)
      handles.push(handle)
      pending.push(handle.doc())
    }
  }

  return { docs, handles }
}

function querySignature(queries: QueryMap): string {
  return Object.entries(queries)
    .map(([name, query]) => `${name}:${queryId(query)}`)
    .join('|')
}

function queryId(query: object): number {
  const existing = queryIds.get(query)
  if (existing) return existing

  const id = nextQueryId
  nextQueryId += 1
  queryIds.set(query, id)
  return id
}
