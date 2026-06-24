import type {
  Atom,
  FieldRef,
  Predicate,
  Query,
  RelationRef,
} from './types.js'

const _spec = Symbol('_spec')
const _relation = Symbol('_relation')

export interface QuerySpec {
  from: string
  predicates: Predicate<string>[]
  joins: JoinNode[]
  projection?: ProjectionField[]
}

export interface ProjectionField {
  key: string
  field: FieldRef<Atom, string>
}

export interface JoinNode {
  spec: QuerySpec
  on: Predicate<string>
}

export interface RelationSpec {
  name: string
  key: string
}

export function getSpec(query: object): QuerySpec {
  return (query as { readonly [_spec]: QuerySpec })[_spec]
}

export function getRelationSpec(relation: object): RelationSpec {
  return (relation as { readonly [_relation]: RelationSpec })[_relation]
}

export function makeRelation<
  T extends Record<string, Atom>,
  Rel extends string,
  Key extends string,
>(
  relationName: Rel,
  key: Key,
  fieldRefs: Record<string, FieldRef<Atom, string>>,
): RelationRef<T, Rel, Key> {
  const obj = { ...fieldRefs }
  Object.defineProperty(obj, _relation, {
    value: { name: relationName, key },
    enumerable: false,
    writable: false,
  })
  return obj as unknown as RelationRef<T, Rel, Key>
}

export function makeQuery<T extends Record<string, Atom>, Rels extends string>(
  fieldRefs: Record<string, FieldRef<Atom, string>>,
  spec: QuerySpec,
): Query<T, Rels> {
  const obj = { ...fieldRefs }
  Object.defineProperty(obj, _spec, {
    value: spec,
    enumerable: false,
    writable: false,
  })
  return obj as unknown as Query<T, Rels>
}

export function fieldsOf<T extends Record<string, Atom>, Rels extends string>(
  value: Query<T, Rels> | RelationRef<T, Rels, string>,
): Record<string, FieldRef<Atom, string>> {
  return Object.fromEntries(Object.entries(value))
}
