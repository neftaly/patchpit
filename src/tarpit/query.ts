import type {
  Atom,
  FieldRef,
  QB,
  Predicate,
  SchemaShape,
  Schema,
  App,
  Constraint,
  Observer,
} from './types.js'
import { makeQB, getSpec, fieldsOf } from './internal.js'

type ReservedField = '_rel' | '_field' | '_rels'

type AssertNoReserved<T extends Record<string, Atom>> = keyof T &
  ReservedField extends never
  ? T
  : never

type SafeSchemaShape = {
  [K: string]: { [F: string]: Atom } & {
    _rel?: never
    _field?: never
    _rels?: never
  }
}

export function defineSchema<S extends SafeSchemaShape>(shape: {
  readonly [K in keyof S]: AssertNoReserved<S[K]>
}): Schema<S> {
  const schema: Partial<Schema<S>> = {}
  for (const relName in shape) {
    const fieldRefs: Record<string, FieldRef<Atom, string>> = {}
    const relation = shape[relName]
    for (const fieldName in relation) {
      fieldRefs[fieldName] = { _rel: relName, _field: fieldName }
    }
    schema[relName] = makeQB(fieldRefs, {
      from: relName,
      predicates: [],
      joins: [],
      projection: null,
    }) as Schema<S>[typeof relName]
  }
  return schema as Schema<S>
}

export function where<T extends Record<string, Atom>, Rels extends string>(
  qb: QB<T, Rels>,
  pred: Predicate<NoInfer<Rels>>,
): QB<T, Rels> {
  const spec = getSpec(qb)
  return makeQB(fieldsOf(qb), {
    ...spec,
    predicates: [...spec.predicates, pred],
  })
}

export function join<
  T extends Record<string, Atom>,
  Rels extends string,
  U extends Record<string, Atom>,
  R2 extends string,
>(
  qb: QB<T, Rels>,
  other: QB<U, R2>,
  on: Predicate<NoInfer<Rels | R2>>,
): QB<Omit<T, keyof U> & U, Rels | R2> {
  const spec = getSpec(qb)
  const otherSpec = getSpec(other)
  const merged = { ...fieldsOf(qb), ...fieldsOf(other) }
  return makeQB(merged, {
    ...spec,
    joins: [...spec.joins, { spec: otherSpec, on }],
  })
}

export function select<
  T extends Record<string, Atom>,
  Rels extends string,
  K extends keyof T,
>(qb: QB<T, Rels>, ...keys: K[]): QB<Pick<T, K>, Rels> {
  const spec = getSpec(qb)
  const picked: Record<string, FieldRef<Atom, string>> = {}
  for (const key of keys) {
    picked[key as string] = qb[key]
  }
  return makeQB(picked, { ...spec, projection: keys as string[] })
}

export function defineApp<
  S extends SchemaShape,
  D extends Record<string, QB<any, any>>,
  F extends Record<string, (doc: any, input: any) => any> = Record<
    string,
    never
  >,
>(spec: {
  schema: Schema<S>
  derived: D
  constraints: readonly Constraint[]
  feeders?: F
  observers?: {
    [K in keyof D]?: Observer<D[K] extends QB<infer T, any> ? T : never>
  }
}): App<S, D, F> {
  return {
    schema: spec.schema,
    derived: spec.derived,
    constraints: spec.constraints,
    feeders: (spec.feeders ?? {}) as F,
    observers: spec.observers ?? {},
  }
}
