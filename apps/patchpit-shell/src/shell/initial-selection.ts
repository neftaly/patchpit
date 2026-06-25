import {
  parseAutomergeUrl,
  stringifyAutomergeUrl,
} from '@automerge/automerge-repo'
import type { DocHandle, Repo } from '@automerge/automerge-repo'
import { folderEntryObjectId, isAutomergeEntryUrl } from '@patchpit/filesystem'
import type { FolderDoc } from '@patchpit/filesystem'
import type { SelectedDoc } from '@patchpit/file-explorer/tree-state'

export async function initialUrlSelection({
  repo,
  rootHandle,
  rootEntryName,
}: {
  repo: Repo
  rootHandle: DocHandle<FolderDoc>
  rootEntryName: string
}): Promise<SelectedDoc | null> {
  const requestedUrl = initialRequestedUrl()
  if (!requestedUrl) return null

  const targetKey = entryUrlKey(requestedUrl)
  if (!targetKey) return null

  const matches = await findEntriesByUrl({
    repo,
    rootHandle,
    rootEntryName,
    targetKey,
  })
  const [match] = matches
  return matches.length === 1 && match ? match : null
}

function initialRequestedUrl(): string | null {
  return new URLSearchParams(window.location.search).get('url')
}

async function findEntriesByUrl({
  repo,
  rootHandle,
  rootEntryName,
  targetKey,
}: {
  repo: Repo
  rootHandle: DocHandle<FolderDoc>
  rootEntryName: string
  targetKey: string
}): Promise<SelectedDoc[]> {
  const rootKey = entryUrlKey(rootHandle.url)
  const matches: SelectedDoc[] =
    rootKey === targetKey
      ? [
          {
            entryId: null,
            type: 'folder',
            url: rootHandle.url,
            parentUrl: null,
            name: rootEntryName,
          },
        ]
      : []

  await collectEntryMatches(repo, rootHandle, targetKey, matches)
  return matches
}

async function collectEntryMatches(
  repo: Repo,
  folderHandle: DocHandle<FolderDoc>,
  targetKey: string,
  matches: SelectedDoc[],
) {
  const folder = folderHandle.doc() as FolderDoc

  for (const entry of folder.entries) {
    const entryId = folderEntryObjectId(entry)
    if (!entryId) continue

    if (entryUrlKey(entry.url) === targetKey) {
      matches.push({
        entryId,
        type: entry.type,
        url: entry.url,
        parentUrl: folderHandle.url,
        name: entry.name,
      })
    }

    if (entry.type === 'folder' && isAutomergeEntryUrl(entry.url)) {
      const childHandle = await repo.find<FolderDoc>(entry.url)
      await collectEntryMatches(repo, childHandle, targetKey, matches)
    }
  }
}

function entryUrlKey(url: string): string | null {
  if (!isAutomergeEntryUrl(url)) return url

  try {
    const { documentId } = parseAutomergeUrl(url)
    return stringifyAutomergeUrl({ documentId })
  } catch {
    return null
  }
}
