import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import type { ObjectDoc } from '@patchpit/tarstate'
import { linkValues } from '@patchpit/tarstate-links'

type StringDocumentId = Extract<AnyDocumentId, string>

export type AutomergeLinkPolicy = {
  readonly repo: Repo
  readonly linkField: string
  readonly isLink: (src: string) => src is StringDocumentId
}

export type AutomergeSnapshot = {
  readonly docs: ReadonlyArray<ObjectDoc>
  readonly handles: ReadonlyArray<DocHandle<ObjectDoc>>
}

export async function collectAutomergeSnapshot(
  root: ObjectDoc,
  { repo, linkField, isLink }: AutomergeLinkPolicy,
): Promise<AutomergeSnapshot> {
  const seenDocs = new Set<ObjectDoc>()
  const seenLinks = new Set<string>()
  const pending = [root]
  const docs: ObjectDoc[] = []
  const handles: DocHandle<ObjectDoc>[] = []

  for (let index = 0; index < pending.length; index += 1) {
    const doc = pending[index]
    if (!doc || seenDocs.has(doc)) continue

    seenDocs.add(doc)
    docs.push(doc)

    for (const src of linkValues(doc[linkField])) {
      if (!isLink(src) || seenLinks.has(src)) continue

      seenLinks.add(src)
      const handle = await repo.find<ObjectDoc>(src)
      handles.push(handle)
      pending.push(handle.doc())
    }
  }

  return { docs, handles }
}
