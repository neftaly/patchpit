import type { QB }  from './types.js'
import type { Doc }  from './evaluate.js'
import { evaluate }  from './evaluate.js'

// ---------------------------------------------------------------------------
// Runtime — a live instance of an App bound to a mutable doc.
//
// query(name)           — synchronous read of the current derived rows.
// dispatch(name, input) — apply feeder → re-evaluate derived → fire observers.
//
// This is the infrastructure (accidental) layer. All mutation lives here;
// the essential model (schema, derived, constraints) remains pure data.
// ---------------------------------------------------------------------------

export type Runtime<
  D extends Record<string, QB<any, any>>,
  F extends Record<string, (doc: any, input: any) => any>,
> = {
  query<K extends keyof D>(
    name: K
  ): D[K] extends QB<infer T, any> ? ReadonlyArray<T> : never

  dispatch<K extends keyof F>(
    feeder: K,
    input:  Parameters<F[K]>[1],
  ): void
}

// ---------------------------------------------------------------------------
// createRuntime
//
// DocType is intentionally not constrained against F's doc parameter — the
// feeder doc type is up to the user (plain object, Automerge A.Doc, Immer
// draft, etc.). The only invariant enforced here is that F carries the right
// input types for dispatch().
// ---------------------------------------------------------------------------

export function createRuntime<
  D extends Record<string, QB<any, any>>,
  F extends Record<string, (doc: any, input: any) => any>,
>(
  app: {
    derived:    D
    feeders:    F
    observers?: { [K in keyof D]?: (rows: ReadonlyArray<any>) => void }
  },
  initialDoc: Doc,
): Runtime<D, F> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any = initialDoc
  let cache = evalAll(app.derived, doc)

  return {
    query(name) {
      return (cache[name as string] ?? []) as any
    },

    dispatch(feeder, input) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      doc   = (app.feeders[feeder] as (doc: any, input: any) => any)(doc, input)
      cache = evalAll(app.derived, doc)

      const obs = app.observers
      if (obs) {
        for (const key in obs) {
          const fn = obs[key as keyof typeof obs]
          fn?.(cache[key] ?? [])
        }
      }
    },
  }
}

function evalAll(
  derived: Record<string, QB<any, any>>,
  doc:     Doc,
): Record<string, ReadonlyArray<any>> {
  const out: Record<string, ReadonlyArray<any>> = {}
  for (const key in derived) {
    const qb = derived[key]
    if (qb) out[key] = evaluate(qb, doc)
  }
  return out
}
