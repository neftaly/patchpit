import type { Atom, FieldRef, QB } from './types.js'

// ---------------------------------------------------------------------------
// Runtime query spec — carried by every QB as a hidden property
// ---------------------------------------------------------------------------

export const _spec = Symbol('_spec')

export interface QuerySpec {
  from:       string
  predicates: PredNode[]
  joins:      JoinNode[]
  projection: string[] | null
}

export interface JoinNode {
  spec: QuerySpec
  on:   PredNode
}

export type PredNode =
  | { op: 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte'; lhs: FieldRefNode; rhs: FieldRefNode | Atom }
  | { op: 'and' | 'or'; operands: PredNode[] }
  | { op: 'not'; operand: PredNode }

export interface FieldRefNode {
  _rel:   string
  _field: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getSpec(qb: object): QuerySpec {
  return (qb as any)[_spec] as QuerySpec
}

// Attach the spec as a non-enumerable symbol property so it is invisible to
// spread, Object.keys(), serialization, and console output.
export function makeQB<T extends Record<string, Atom>, Rels extends string>(
  fieldRefs: Record<string, FieldRef<any, any>>,
  spec:      QuerySpec,
): QB<T, Rels> {
  const obj = { ...fieldRefs } as any
  Object.defineProperty(obj, _spec, { value: spec, enumerable: false, writable: false })
  return obj
}

export function fieldsOf(qb: QB<any, any>): Record<string, FieldRef<any, any>> {
  return Object.fromEntries(Object.entries(qb))
}

export function isFieldRefNode(x: unknown): x is FieldRefNode {
  return typeof x === 'object' && x !== null && '_rel' in x && '_field' in x
}
