import type { Atom, QB, Predicate, SchemaShape, Schema, App, Constraint } from './types.js'
import { _spec, makeQB, getSpec, fieldsOf } from './internal.js'

// ---------------------------------------------------------------------------
// defineSchema
// ---------------------------------------------------------------------------

type ReservedField = '_rel' | '_field' | '_rels'

type AssertNoReserved<T extends Record<string, Atom>> =
  keyof T & ReservedField extends never ? T : never

type SafeSchemaShape = {
  [K: string]: { [F: string]: Atom } & { _rel?: never; _field?: never; _rels?: never }
}

export function defineSchema<S extends SafeSchemaShape>(
  shape: { readonly [K in keyof S]: AssertNoReserved<S[K]> }
): Schema<S> {
  const schema: any = {}
  for (const relName in shape) {
    const fieldRefs: any = {}
    for (const fieldName in shape[relName]) {
      fieldRefs[fieldName] = { _rel: relName, _field: fieldName }
    }
    schema[relName] = makeQB(fieldRefs, { from: relName, predicates: [], joins: [], projection: null })
  }
  return schema
}

// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------

export function where<T extends Record<string, Atom>, Rels extends string>(
  qb:   QB<T, Rels>,
  pred: Predicate<NoInfer<Rels>>,
): QB<T, Rels> {
  const spec = getSpec(qb)
  return makeQB(fieldsOf(qb), { ...spec, predicates: [...spec.predicates, pred as any] })
}

export function join<
  T  extends Record<string, Atom>, Rels extends string,
  U  extends Record<string, Atom>, R2   extends string,
>(
  qb:    QB<T, Rels>,
  other: QB<U, R2>,
  on:    Predicate<NoInfer<Rels | R2>>,
): QB<Omit<T, keyof U> & U, Rels | R2> {
  const spec      = getSpec(qb)
  const otherSpec = getSpec(other)
  const merged    = { ...fieldsOf(qb), ...fieldsOf(other) }
  return makeQB(merged, { ...spec, joins: [...spec.joins, { spec: otherSpec, on: on as any }] })
}

export function select<T extends Record<string, Atom>, Rels extends string, K extends keyof T>(
  qb: QB<T, Rels>,
  ...keys: K[]
): QB<Pick<T, K>, Rels> {
  const spec = getSpec(qb)
  const picked: any = Object.fromEntries(keys.map(k => [k, (qb as any)[k as string]]))
  return makeQB(picked, { ...spec, projection: keys as string[] })
}

// ---------------------------------------------------------------------------
// pipe
// ---------------------------------------------------------------------------

export function pipe<A>(a: A): A
export function pipe<A, B>(a: A, f1: (a: A) => B): B
export function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
export function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
export function pipe<A, B, C, D, E>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): E
export function pipe<A, B, C, D, E, F>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F): F
export function pipe(a: any, ...fns: ((x: any) => any)[]): any {
  return fns.reduce((v, f) => f(v), a)
}

// ---------------------------------------------------------------------------
// defineApp
// ---------------------------------------------------------------------------

export function defineApp<
  S extends SchemaShape,
  D extends Record<string, QB<any, any>>,
>(spec: {
  schema:      Schema<S>
  derived:     D
  constraints: readonly Constraint[]
}): App<S, D> {
  return spec
}
