export type Atom = string | number | boolean | null

declare const _fieldValue: unique symbol

export type FieldRef<T extends Atom, Rel extends string> = {
  readonly _rel: Rel
  readonly _field: string
  readonly [_fieldValue]?: T
}

export type BinaryOp = 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte'

export type Predicate<Rels extends string> =
  | {
      readonly _rels: Rels
      readonly op: BinaryOp
      readonly lhs: FieldRef<Atom, string>
      readonly rhs: FieldRef<Atom, string> | Atom
    }
  | {
      readonly _rels: Rels
      readonly op: 'and' | 'or'
      readonly operands: readonly Predicate<string>[]
    }
  | {
      readonly _rels: Rels
      readonly op: 'not'
      readonly operand: Predicate<string>
    }

declare const _qb: unique symbol

export type QB<T extends Record<string, Atom>, Rels extends string> = {
  readonly [_qb]: Rels
} & { readonly [K in keyof T]: FieldRef<T[K] & Atom, Rels> }

export type SchemaShape = Record<string, Record<string, Atom>>

export type Schema<S extends SchemaShape> = {
  readonly [K in keyof S]: QB<S[K], K & string>
}

export type Observer<T extends Record<string, Atom>> = (
  rows: ReadonlyArray<T>,
) => void

export type App<
  D extends Record<string, QB<any, any>>,
  F extends Record<string, (doc: any, input: any) => any> = Record<
    string,
    never
  >,
> = {
  readonly derived: D
  readonly feeders: F
  readonly observers: {
    readonly [K in keyof D]?: (rows: ReadonlyArray<any>) => void
  }
}

export type UnionRels<Ps extends readonly Predicate<string>[]> =
  Ps[number] extends Predicate<infer R> ? R : never
