import type { DocHandle } from '@automerge/automerge-repo'
import type { ObjectDoc } from '@patchpit/tarstate'
import { useQueries } from '@patchpit/tarstate-react'
import type {
  QueryMap,
  QueryResults,
  QueryState,
} from '@patchpit/tarstate-react'
import { useAutomergeSource } from './source.js'
import type { AutomergeSourceOptions } from './source.js'

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

export type { AutomergeSourceOptions } from './source.js'
