import { useMemo } from 'react'
import { fromObject } from '@patchpit/tarstate/source'
import type { Atom, Query } from '@patchpit/tarstate/query'
import type { ObjectDoc } from '@patchpit/tarstate/source'
import { useQuery } from './query.js'
import type { QueryRows, QueryState } from './query.js'

export function useObjectQuery<
  Doc extends ObjectDoc,
  TQuery extends Query<Record<string, Atom>, string>,
>(doc: Doc, query: TQuery): QueryState<QueryRows<TQuery>> {
  const source = useMemo(() => fromObject(doc), [doc])
  return useQuery(source, query)
}
