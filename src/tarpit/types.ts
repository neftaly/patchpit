export type Atom = string | number | boolean | null

declare const _fieldValue: unique symbol

export type FieldRef<T extends Atom, Rel extends string> = {
  readonly _rel: Rel
  readonly _field: string
  readonly [_fieldValue]?: T
}

export type Predicate<Rels extends string> = {
  readonly _rels: Rels
  readonly lhs: FieldRef<Atom, string>
  readonly rhs: FieldRef<Atom, string> | Atom
}

export type QB<T extends Record<string, Atom>, Rels extends string> = {
  readonly [K in keyof T]: FieldRef<T[K] & Atom, Rels>
}

export type SchemaShape = Record<string, Record<string, Atom>>

export type Schema<S extends SchemaShape> = {
  readonly [K in keyof S]: QB<S[K], K & string>
}
