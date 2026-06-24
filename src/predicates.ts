import type { Atom, FieldRef, Predicate, Constraint, UnionRels } from './types.js'

// ---------------------------------------------------------------------------
// Comparison constructors
//
// eq/ne accept either a value or another FieldRef on the rhs.
// The Rels phantom on the result is the union of both sides' relation names.
// ---------------------------------------------------------------------------

export declare function eq<T extends Atom, R1 extends string, R2 extends string>(
  lhs: FieldRef<T, R1>, rhs: FieldRef<T, R2>
): Predicate<R1 | R2>

export declare function eq<T extends Atom, R extends string>(
  lhs: FieldRef<T, R>, rhs: T
): Predicate<R>

export declare function ne<T extends Atom, R1 extends string, R2 extends string>(
  lhs: FieldRef<T, R1>, rhs: FieldRef<T, R2>
): Predicate<R1 | R2>

export declare function ne<T extends Atom, R extends string>(
  lhs: FieldRef<T, R>, rhs: T
): Predicate<R>

export declare function lt<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>, rhs: T
): Predicate<R>

export declare function gt<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>, rhs: T
): Predicate<R>

export declare function lte<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>, rhs: T
): Predicate<R>

export declare function gte<T extends string | number, R extends string>(
  lhs: FieldRef<T, R>, rhs: T
): Predicate<R>

// ---------------------------------------------------------------------------
// Logical combinators
//
// and/or take a variadic tuple and return the union of all Rels.
// not is transparent — same Rels as its operand.
// ---------------------------------------------------------------------------

export declare function and<Ps extends [Predicate<string>, ...Predicate<string>[]]>(
  ...ps: Ps
): Predicate<UnionRels<Ps>>

export declare function or<Ps extends [Predicate<string>, ...Predicate<string>[]]>(
  ...ps: Ps
): Predicate<UnionRels<Ps>>

export declare function not<R extends string>(p: Predicate<R>): Predicate<R>

// ---------------------------------------------------------------------------
// Constraint constructors
//
// Foreign keys reuse eq(fieldA, fieldB) — same concept, different context.
// ---------------------------------------------------------------------------

export declare function primaryKey (ref:  FieldRef<Atom, string>): Constraint
export declare function unique     (ref:  FieldRef<Atom, string>): Constraint
export declare function foreignKey (pred: Predicate<string>):      Constraint
