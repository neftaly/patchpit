import { useEffect, useMemo, useState } from 'react'
import { evaluateMany, fromObject } from '@patchpit/tarstate'
import type { Atom, ObjectDoc, Query, RelationSource } from '@patchpit/tarstate'

export type QueryMap = Record<string, Query<Record<string, Atom>, string>>
const queryIds = new WeakMap<object, number>()
let nextQueryId = 1

export type QueryRows<Q> =
  Q extends Query<infer Row, string> ? ReadonlyArray<Row> : never

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

    evaluateQueryMap(queries, source).then(
      (data) => {
        if (!alive) return
        setState({
          data,
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

export function useQuery<TQuery extends Query<Record<string, Atom>, string>>(
  source: RelationSource,
  query: TQuery,
): QueryState<QueryRows<TQuery>> {
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
  TQuery extends Query<Record<string, Atom>, string>,
>(doc: Doc, query: TQuery): QueryState<QueryRows<TQuery>> {
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

async function evaluateQueryMap<Queries extends QueryMap>(
  queries: Queries,
  source: RelationSource,
): Promise<QueryResults<Queries>> {
  const entries = Object.entries(queries)
  const rows = await evaluateMany(
    entries.map(([, query]) => query),
    source,
  )

  return Object.fromEntries(
    entries.map(([name], index) => [name, rows[index]]),
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
