import type { Atom, FieldRef, Predicate, Constraint, UnionRels } from './types.js'
import { isFieldRefNode } from './internal.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ref(f: FieldRef<any, any>) {
  return { _rel: f._rel, _field: f._field }
}

function rhs(v: FieldRef<any, any> | Atom) {
  return isFieldRefNode(v) ? ref(v as any) : v
}

// ---------------------------------------------------------------------------
// Comparison constructors
// ---------------------------------------------------------------------------

export function eq<T extends Atom, R1 extends string, R2 extends string>(lhs: FieldRef<T, R1>, r: FieldRef<T, R2>): Predicate<R1 | R2>
export function eq<T extends Atom, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>
export function eq(lhs: FieldRef<any, any>, r: any): Predicate<any> {
  return { _rels: lhs._rel, op: 'eq', lhs: ref(lhs), rhs: rhs(r) } as any
}

export function ne<T extends Atom, R1 extends string, R2 extends string>(lhs: FieldRef<T, R1>, r: FieldRef<T, R2>): Predicate<R1 | R2>
export function ne<T extends Atom, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R>
export function ne(lhs: FieldRef<any, any>, r: any): Predicate<any> {
  return { _rels: lhs._rel, op: 'ne', lhs: ref(lhs), rhs: rhs(r) } as any
}

export function lt<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R> {
  return { _rels: lhs._rel, op: 'lt', lhs: ref(lhs), rhs: r } as any
}

export function gt<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R> {
  return { _rels: lhs._rel, op: 'gt', lhs: ref(lhs), rhs: r } as any
}

export function lte<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R> {
  return { _rels: lhs._rel, op: 'lte', lhs: ref(lhs), rhs: r } as any
}

export function gte<T extends string | number, R extends string>(lhs: FieldRef<T, R>, r: T): Predicate<R> {
  return { _rels: lhs._rel, op: 'gte', lhs: ref(lhs), rhs: r } as any
}

// ---------------------------------------------------------------------------
// Logical combinators
// ---------------------------------------------------------------------------

export function and<Ps extends [Predicate<string>, ...Predicate<string>[]]>(...ps: Ps): Predicate<UnionRels<Ps>> {
  return { _rels: ps[0]._rels, op: 'and', operands: ps } as any
}

export function or<Ps extends [Predicate<string>, ...Predicate<string>[]]>(...ps: Ps): Predicate<UnionRels<Ps>> {
  return { _rels: ps[0]._rels, op: 'or', operands: ps } as any
}

export function not<R extends string>(p: Predicate<R>): Predicate<R> {
  return { _rels: p._rels, op: 'not', operand: p } as any
}

// ---------------------------------------------------------------------------
// Constraint constructors
// ---------------------------------------------------------------------------

export function primaryKey(ref: FieldRef<Atom, string>): Constraint {
  return { kind: 'primaryKey', ref }
}

export function unique(ref: FieldRef<Atom, string>): Constraint {
  return { kind: 'unique', ref }
}

export function foreignKey(pred: Predicate<string>): Constraint {
  return { kind: 'foreignKey', pred }
}
