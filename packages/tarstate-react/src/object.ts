import { useMemo } from 'react'
import { fromObject } from '@patchpit/tarstate'
import type { Atom, ObjectDoc, Query } from '@patchpit/tarstate'
import { useQuery } from './query.js'
import type { QueryRows, QueryState } from './query.js'

export function useObjectQuery<
  Doc extends ObjectDoc,
  TQuery extends Query<Record<string, Atom>, string>,
>(doc: Doc, query: TQuery): QueryState<QueryRows<TQuery>> {
  const source = useMemo(() => fromObject(doc), [doc])
  return useQuery(source, query)
}
