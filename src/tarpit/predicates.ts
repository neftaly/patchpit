import type { Atom, BinaryOp, FieldRef, Predicate, UnionRels } from './types.js'

function binary<Rels extends string>(
  op: BinaryOp,
  lhs: FieldRef<Atom, string>,
  r: FieldRef<Atom, string> | Atom,
  rels: Rels,
): Predicate<Rels> {
  return { _rels: rels, op, lhs, rhs: r }
}

export function eq<T extends Atom, R1 extends string, R2 extends string>(
  lhs: FieldRef<T, R1>,
  r: FieldRef<T, R2>,
): Predicate<R1 | R2>
export function eq<T extends Atom, R extends string>(
  lhs: FieldRef<T, R>,
  r: T,
): Predicate<R>
export function eq(
  lhs: FieldRef<Atom, string>,
  r: FieldRef<Atom, string> | Atom,
): Predicate<string> {
  return binary('eq', lhs, r, lhs._rel)
}

export function ne<T extends Atom, R1 extends string, R2 extends string>(
  lhs: FieldRef<T, R1>,
  r: FieldRef<T, R2>,
): Predicate<R1 | R2>
export function ne<T extends Atom, R extends string>(
  lhs: FieldRef<T, R>,
  r: T,
): Predicate<R>
export function ne(
  lhs: FieldRef<Atom, string>,
  r: FieldRef<Atom, string> | Atom,
): Predicate<string> {
  return binary('ne', lhs, r, lhs._rel)
}

export function lt<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>,
  r: T,
): Predicate<R> {
  return binary('lt', lhs, r, lhs._rel)
}

export function gt<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>,
  r: T,
): Predicate<R> {
  return binary('gt', lhs, r, lhs._rel)
}

export function lte<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>,
  r: T,
): Predicate<R> {
  return binary('lte', lhs, r, lhs._rel)
}

export function gte<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>,
  r: T,
): Predicate<R> {
  return binary('gte', lhs, r, lhs._rel)
}

export function and<Ps extends [Predicate<string>, ...Predicate<string>[]]>(
  ...ps: Ps
): Predicate<UnionRels<Ps>> {
  return { _rels: ps[0]._rels as UnionRels<Ps>, op: 'and', operands: ps }
}

export function or<Ps extends [Predicate<string>, ...Predicate<string>[]]>(
  ...ps: Ps
): Predicate<UnionRels<Ps>> {
  return { _rels: ps[0]._rels as UnionRels<Ps>, op: 'or', operands: ps }
}

export function not<R extends string>(p: Predicate<R>): Predicate<R> {
  return { _rels: p._rels, op: 'not', operand: p }
}
