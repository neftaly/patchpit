import type { Atom, FieldRef, Predicate } from './types.js'

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
  return { _rels: lhs._rel, lhs, rhs: r }
}
