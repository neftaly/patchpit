import type { Atom } from './types.js'

export type Row = Readonly<Record<string, Atom>>
type MaybePromise<T> = T | Promise<T>

export interface RelationSource {
  rows(relation: string): MaybePromise<Iterable<Row>>
}

export type ObjectDoc = Readonly<Record<string, unknown>>

export type LinkResolver = (
  src: string,
) => MaybePromise<ObjectDoc | undefined>

export function fromObject(doc: ObjectDoc): RelationSource {
  return {
    rows(relation) {
      const value = doc[relation]
      return Array.isArray(value) ? (value as ReadonlyArray<Row>) : []
    },
  }
}

export function fromLinkedObjects(
  root: ObjectDoc,
  resolve: LinkResolver,
  linkField = 'src',
): RelationSource {
  return {
    async rows(relation) {
      return rowsFromDocs(
        await collectLinkedDocs(root, resolve, linkField),
        relation,
      )
    },
  }
}

function* rowsFromDocs(
  docs: ReadonlyArray<ObjectDoc>,
  relation: string,
): Iterable<Row> {
  for (const doc of docs) {
    const rows = doc[relation]
    if (Array.isArray(rows)) yield* (rows as ReadonlyArray<Row>)
  }
}

async function collectLinkedDocs(
  root: ObjectDoc,
  resolve: LinkResolver,
  linkField: string,
): Promise<ReadonlyArray<ObjectDoc>> {
  const seen = new Set<ObjectDoc>()
  const pending = [root]
  const docs: ObjectDoc[] = []

  while (pending.length > 0) {
    const doc = pending.shift()
    if (!doc || seen.has(doc)) continue
    seen.add(doc)
    docs.push(doc)

    for (const src of linkValues(doc[linkField])) {
      const linked = await resolve(src)
      if (linked) pending.push(linked)
    }
  }

  return docs
}

function linkValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.filter((src): src is string => typeof src === 'string')
  }
  return []
}
