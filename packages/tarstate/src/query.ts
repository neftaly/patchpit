import type {
  Atom,
  FieldRef,
  Predicate,
  Query,
  RelationDefinition,
  RelationRef,
  Schema,
  SchemaInput,
} from './types.js'
import {
  fieldsOf,
  getRelationSpec,
  getSpec,
  makeQuery,
  makeRelation,
} from './internal.js'

type SafeSchemaShape = {
  [K: string]:
    | ({ [F: string]: Atom } & {
        _rel?: never
        _field?: never
        _rels?: never
      })
    | RelationDefinition<Record<string, Atom>, string>
}

export function defineSchema<S extends SafeSchemaShape & SchemaInput>(
  shape: S,
): Schema<S> {
  const schema: Partial<Schema<S>> = {}
  for (const relName in shape) {
    const fieldRefs: Record<string, FieldRef<Atom, string>> = {}
    const definition = shape[relName]
    if (!definition) continue
    const relation = isRelationDefinition(definition)
      ? definition.fields
      : definition
    for (const fieldName in relation) {
      fieldRefs[fieldName] = { _rel: relName, _field: fieldName }
    }
    schema[relName] = makeRelation(
      relName,
      isRelationDefinition(definition) ? definition.key : 'id',
      fieldRefs,
    ) as unknown as Schema<S>[typeof relName]
  }
  return schema as Schema<S>
}

export function relation<
  T extends Record<string, Atom>,
  Key extends keyof T & string = Extract<keyof T, 'id'> & string,
>(config: {
  key: Key
  fields: T
}): RelationDefinition<T, Key> {
  return {
    _tag: 'relation',
    key: config.key,
    fields: config.fields,
  }
}

export function string(): string {
  return ''
}

export function number(): number {
  return 0
}

export function boolean(): boolean {
  return false
}

export function nullable(): null {
  return null
}

export function from<
  T extends Record<string, Atom>,
  Rel extends string,
  Key extends string,
>(relation: RelationRef<T, Rel, Key>): Query<T, Rel> {
  const spec = getRelationSpec(relation)
  return makeQuery(fieldsOf(relation), {
    from: spec.name,
    predicates: [],
    joins: [],
  })
}

export function relationName(
  relation: RelationRef<Record<string, Atom>, string>,
): string {
  return getRelationSpec(relation).name
}

export function relationKey(
  relation: RelationRef<Record<string, Atom>, string>,
): string {
  return getRelationSpec(relation).key
}

export function where<T extends Record<string, Atom>, Rels extends string>(
  query: Query<T, Rels>,
  pred: Predicate<NoInfer<Rels>>,
): Query<T, Rels> {
  const spec = getSpec(query)
  return makeQuery(fieldsOf(query), {
    ...spec,
    predicates: [...spec.predicates, pred],
  })
}

export function all<T extends Record<string, Atom>, Rels extends string>(
  query: Query<T, Rels>,
): Query<T, Rels> {
  return makeQuery(fieldsOf(query), getSpec(query))
}

export function join<
  T extends Record<string, Atom>,
  Rels extends string,
  U extends Record<string, Atom>,
  R2 extends string,
>(
  query: Query<T, Rels>,
  otherQuery: Query<U, R2>,
  on: Predicate<NoInfer<Rels | R2>>,
): Query<Omit<T, keyof U> & U, Rels | R2> {
  const spec = getSpec(query)
  const otherSpec = getSpec(otherQuery)
  const merged = { ...fieldsOf(query), ...fieldsOf(otherQuery) }
  return makeQuery(merged, {
    ...spec,
    joins: [...spec.joins, { spec: otherSpec, on }],
  })
}

export function select<
  T extends Record<string, Atom>,
  Rels extends string,
  K extends Extract<keyof T, string>,
>(query: Query<T, Rels>, ...keys: K[]): Query<Pick<T, K>, Rels> {
  const spec = getSpec(query)
  const picked: Record<string, FieldRef<Atom, string>> = {}
  for (const key of keys) {
    picked[key as string] = query[key]
  }
  return makeQuery(picked, {
    ...spec,
    projection: keys.map((key) => ({
      key: key as string,
      field: query[key],
    })),
  })
}

export function project<
  T extends Record<string, Atom>,
  Rels extends string,
  Shape extends Record<string, FieldRef<Atom, Rels>>,
>(
  query: Query<T, Rels>,
  shape: Shape,
): Query<ProjectedFields<Shape>, Rels> {
  const spec = getSpec(query)
  return makeQuery(shape, {
    ...spec,
    projection: Object.entries(shape).map(([key, field]) => ({ key, field })),
  })
}

function isRelationDefinition(
  value: Record<string, Atom> | RelationDefinition<Record<string, Atom>, string>,
): value is RelationDefinition<Record<string, Atom>, string> {
  return '_tag' in value && value._tag === 'relation'
}

type ProjectedFields<Shape extends Record<string, FieldRef<Atom, string>>> = {
  readonly [K in keyof Shape]: Shape[K] extends FieldRef<infer Value, string>
    ? Value
    : never
}
