import type { QB } from './types.js'
import type { Doc } from './evaluate.js'
import { evaluate } from './evaluate.js'

type RowsByDerived<D extends Record<string, QB<any, any>>> = {
  [K in keyof D]: D[K] extends QB<infer T, any> ? ReadonlyArray<T> : never
}

export type Runtime<
  D extends Record<string, QB<any, any>>,
  F extends Record<string, (doc: any, input: any) => any>,
> = {
  query<K extends keyof D>(name: K): RowsByDerived<D>[K]

  dispatch<K extends keyof F>(feeder: K, input: Parameters<F[K]>[1]): void
}

export function createRuntime<
  D extends Record<string, QB<any, any>>,
  F extends Record<string, (doc: any, input: any) => any>,
>(
  app: {
    derived: D
    feeders: F
    observers?: { [K in keyof D]?: (rows: RowsByDerived<D>[K]) => void }
  },
  initialDoc: Doc,
): Runtime<D, F> {
  let doc: any = initialDoc
  let cache = evalAll(app.derived, doc)

  return {
    query(name) {
      return cache[name]
    },

    dispatch(feeder, input) {
      doc = (app.feeders[feeder] as (doc: any, input: any) => any)(doc, input)
      cache = evalAll(app.derived, doc)

      for (const key in app.observers) {
        const fn = app.observers[key]
        fn?.(cache[key])
      }
    },
  }
}

function evalAll<D extends Record<string, QB<any, any>>>(
  derived: D,
  doc: Doc,
): RowsByDerived<D> {
  const out = {} as RowsByDerived<D>
  for (const key in derived) {
    const qb = derived[key]
    if (qb)
      out[key] = evaluate(qb, doc) as unknown as RowsByDerived<D>[typeof key]
  }
  return out
}
