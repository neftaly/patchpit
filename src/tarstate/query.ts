import type { Atom, FieldRef, QB, Predicate, Schema } from './types.js'
import { makeQB, getSpec, fieldsOf } from './internal.js'

type SafeSchemaShape = {
  [K: string]: { [F: string]: Atom } & {
    _rel?: never
    _field?: never
    _rels?: never
  }
}

export function defineSchema<S extends SafeSchemaShape>(shape: S): Schema<S> {
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
    })
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

export function all<T extends Record<string, Atom>, Rels extends string>(
  qb: QB<T, Rels>,
): QB<T, Rels> {
  return makeQB(fieldsOf(qb), getSpec(qb))
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
