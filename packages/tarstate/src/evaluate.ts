import type { Atom, FieldRef, Predicate, Query } from './types.js'
import { getSpec } from './internal.js'
import type { QuerySpec } from './internal.js'
import type { RelationSource } from './source.js'

type EvalRow = Record<string, Record<string, Atom>>

export function evaluate<T extends Record<string, Atom>, Rels extends string>(
  qb: Query<T, Rels>,
  source: RelationSource,
): Promise<ReadonlyArray<T>> {
  return evalSpec(getSpec(qb), source).then((rows) =>
    rows.map((row) => outputRow(getSpec(qb), row)),
  ) as Promise<ReadonlyArray<T>>
}

async function evalSpec(
  spec: QuerySpec,
  source: RelationSource,
): Promise<ReadonlyArray<EvalRow>> {
  let rows: EvalRow[] = Array.from(await source.rows(spec.from)).map((row) => ({
    [spec.from]: row,
  }))

  for (const j of spec.joins) {
    const rhs = await evalSpec(j.spec, source)
    const joined: EvalRow[] = []
    for (const left of rows) {
      for (const right of rhs) {
        const row = { ...left, ...right }
        if (evalPred(j.on, row)) joined.push(row)
      }
    }
    rows = joined
  }

  rows = rows.filter((row) => spec.predicates.every((p) => evalPred(p, row)))

  return rows
}

function outputRow(spec: QuerySpec, row: EvalRow): Record<string, Atom> {
  const projection = spec.projection
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
