import { fromObjects } from '@patchpit/tarstate'
import type { ObjectDoc, RelationSource } from '@patchpit/tarstate'

type MaybePromise<T> = T | Promise<T>

export type LinkResolver = (src: string) => MaybePromise<ObjectDoc | undefined>

export function fromLinkedObjects(
  root: ObjectDoc,
  resolve: LinkResolver,
  linkField = 'src',
): RelationSource {
  return {
    async rows(relation) {
      return fromObjects(
        await collectLinkedObjects(root, resolve, linkField),
      ).rows(relation)
    },
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
