import { useEffect, useMemo, useState } from 'react'
import { evaluate } from './tarstate/evaluate.js'
import { fromObject } from './tarstate/source.js'
import type { ObjectDoc, RelationSource } from './tarstate/source.js'
import type { Atom, QB } from './tarstate/types.js'

export type QueryMap = Record<string, QB<Record<string, Atom>, string>>
const queryIds = new WeakMap<object, number>()
let nextQueryId = 1

export type QueryRows<Q> =
  Q extends QB<infer Row, string> ? ReadonlyArray<Row> : never

export type QueryResults<Queries extends QueryMap> = {
  readonly [Name in keyof Queries]: QueryRows<Queries[Name]>
}

export type QueryStatus = 'loading' | 'success' | 'error'

export type QueryState<Data> = {
  readonly data: Data
  readonly status: QueryStatus
  readonly error: unknown
  readonly isLoading: boolean
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

export function useQuery<Query extends QB<Record<string, Atom>, string>>(
  source: RelationSource,
  query: Query,
): QueryState<QueryRows<Query>> {
  const state = useQueries(source, { query })
  return {
    data: state.data.query,
    status: state.status,
    error: state.error,
    isLoading: state.isLoading,
  }
}

export function useObjectQuery<
  Doc extends ObjectDoc,
  Query extends QB<Record<string, Atom>, string>,
>(doc: Doc, query: Query): QueryState<QueryRows<Query>> {
  const source = useMemo(() => fromObject(doc), [doc])
  return useQuery(source, query)
}

function emptyResults<Queries extends QueryMap>(
  queries: Queries,
): QueryResults<Queries> {
  return Object.fromEntries(
    Object.keys(queries).map((name) => [name, []]),
  ) as unknown as QueryResults<Queries>
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
