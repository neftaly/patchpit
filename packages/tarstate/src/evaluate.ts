import type { Atom, FieldRef, Predicate, Query } from './types.js'
import { getSpec } from './internal.js'
import type { RelationLookup, RelationSource, Row } from './source.js'
import {
  addAll,
  compilePlan,
  equijoinPlan,
  fieldValuePredicate,
  isFieldRef,
  readyPredicates,
} from './plan.js'
import type { QueryPlan } from './plan.js'

type AnyQuery = Query<Record<string, Atom>, string>
type EvalRow = Record<string, Row>
type QueryRows<TQuery> =
  TQuery extends Query<infer Row, string> ? ReadonlyArray<Row> : never

interface RowConstraint {
  readonly field: string
  readonly value: Atom
}

export function evaluate<T extends Record<string, Atom>, Rels extends string>(
  qb: Query<T, Rels>,
  source: RelationSource,
): Promise<ReadonlyArray<T>> {
  return evaluateMany([qb] as const, source).then(
    ([rows]) => rows as unknown as ReadonlyArray<T>,
  )
}

export async function evaluateMany<const Queries extends readonly AnyQuery[]>(
  queries: Queries,
  source: RelationSource,
): Promise<{ readonly [Index in keyof Queries]: QueryRows<Queries[Index]> }> {
  const context = new EvaluationContext(source)
  const plans = queries.map((query) => compilePlan(getSpec(query)))
  const results = await Promise.all(
    plans.map(async (plan) => {
      const rows = await evalPlan(plan, context)
      return rows.map((row) => outputRow(plan, row))
    }),
  )

  return results as {
    readonly [Index in keyof Queries]: QueryRows<Queries[Index]>
  }
}

async function evalPlan(
  plan: QueryPlan,
  context: EvaluationContext,
  baseRows?: ReadonlyArray<Row>,
): Promise<ReadonlyArray<EvalRow>> {
  const pendingPredicates = [...plan.predicates]
  const sourceRows = baseRows ?? await context.rowsFor(
    plan.from,
    accessConstraint(plan.from, pendingPredicates),
  )
  let rows: EvalRow[] = sourceRows.map((row) => ({
    [plan.from]: row,
  }))
  const joinedRelations = new Set<string>([plan.from])

  rows = applyReadyPredicates(rows, joinedRelations, pendingPredicates)

  for (const j of plan.joins) {
    const rightRelations = j.plan.relations
    rows = await joinRows(
      context,
      rows,
      j.plan,
      joinedRelations,
      rightRelations,
      j.on,
    )
    addAll(joinedRelations, rightRelations)
    rows = applyReadyPredicates(rows, joinedRelations, pendingPredicates)
  }

  if (pendingPredicates.length > 0) {
    rows = rows.filter((row) =>
      pendingPredicates.every((predicate) => evalPred(predicate, row)),
    )
  }

  return rows
}

async function joinRows(
  context: EvaluationContext,
  leftRows: ReadonlyArray<EvalRow>,
  rightPlan: QueryPlan,
  leftRelations: ReadonlySet<string>,
  rightRelations: ReadonlySet<string>,
  predicate: Predicate<string>,
): Promise<EvalRow[]> {
  const indexPlan = equijoinPlan(predicate, leftRelations, rightRelations)
  if (!indexPlan) {
    return nestedJoin(leftRows, await evalPlan(rightPlan, context), predicate)
  }

  const lookupRows = await lookupJoinRows(
    context,
    leftRows,
    rightPlan,
    leftRelations,
    predicate,
  )
  if (lookupRows) return lookupRows

  const rightRows = await evalPlan(rightPlan, context)
  const rightIndex = indexRows(rightRows, indexPlan.right)
  const rows: EvalRow[] = []

  for (const left of leftRows) {
    const candidates = rightIndex.get(resolveField(indexPlan.left, left))
    if (!candidates) continue

    for (const right of candidates) {
      rows.push({ ...left, ...right })
    }
  }

  return rows
}

async function lookupJoinRows(
  context: EvaluationContext,
  leftRows: ReadonlyArray<EvalRow>,
  rightPlan: QueryPlan,
  leftRelations: ReadonlySet<string>,
  predicate: Predicate<string>,
): Promise<EvalRow[] | null> {
  const indexPlan = equijoinPlan(predicate, leftRelations, rightPlan.relations)
  if (!indexPlan || indexPlan.right._rel !== rightPlan.from) return null

  const rows: EvalRow[] = []
  const rightRowsByValue = new Map<Atom, Promise<ReadonlyArray<EvalRow>>>()

  for (const left of leftRows) {
    const value = resolveField(indexPlan.left, left)
    let rightRows = rightRowsByValue.get(value)

    if (!rightRows) {
      const sourceRows = await context.lookupRows({
        relation: rightPlan.from,
        field: indexPlan.right._field,
        value,
      })
      if (sourceRows === undefined) return null

      rightRows = evalPlan(rightPlan, context, sourceRows)
      rightRowsByValue.set(value, rightRows)
    }

    for (const right of await rightRows) {
      const row = { ...left, ...right }
      if (evalPred(predicate, row)) rows.push(row)
    }
  }

  return rows
}

function nestedJoin(
  leftRows: ReadonlyArray<EvalRow>,
  rightRows: ReadonlyArray<EvalRow>,
  predicate: Predicate<string>,
): EvalRow[] {
  const rows: EvalRow[] = []

  for (const left of leftRows) {
    for (const right of rightRows) {
      const row = { ...left, ...right }
      if (evalPred(predicate, row)) rows.push(row)
    }
  }

  return rows
}

function accessConstraint(
  relation: string,
  predicates: ReadonlyArray<Predicate<string>>,
): RowConstraint | undefined {
  for (const predicate of predicates) {
    const fieldValue = fieldValuePredicate(predicate)
    if (fieldValue?.field._rel === relation) {
      return {
        field: fieldValue.field._field,
        value: fieldValue.value,
      }
    }
  }
  return undefined
}

function indexRows(
  rows: ReadonlyArray<EvalRow>,
  field: FieldRef<Atom, string>,
): Map<Atom, EvalRow[]> {
  const index = new Map<Atom, EvalRow[]>()

  for (const row of rows) {
    const key = resolveField(field, row)
    const bucket = index.get(key)
    if (bucket) bucket.push(row)
    else index.set(key, [row])
  }

  return index
}

function applyReadyPredicates(
  rows: EvalRow[],
  relations: ReadonlySet<string>,
  predicates: Predicate<string>[],
): EvalRow[] {
  let filtered = rows

  for (const predicate of readyPredicates(predicates, relations)) {
    filtered = filtered.filter((row) => evalPred(predicate, row))
  }

  return filtered
}

function outputRow(plan: QueryPlan, row: EvalRow): Record<string, Atom> {
  const projection = plan.projection
  if (!projection) return flattenRow(row)

  const projected: Record<string, Atom> = {}
  for (const { key, field } of projection) {
    projected[key] = resolve(field, row)
  }
  return projected
}

function flattenRow(row: EvalRow): Record<string, Atom> {
  return Object.assign({}, ...Object.values(row))
}

function evalPred(pred: Predicate<string>, row: EvalRow): boolean {
  return resolve(pred.lhs, row) === resolve(pred.rhs, row)
}

function resolve(ref: FieldRef<Atom, string> | Atom, row: EvalRow): Atom {
  if (!isFieldRef(ref)) return ref
  return resolveField(ref, row)
}

function resolveField(ref: FieldRef<Atom, string>, row: EvalRow): Atom {
  const relation = row[ref._rel]
  if (!relation) throw new Error(`relation not joined: ${ref._rel}`)
  if (!(ref._field in relation)) {
    throw new Error(`field not found: ${ref._rel}.${ref._field}`)
  }
  return relation[ref._field] ?? null
}

class EvaluationContext {
  readonly #source: RelationSource
  readonly #rows = new Map<string, Promise<ReadonlyArray<Row>>>()
  readonly #fallbackIndexes = new Map<string, Promise<Map<Atom, Row[]>>>()
  readonly #lookups = new Map<string, Promise<ReadonlyArray<Row> | undefined>>()

  constructor(source: RelationSource) {
    this.#source = source
  }

  async rowsFor(
    relation: string,
    constraint?: RowConstraint,
  ): Promise<ReadonlyArray<Row>> {
    if (!constraint) return this.rows(relation)

    const lookupRows = await this.lookupRows({
      relation,
      field: constraint.field,
      value: constraint.value,
    })
    if (lookupRows !== undefined) return lookupRows

    const index = await this.fallbackIndex(relation, constraint.field)
    return index.get(constraint.value) ?? []
  }

  async lookupRows(
    lookup: RelationLookup,
  ): Promise<ReadonlyArray<Row> | undefined> {
    if (!this.#source.lookup) return undefined

    const key = JSON.stringify([lookup.relation, lookup.field, lookup.value])
    let rows = this.#lookups.get(key)
    if (!rows) {
      rows = Promise.resolve(this.#source.lookup(lookup)).then((result) =>
        result === undefined ? undefined : Array.from(result),
      )
      this.#lookups.set(key, rows)
    }
    return rows
  }

  private rows(relation: string): Promise<ReadonlyArray<Row>> {
    let rows = this.#rows.get(relation)
    if (!rows) {
      rows = Promise.resolve(this.#source.rows(relation)).then((result) =>
        Array.from(result),
      )
      this.#rows.set(relation, rows)
    }
    return rows
  }

  private fallbackIndex(
    relation: string,
    field: string,
  ): Promise<Map<Atom, Row[]>> {
    const key = `${relation}\0${field}`
    let index = this.#fallbackIndexes.get(key)
    if (!index) {
      index = this.rows(relation).then((rows) => {
        const byValue = new Map<Atom, Row[]>()
        for (const row of rows) {
          const value = row[field] ?? null
          const bucket = byValue.get(value)
          if (bucket) bucket.push(row)
          else byValue.set(value, [row])
        }
        return byValue
      })
      this.#fallbackIndexes.set(key, index)
    }
    return index
  }
}
