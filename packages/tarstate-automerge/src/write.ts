import type { DocHandle } from '@automerge/automerge-repo'
import { applyOperation } from '@patchpit/tarstate/write'
import type { Atom } from '@patchpit/tarstate/query'
import type {
  RelationInsert,
  RelationRemove,
  RelationUpdate,
  RelationWriter,
  Transaction,
} from '@patchpit/tarstate/write'

export type AutomergeObjectDoc = object

export function createAutomergeWriter<T extends AutomergeObjectDoc>(
  handle: DocHandle<T>,
): RelationWriter {
  return new AutomergeRelationWriter(handle)
}

export async function applyAutomergeTransaction<T extends AutomergeObjectDoc>(
  handle: DocHandle<T>,
  tx: Pick<Transaction, 'operations'>,
): Promise<void> {
  handle.change((doc) => {
    const writer = new ObjectRelationWriter(mutableDoc(doc))
    for (const operation of tx.operations) {
      applyOperation(writer, operation)
    }
  })
}

class AutomergeRelationWriter<T extends AutomergeObjectDoc>
  implements RelationWriter
{
  constructor(private readonly handle: DocHandle<T>) {}

  insert(input: RelationInsert): void {
    this.handle.change((doc) => {
      new ObjectRelationWriter(mutableDoc(doc)).insert(input)
    })
  }

  update(input: RelationUpdate): void {
    this.handle.change((doc) => {
      new ObjectRelationWriter(mutableDoc(doc)).update(input)
    })
  }

  remove(input: RelationRemove): void {
    this.handle.change((doc) => {
      new ObjectRelationWriter(mutableDoc(doc)).remove(input)
    })
  }
}

class ObjectRelationWriter implements RelationWriter {
  constructor(private readonly doc: MutableObjectDoc) {}

  insert({ relation, row }: RelationInsert): void {
    ensureRelationRows(this.doc, relation).push({ ...row })
  }

  update({ relation, key, id, patch }: RelationUpdate): void {
    Object.assign(this.findRow(relation, key, id), patch)
  }

  remove({ relation, key, id }: RelationRemove): void {
    const rows = existingRelationRows(this.doc, relation)
    const index = rows.findIndex((row) => row[key] === id)
    if (index < 0) throw missingRow(relation, key, id)

    rows.splice(index, 1)
  }

  private findRow(relation: string, key: string, id: Atom): MutableRow {
    const row = existingRelationRows(this.doc, relation).find(
      (item) => item[key] === id,
    )
    if (!row) throw missingRow(relation, key, id)

    return row
  }
}

function ensureRelationRows(
  doc: MutableObjectDoc,
  relation: string,
): MutableRow[] {
  const current = doc[relation]
  if (current === undefined) {
    const rows: MutableRow[] = []
    doc[relation] = rows
    return rows
  }

  if (!Array.isArray(current)) {
    throw new TypeError(`relation is not an array: ${relation}`)
  }

  return current as MutableRow[]
}

function existingRelationRows(
  doc: MutableObjectDoc,
  relation: string,
): MutableRow[] {
  const current = doc[relation]
  if (!Array.isArray(current)) {
    throw new TypeError(`relation is not an array: ${relation}`)
  }

  return current as MutableRow[]
}

function missingRow(relation: string, key: string, id: Atom): Error {
  return new Error(`row not found: ${relation}.${key}=${String(id)}`)
}

function mutableDoc(doc: AutomergeObjectDoc): MutableObjectDoc {
  return doc as MutableObjectDoc
}

type MutableObjectDoc = Record<string, unknown>
type MutableRow = Record<string, Atom>
