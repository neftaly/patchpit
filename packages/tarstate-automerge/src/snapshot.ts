import type { AnyDocumentId, DocHandle, Repo } from '@automerge/automerge-repo'
import type { ObjectDoc } from '@patchpit/tarstate/source'
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
  subscribe(onChange: () => void): AutomergeSnapshotSubscription
}

export type AutomergeSnapshotSubscription = {
  unsubscribe(): void
}

export async function collectAutomergeSnapshot(
  root: ObjectDoc,
  { repo, linkField, isLink }: AutomergeLinkPolicy,
): Promise<AutomergeSnapshot> {
  const collection = new AutomergeSnapshotCollection()
  const pending = [root]

  for (let index = 0; index < pending.length; index += 1) {
    const doc = pending[index]
    if (!collection.addDoc(doc)) continue

    for (const src of linkValues(doc[linkField])) {
      if (!isLink(src) || !collection.addLink(src)) continue

      const handle = await repo.find<ObjectDoc>(src)
      collection.addHandle(handle)
      pending.push(handle.doc())
    }
  }

  return collection.snapshot()
}

class AutomergeSnapshotCollection {
  readonly #seenDocs = new Set<ObjectDoc>()
  readonly #seenLinks = new Set<string>()
  readonly #docs: ObjectDoc[] = []
  readonly #handles: DocHandle<ObjectDoc>[] = []

  addDoc(doc: ObjectDoc | undefined): doc is ObjectDoc {
    if (!doc || this.#seenDocs.has(doc)) return false

    this.#seenDocs.add(doc)
    this.#docs.push(doc)
    return true
  }

  addLink(src: string): boolean {
    if (this.#seenLinks.has(src)) return false

    this.#seenLinks.add(src)
    return true
  }

  addHandle(handle: DocHandle<ObjectDoc>): void {
    this.#handles.push(handle)
  }

  snapshot(): AutomergeSnapshot {
    const docs = [...this.#docs]
    const handles = [...this.#handles]

    return {
      docs,
      handles,
      subscribe: (onChange) => subscribeSnapshotHandles(handles, onChange),
    }
  }
}

function subscribeSnapshotHandles(
  handles: ReadonlyArray<DocHandle<ObjectDoc>>,
  onChange: () => void,
): AutomergeSnapshotSubscription {
  for (const handle of handles) {
    handle.on('change', onChange)
    handle.on('delete', onChange)
  }

  return {
    unsubscribe() {
      for (const handle of handles) {
        handle.off('change', onChange)
        handle.off('delete', onChange)
      }
    },
  }
}
