import type { Atom, FieldRef, Predicate, QB } from './types.js'

const _spec = Symbol('_spec')

export interface QuerySpec {
  from: string
  predicates: Predicate<string>[]
  joins: JoinNode[]
  projection?: string[]
}

export interface JoinNode {
  spec: QuerySpec
  on: Predicate<string>
}

export function getSpec(qb: object): QuerySpec {
  return (qb as { readonly [_spec]: QuerySpec })[_spec]
}

export function makeQB<T extends Record<string, Atom>, Rels extends string>(
  fieldRefs: Record<string, FieldRef<Atom, string>>,
  spec: QuerySpec,
): QB<T, Rels> {
  const obj = { ...fieldRefs }
  Object.defineProperty(obj, _spec, {
    value: spec,
    enumerable: false,
    writable: false,
  })
  return obj as unknown as QB<T, Rels>
}

export function fieldsOf<T extends Record<string, Atom>, Rels extends string>(
  qb: QB<T, Rels>,
): Record<string, FieldRef<Atom, string>> {
  return Object.fromEntries(Object.entries(qb))
}
