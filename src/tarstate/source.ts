import type { Atom } from './types.js'

export type Row = Readonly<Record<string, Atom>>
type MaybePromise<T> = T | Promise<T>

export interface RelationSource {
  rows(relation: string): MaybePromise<Iterable<Row>>
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
