import type { Atom, FieldRef, Predicate, Query } from './types.js'
import { getSpec } from './internal.js'
import type { RelationSource } from './source.js'
import {
  addAll,
  compilePlan,
  equijoinPlan,
  readyPredicates,
} from './plan.js'
import type { QueryPlan } from './plan.js'

type EvalRow = Record<string, Record<string, Atom>>

export function evaluate<T extends Record<string, Atom>, Rels extends string>(
  qb: Query<T, Rels>,
  source: RelationSource,
): Promise<ReadonlyArray<T>> {
  const plan = compilePlan(getSpec(qb))
  return evalPlan(plan, source).then((rows) =>
    rows.map((row) => outputRow(plan, row)),
  ) as Promise<ReadonlyArray<T>>
}

async function evalPlan(
  plan: QueryPlan,
  source: RelationSource,
): Promise<ReadonlyArray<EvalRow>> {
  let rows: EvalRow[] = Array.from(await source.rows(plan.from)).map((row) => ({
    [plan.from]: row,
  }))
  const joinedRelations = new Set<string>([plan.from])
  const pendingPredicates = [...plan.predicates]

  rows = applyReadyPredicates(rows, joinedRelations, pendingPredicates)

  for (const j of plan.joins) {
    const rhs = await evalPlan(j.plan, source)
    const rightRelations = j.plan.relations
    rows = joinRows(rows, rhs, joinedRelations, rightRelations, j.on)
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

function joinRows(
  leftRows: ReadonlyArray<EvalRow>,
  rightRows: ReadonlyArray<EvalRow>,
  leftRelations: ReadonlySet<string>,
  rightRelations: ReadonlySet<string>,
  predicate: Predicate<string>,
): EvalRow[] {
  const indexPlan = equijoinPlan(predicate, leftRelations, rightRelations)
  if (!indexPlan) return nestedJoin(leftRows, rightRows, predicate)

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

function isFieldRef(
  value: FieldRef<Atom, string> | Atom,
): value is FieldRef<Atom, string> {
  return value !== null && typeof value === 'object' && '_field' in value
}
