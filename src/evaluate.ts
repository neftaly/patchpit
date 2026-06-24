import type { Atom, QB } from './types.js'
import { getSpec } from './internal.js'
import type { QuerySpec, PredNode, FieldRefNode } from './internal.js'

// ---------------------------------------------------------------------------
// Doc — any record of readonly row arrays.
// Automerge docs satisfy this at read time: doc.tasks, doc.users, etc. are
// immutable arrays that look like plain objects. Pass an A.Doc<...> directly.
// ---------------------------------------------------------------------------

export type Doc = Readonly<Record<string, ReadonlyArray<Readonly<Record<string, Atom>>>>>

// ---------------------------------------------------------------------------
// evaluate — pure function from (QB spec, immutable doc snapshot) → rows
// ---------------------------------------------------------------------------

export function evaluate<T extends Record<string, Atom>, Rels extends string>(
  qb:  QB<T, Rels>,
  doc: Doc,
): ReadonlyArray<T> {
  return evalSpec(getSpec(qb), doc) as ReadonlyArray<T>
}

// ---------------------------------------------------------------------------
// Internal evaluation
// ---------------------------------------------------------------------------

function evalSpec(spec: QuerySpec, doc: Doc): ReadonlyArray<Record<string, Atom>> {
  let rows: Record<string, Atom>[] = Array.from(doc[spec.from] ?? [])

  for (const j of spec.joins) {
    const rhs = evalSpec(j.spec, doc)
    rows = rows.flatMap(l =>
      rhs
        .filter(r  => evalPred(j.on, { ...l, ...r }))
        .map(   r  => ({ ...l, ...r })),
    )
  }

  rows = rows.filter(row => spec.predicates.every(p => evalPred(p, row)))

  if (spec.projection) {
    const keys = spec.projection
    rows = rows.map(row => Object.fromEntries(keys.map(k => [k, row[k] ?? null])))
  }

  return rows
}

function evalPred(pred: PredNode, row: Record<string, Atom>): boolean {
  switch (pred.op) {
    case 'eq':  return resolve(pred.lhs, row) === resolve(pred.rhs, row)
    case 'ne':  return resolve(pred.lhs, row) !== resolve(pred.rhs, row)
    case 'lt':  return (resolve(pred.lhs, row) as any) <  (resolve(pred.rhs, row) as any)
    case 'gt':  return (resolve(pred.lhs, row) as any) >  (resolve(pred.rhs, row) as any)
    case 'lte': return (resolve(pred.lhs, row) as any) <= (resolve(pred.rhs, row) as any)
    case 'gte': return (resolve(pred.lhs, row) as any) >= (resolve(pred.rhs, row) as any)
    case 'and': return pred.operands.every(p => evalPred(p, row))
    case 'or':  return pred.operands.some( p => evalPred(p, row))
    case 'not': return !evalPred(pred.operand, row)
  }
}

function resolve(ref: FieldRefNode | Atom, row: Record<string, Atom>): Atom {
  if (ref !== null && typeof ref === 'object' && '_field' in ref) {
    return row[(ref as FieldRefNode)._field] ?? null
  }
  return ref as Atom
}
