import type { Atom } from './types.js'

export type Row = Readonly<Record<string, Atom>>

export interface RelationSource {
  rows(relation: string): Iterable<Row>
}

export type ObjectDoc = Readonly<Record<string, unknown>>

export function fromObject(doc: ObjectDoc): RelationSource {
  return {
    rows(relation) {
      const value = doc[relation]
      return Array.isArray(value) ? (value as ReadonlyArray<Row>) : []
    },
  }
}
