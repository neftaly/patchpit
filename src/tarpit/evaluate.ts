import type { Atom, FieldRef, Predicate, QB } from './types.js'
import { getSpec } from './internal.js'
import type { QuerySpec } from './internal.js'

type Row = Readonly<Record<string, Atom>>

export type Doc = Readonly<object>

export function evaluate<T extends Record<string, Atom>, Rels extends string>(
  qb: QB<T, Rels>,
  doc: Doc,
): ReadonlyArray<T> {
  return evalSpec(getSpec(qb), doc) as ReadonlyArray<T>
}

function evalSpec(
  spec: QuerySpec,
  doc: Doc,
): ReadonlyArray<Record<string, Atom>> {
  let rows: Record<string, Atom>[] = Array.from(relationRows(doc, spec.from))

  for (const j of spec.joins) {
    const rhs = evalSpec(j.spec, doc)
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
  switch (pred.op) {
    case 'eq':
      return resolve(pred.lhs, row) === resolve(pred.rhs, row)
    case 'ne':
      return resolve(pred.lhs, row) !== resolve(pred.rhs, row)
    case 'lt':
      return comparable(pred.lhs, row) < comparable(pred.rhs, row)
    case 'gt':
      return comparable(pred.lhs, row) > comparable(pred.rhs, row)
    case 'lte':
      return comparable(pred.lhs, row) <= comparable(pred.rhs, row)
    case 'gte':
      return comparable(pred.lhs, row) >= comparable(pred.rhs, row)
    case 'and':
      return pred.operands.every((p) => evalPred(p, row))
    case 'or':
      return pred.operands.some((p) => evalPred(p, row))
    case 'not':
      return !evalPred(pred.operand, row)
  }
}

function comparable(
  ref: FieldRef<Atom, string> | Atom,
  row: Record<string, Atom>,
): string | number {
  return resolve(ref, row) as string | number
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

function relationRows(doc: Doc, relation: string): ReadonlyArray<Row> {
  const value = (doc as Record<string, unknown>)[relation]
  return Array.isArray(value) ? (value as ReadonlyArray<Row>) : []
}
