import type { Atom, FieldRef, Predicate, QB } from './types.js'
import { getSpec } from './internal.js'
import type { QuerySpec } from './internal.js'
import type { RelationSource } from './source.js'

export function evaluate<T extends Record<string, Atom>, Rels extends string>(
  qb: QB<T, Rels>,
  source: RelationSource,
): ReadonlyArray<T> {
  return evalSpec(getSpec(qb), source) as ReadonlyArray<T>
}

function evalSpec(
  spec: QuerySpec,
  source: RelationSource,
): ReadonlyArray<Record<string, Atom>> {
  let rows: Record<string, Atom>[] = Array.from(source.rows(spec.from))

  for (const j of spec.joins) {
    const rhs = evalSpec(j.spec, source)
    const joined: Record<string, Atom>[] = []
    for (const left of rows) {
      for (const right of rhs) {
        const row = { ...left, ...right }
        if (evalPred(j.on, row)) joined.push(row)
      }
    }
    rows = joined
  }

  rows = rows.filter((row) => spec.predicates.every((p) => evalPred(p, row)))

  const projection = spec.projection
  if (projection) {
    rows = rows.map((row) => {
      const projected: Record<string, Atom> = {}
      for (const key of projection) {
        projected[key] = row[key] ?? null
      }
      return projected
    })
  }

  return rows
}

function evalPred(pred: Predicate<string>, row: Record<string, Atom>): boolean {
  return resolve(pred.lhs, row) === resolve(pred.rhs, row)
}

function resolve(
  ref: FieldRef<Atom, string> | Atom,
  row: Record<string, Atom>,
): Atom {
  return isFieldRef(ref) ? (row[ref._field] ?? null) : ref
}

function isFieldRef(
  value: FieldRef<Atom, string> | Atom,
): value is FieldRef<Atom, string> {
  return value !== null && typeof value === 'object' && '_field' in value
}
