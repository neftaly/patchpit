// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Atom = string | number | boolean | null

// ---------------------------------------------------------------------------
// FieldRef — pure data: a typed pointer to a named field in a named relation
// ---------------------------------------------------------------------------

export type FieldRef<T extends Atom, Rel extends string> = {
  readonly _rel:   Rel
  readonly _field: string
}

// ---------------------------------------------------------------------------
// Predicate — pure data: an expression AST over field refs
//
// `_rels` is a REQUIRED property (not phantom/optional) so TypeScript can
// check assignability between Predicate<'users'> and Predicate<'tasks'>.
// An optional phantom would let TypeScript treat absence as compatibility;
// a required property forces the literal-type mismatch to surface.
//
// Rule 1 ('tasks' pred must not appear in 'users' QB) is enforced via
// NoInfer<Rels> on the pred parameter of `where` — see query.ts.
// ---------------------------------------------------------------------------

export type Predicate<Rels extends string> = {
  readonly _rels: Rels
  readonly op:    BinaryOp | LogicalOp
}

export type BinaryOp  = 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte'
export type LogicalOp = 'and' | 'or' | 'not'

// ---------------------------------------------------------------------------
// QB — pure data: a record of FieldRefs, one per schema field
//
// The unexported symbol `_qb` acts as a non-forgeable brand.
// Because `_qb` is not exported, callers cannot construct QB objects directly —
// they must go through defineSchema. This is what enforces Rule 1: when `where`
// returns a function expecting QB<T, 'users'>, passing QB<T, 'tasks'> fails
// because [_qb]: 'tasks' is not assignable to [_qb]: 'users'.
// ---------------------------------------------------------------------------

declare const _qb: unique symbol

export type QB<T extends Record<string, Atom>, Rels extends string> =
  { readonly [_qb]: Rels } &
  { readonly [K in keyof T]: FieldRef<T[K] & Atom, Rels> }

// ---------------------------------------------------------------------------
// Constraint — structural invariant declared over FieldRefs
// ---------------------------------------------------------------------------

export type Constraint =
  | { readonly kind: 'primaryKey'; readonly ref: FieldRef<Atom, string> }
  | { readonly kind: 'unique';     readonly ref: FieldRef<Atom, string> }
  | { readonly kind: 'foreignKey'; readonly pred: Predicate<string> }

// ---------------------------------------------------------------------------
// Schema — the result of defineSchema: a QB per relation name
// ---------------------------------------------------------------------------

export type SchemaShape = Record<string, Record<string, Atom>>

export type Schema<S extends SchemaShape> = {
  readonly [K in keyof S]: QB<S[K], K & string>
}

// ---------------------------------------------------------------------------
// App — the assembled spec: schema + derived queries + constraints
// ---------------------------------------------------------------------------

export type App<S extends SchemaShape, D extends Record<string, QB<any, any>>> = {
  readonly schema:      Schema<S>
  readonly derived:     D
  readonly constraints: readonly Constraint[]
}

// ---------------------------------------------------------------------------
// Helper: extract the union of Rels from a tuple of Predicates
// ---------------------------------------------------------------------------

export type UnionRels<Ps extends Predicate<string>[]> =
  Ps[number] extends Predicate<infer R> ? R : never
