import type { Atom } from './types.js'

export type Row = Readonly<Record<string, Atom>>
type MaybePromise<T> = T | Promise<T>

export interface RelationSource {
  rows(relation: string): MaybePromise<Iterable<Row>>
}

export type ObjectDoc = Readonly<Record<string, unknown>>

export type LinkResolver = (src: string) => MaybePromise<ObjectDoc | undefined>

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

export function fromLinkedObjects(
  root: ObjectDoc,
  resolve: LinkResolver,
  linkField = 'src',
): RelationSource {
  return {
    async rows(relation) {
      return rowsFromDocs(
        await collectLinkedObjects(root, resolve, linkField),
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
    if (Array.isArray(rows)) yield* rows as ReadonlyArray<Row>
  }
}

export async function collectLinkedObjects(
  root: ObjectDoc,
  resolve: LinkResolver,
  linkField: string,
): Promise<ReadonlyArray<ObjectDoc>> {
  const seen = new Set<ObjectDoc>()
  const pending = [root]
  const docs: ObjectDoc[] = []

  for (let index = 0; index < pending.length; index += 1) {
    const doc = pending[index]
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

export function linkValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.flatMap(linkValues)
  }
  if (isLinkRecord(value)) return [value.url]
  return []
}

function isLinkRecord(value: unknown): value is { url: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'url' in value &&
    typeof value.url === 'string'
  )
}
