import type { DocHandle } from '@automerge/automerge-repo'
import type { Atom } from '@patchpit/tarstate/query'
import type {
  RelationInsert,
  RelationRemove,
  RelationUpdate,
  RelationWriter,
} from '@patchpit/tarstate/write'
import type { EntryType, FolderDoc, FolderEntry } from './model.js'

const FOLDER_ENTRY_RELATION = 'entries'
const FOLDER_ENTRY_KEY = 'url'
const FOLDER_ENTRY_NAME_KEY = 'name'

type FolderEntryRow = {
  name: string
  type: EntryType
  url: string
}

type FolderEntryPatch = Partial<FolderEntryRow>
type FolderEntryKey = keyof FolderEntryRow

export function addFolderEntry(
  folderHandle: DocHandle<FolderDoc>,
  entry: FolderEntry,
): void {
  changeFolderEntries(folderHandle, (writer) => {
    writer.insert({
      relation: FOLDER_ENTRY_RELATION,
      key: FOLDER_ENTRY_KEY,
      row: entry,
    })
  })
}

export function upsertFolderEntryByName(
  folderHandle: DocHandle<FolderDoc>,
  entry: FolderEntry,
): void {
  changeFolderEntries(folderHandle, (writer, entries) => {
    const existing = entries.find((item) => item.name === entry.name)
    if (!existing) {
      writer.insert({
        relation: FOLDER_ENTRY_RELATION,
        key: FOLDER_ENTRY_KEY,
        row: entry,
      })
      return
    }

    writer.update({
      relation: FOLDER_ENTRY_RELATION,
      key: FOLDER_ENTRY_NAME_KEY,
      id: entry.name,
      patch: {
        type: entry.type,
        url: entry.url,
      },
    })
  })
}

export function renameFolderEntryByUrl(
  folderHandle: DocHandle<FolderDoc>,
  url: string,
  name: string,
): void {
  updateFolderEntryByUrl(folderHandle, url, { name })
}

export function removeFolderEntryByUrl(
  folderHandle: DocHandle<FolderDoc>,
  url: string,
): void {
  changeFolderEntries(folderHandle, (writer) => {
    writer.remove({
      relation: FOLDER_ENTRY_RELATION,
      key: FOLDER_ENTRY_KEY,
      id: url,
    })
  })
}

function updateFolderEntryByUrl(
  folderHandle: DocHandle<FolderDoc>,
  url: string,
  patch: FolderEntryPatch,
): void {
  changeFolderEntries(folderHandle, (writer) => {
    writer.update({
      relation: FOLDER_ENTRY_RELATION,
      key: FOLDER_ENTRY_KEY,
      id: url,
      patch,
    })
  })
}

function changeFolderEntries(
  folderHandle: DocHandle<FolderDoc>,
  write: (
    writer: RelationWriter<FolderEntryRow, FolderEntryPatch>,
    entries: FolderEntry[],
  ) => void,
): void {
  folderHandle.change((draft) => {
    write(new FolderEntryRelationWriter(draft.entries), draft.entries)
  })
}

class FolderEntryRelationWriter
  implements RelationWriter<FolderEntryRow, FolderEntryPatch>
{
  constructor(private readonly entries: FolderEntry[]) {}

  insert(input: RelationInsert<FolderEntryRow>): void {
    assertEntryRelation(input.relation)
    this.entries.push({ ...input.row })
  }

  update(input: RelationUpdate<FolderEntryPatch>): void {
    assertEntryRelation(input.relation)
    const entry = this.find(input.key, input.id)
    if (!entry) return

    Object.assign(entry, input.patch)
  }

  remove(input: RelationRemove): void {
    assertEntryRelation(input.relation)
    const index = this.entries.findIndex(
      (entry) => entryValue(entry, input.key) === input.id,
    )
    if (index !== -1) this.entries.splice(index, 1)
  }

  private find(key: string, id: Atom): FolderEntry | undefined {
    return this.entries.find((entry) => entryValue(entry, key) === id)
  }
}

function assertEntryRelation(relation: string): void {
  if (relation !== FOLDER_ENTRY_RELATION) {
    throw new TypeError(`unsupported folder relation: ${relation}`)
  }
}

function entryValue(entry: FolderEntry, key: string): Atom {
  if (!isFolderEntryKey(key)) {
    throw new TypeError(`unsupported folder entry key: ${key}`)
  }

  return entry[key]
}

function isFolderEntryKey(key: string): key is FolderEntryKey {
  return key === 'name' || key === 'type' || key === 'url'
}
