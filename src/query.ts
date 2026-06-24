import type { Atom, QB, Predicate, SchemaShape, Schema, App, Constraint } from './types.js'

// ---------------------------------------------------------------------------
// defineSchema — produces a typed Schema: one QB per relation.
//
// Each QB's field refs carry the relation name as the Rels phantom param.
// Reserved field names ('_rel', '_field') are rejected at definition time.
// ---------------------------------------------------------------------------

type ReservedField = '_rel' | '_field' | '_rels'

type AssertNoReserved<T extends Record<string, Atom>> =
  keyof T & ReservedField extends never
    ? T
    : never

type SafeSchemaShape = {
  [K: string]: { [F: string]: Atom } & { _rel?: never; _field?: never }
}

export declare function defineSchema<S extends SafeSchemaShape>(
  shape: { readonly [K in keyof S]: AssertNoReserved<S[K]> }
): Schema<S>

// ---------------------------------------------------------------------------
// Query operations — data-first (QB is the first argument)
//
// This lets TypeScript check Rule 1 directly at the call site: when `where` is
// called with (qb, pred), TypeScript infers Rels from qb and immediately
// checks that pred's Rels match. Curried forms can't do this because the QB's
// Rels aren't known until the returned function is applied — TypeScript's
// generic function assignability is too permissive to catch the mismatch then.
//
// where: QB<T, Rels> × Predicate<Rels> → QB<T, Rels>
//   Rule 1: pred refs ⊆ QB's own Rels (enforced at call site)
//
// join:  QB<T, Rels> × QB<U, R2> × Predicate<string> → QB<T & U, Rels | R2>
//   Rule 2: on refs ⊆ Rels | R2 — runtime assertion only
//   Note:   on must reference both sides — runtime assertion only
//
// select: QB<T, Rels> × ...K[] → QB<Pick<T,K>, Rels>
//
// For pipe composition, wrap in a lambda: qb => where(qb, pred)
// ---------------------------------------------------------------------------

// NoInfer<Rels> on pred prevents TypeScript from widening Rels to a union that
// satisfies both the QB and the predicate. Without it, passing Predicate<'users'>
// to a QB<T, 'tasks'> would silently widen Rels to 'tasks' | 'users'.
export declare function where<T extends Record<string, Atom>, Rels extends string>(
  qb:   QB<T, Rels>,
  pred: Predicate<NoInfer<Rels>>
): QB<T, Rels>

export declare function join<
  T  extends Record<string, Atom>, Rels extends string,
  U  extends Record<string, Atom>, R2   extends string,
>(
  qb:    QB<T, Rels>,
  other: QB<U, R2>,
  on:    Predicate<NoInfer<Rels | R2>>
): QB<Omit<T, keyof U> & U, Rels | R2>

export declare function select<T extends Record<string, Atom>, Rels extends string, K extends keyof T>(
  qb: QB<T, Rels>,
  ...keys: K[]
): QB<Pick<T, K>, Rels>

// ---------------------------------------------------------------------------
// pipe — applies transforms left to right
//
// Overloads rather than variadic: PipeFns threads types through tuple stages
// but TypeScript can't backpropagate types to lambda params from a recursive
// conditional type, so `qb => where(qb, ...)` lambdas get implicit `any`.
// Overloads avoid this — each stage's input type is directly available.
// ---------------------------------------------------------------------------

export declare function pipe<A>(a: A): A
export declare function pipe<A, B>(a: A, f1: (a: A) => B): B
export declare function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
export declare function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
export declare function pipe<A, B, C, D, E>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): E
export declare function pipe<A, B, C, D, E, F>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F): F

// ---------------------------------------------------------------------------
// defineApp — assembles schema + derived queries + constraints into a spec.
// No runtime behaviour — pure description of the essential model.
// ---------------------------------------------------------------------------

export declare function defineApp<
  S extends SchemaShape,
  D extends Record<string, QB<any, any>>,
>(spec: {
  schema:      Schema<S>
  derived:     D
  constraints: readonly Constraint[]
}): App<S, D>
