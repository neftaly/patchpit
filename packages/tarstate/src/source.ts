import type { Atom } from './types.js'

export type Row = Readonly<Record<string, Atom>>
type MaybePromise<T> = T | Promise<T>

export interface RelationLookup {
  readonly relation: string
  readonly field: string
  readonly value: Atom
}

export interface RelationSource {
  rows(relation: string): MaybePromise<Iterable<Row>>
  lookup?(lookup: RelationLookup): MaybePromise<Iterable<Row> | undefined>
}

export type ObjectDoc = Readonly<Record<string, unknown>>

export function fromObject(doc: ObjectDoc): RelationSource {
  return fromObjects([doc])
}

export function fromObjects(docs: ReadonlyArray<ObjectDoc>): RelationSource {
  return {
    rows(relation) {
      return rowsFromDocs(docs, relation)
    },
    lookup({ relation, field, value }) {
      return lookupRowsFromDocs(docs, relation, field, value)
    },
  }
}

function* rowsFromDocs(
  docs: ReadonlyArray<ObjectDoc>,
  relation: string,
): Iterable<Row> {
  for (const doc of docs) {
    const rows = doc[relation]
    if (Array.isArray(rows)) yield* rows as ReadonlyArray<Row>
  }
}

function* lookupRowsFromDocs(
  docs: ReadonlyArray<ObjectDoc>,
  relation: string,
  field: string,
  value: Atom,
): Iterable<Row> {
  for (const row of rowsFromDocs(docs, relation)) {
    if ((row[field] ?? null) === value) yield row
  }
}
