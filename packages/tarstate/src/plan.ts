import type { Atom, FieldRef, Predicate } from './types.js'
import type { ProjectionField, QuerySpec } from './internal.js'

export interface QueryPlan {
  readonly from: string
  readonly predicates: ReadonlyArray<Predicate<string>>
  readonly joins: ReadonlyArray<JoinPlan>
  readonly projection?: ReadonlyArray<ProjectionField>
  readonly relations: ReadonlySet<string>
}

export interface JoinPlan {
  readonly plan: QueryPlan
  readonly on: Predicate<string>
}

export interface EquijoinPlan {
  readonly left: FieldRef<Atom, string>
  readonly right: FieldRef<Atom, string>
}

export interface FieldValuePredicate {
  readonly field: FieldRef<Atom, string>
  readonly value: Atom
}

export function compilePlan(spec: QuerySpec): QueryPlan {
  const joins = spec.joins.map((join) => ({
    plan: compilePlan(join.spec),
    on: join.on,
  }))
  const relations = new Set<string>([spec.from])
  for (const join of joins) addAll(relations, join.plan.relations)

  return {
    from: spec.from,
    predicates: spec.predicates,
    joins,
    ...(spec.projection && { projection: spec.projection }),
    relations,
  }
}

export function readyPredicates(
  predicates: Predicate<string>[],
  relations: ReadonlySet<string>,
): Predicate<string>[] {
  const ready: Predicate<string>[] = []

  for (let index = 0; index < predicates.length; ) {
    const predicate = predicates[index]
    if (!predicate || !predicateReady(predicate, relations)) {
      index += 1
      continue
    }

    ready.push(predicate)
    predicates.splice(index, 1)
  }

  return ready
}

export function equijoinPlan(
  predicate: Predicate<string>,
  leftRelations: ReadonlySet<string>,
  rightRelations: ReadonlySet<string>,
): EquijoinPlan | null {
  const lhs = predicate.lhs
  const rhs = predicate.rhs
  if (!isFieldRef(rhs)) return null

  if (leftRelations.has(lhs._rel) && rightRelations.has(rhs._rel)) {
    return { left: lhs, right: rhs }
  }

  if (leftRelations.has(rhs._rel) && rightRelations.has(lhs._rel)) {
    return { left: rhs, right: lhs }
  }

  return null
}

export function fieldValuePredicate(
  predicate: Predicate<string>,
): FieldValuePredicate | null {
  if (isFieldRef(predicate.rhs)) return null
  return {
    field: predicate.lhs,
    value: predicate.rhs,
  }
}

export function addAll<T>(target: Set<T>, values: Iterable<T>): void {
  for (const value of values) target.add(value)
}

function predicateReady(
  predicate: Predicate<string>,
  relations: ReadonlySet<string>,
): boolean {
  return predicateRelations(predicate).every((relation) => relations.has(relation))
}

function predicateRelations(predicate: Predicate<string>): string[] {
  const relations = [predicate.lhs._rel]
  if (isFieldRef(predicate.rhs)) relations.push(predicate.rhs._rel)
  return relations
}

export function isFieldRef(
  value: FieldRef<Atom, string> | Atom,
): value is FieldRef<Atom, string> {
  return value !== null && typeof value === 'object' && '_field' in value
}
