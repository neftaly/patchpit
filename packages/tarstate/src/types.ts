export type Atom = string | number | boolean | null

declare const _fieldValue: unique symbol
declare const _relationValue: unique symbol
declare const _queryValue: unique symbol

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

export type RelationRef<
  T extends Record<string, Atom>,
  Rel extends string,
  Key extends string = 'id',
> = {
  readonly [K in Extract<keyof T, string>]: FieldRef<T[K] & Atom, Rel>
} & {
  readonly [_relationValue]?: {
    readonly name: Rel
    readonly key: Key
  }
}

export type Query<T extends Record<string, Atom>, Rels extends string> = {
  readonly [K in Extract<keyof T, string>]: FieldRef<T[K] & Atom, Rels>
} & {
  readonly [_queryValue]?: {
    readonly rels: Rels
  }
}

export type SchemaShape = Record<string, Record<string, Atom>>

export type RelationDefinition<
  T extends Record<string, Atom>,
  Key extends keyof T & string = Extract<keyof T, 'id'> & string,
> = {
  readonly _tag: 'relation'
  readonly key: Key
  readonly fields: T
}

export type SchemaInput = Record<
  string,
  Record<string, Atom> | RelationDefinition<Record<string, Atom>, string>
>

export type RelationFields<T> =
  T extends RelationDefinition<infer Fields, string> ? Fields
  : T extends Record<string, Atom> ? T
  : never

export type RelationKey<T> =
  T extends RelationDefinition<Record<string, Atom>, infer Key> ? Key
  : 'id'

export type Schema<S extends SchemaInput> = {
  readonly [K in keyof S]: RelationRef<
    RelationFields<S[K]>,
    K & string,
    RelationKey<S[K]>
  >
}
