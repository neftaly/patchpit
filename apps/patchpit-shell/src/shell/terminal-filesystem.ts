import type { DocHandle, Repo } from '@automerge/automerge-repo'
import type { TerminalFileSystem } from '@patchpit/bash-terminal'
import { createFile, createFolder } from '@patchpit/filesystem/repo'
import { isAutomergeEntryUrl, isFileDoc, isFolderDoc } from '@patchpit/filesystem'
import type { FileDoc, FolderDoc, FolderEntry } from '@patchpit/filesystem'

type ResolvedPath =
  | {
      type: 'folder'
      handle: DocHandle<FolderDoc>
      entry?: FolderEntry
      parentHandle?: DocHandle<FolderDoc>
    }
  | {
      type: 'file'
      handle: DocHandle<FileDoc>
      entry: FolderEntry
      parentHandle: DocHandle<FolderDoc>
    }

export function createAutomergeTerminalFileSystem({
  repo,
  rootHandle,
  rootName,
}: {
  repo: Repo
  rootHandle: DocHandle<FolderDoc>
  rootName: string
}): TerminalFileSystem {
  return {
    rootName,
    async list(path) {
      const resolved = await resolvePath(repo, rootHandle, path)
      if (resolved.type !== 'folder') {
        throw new Error(`${formatPath(path)}: not a directory`)
      }

      const folder = currentFolderDoc(resolved.handle, path)
      return folder.entries.map((entry) => ({
        name: entry.name,
        type: entry.type,
      }))
    },
    async readFile(path) {
      const resolved = await resolvePath(repo, rootHandle, path)
      if (resolved.type !== 'file')
        throw new Error(`${formatPath(path)}: not a file`)

      const file = currentFileDoc(resolved.handle, path)
      return file.content
    },
    async writeFile(path, content, options) {
      const existing = await resolveOptionalPath(repo, rootHandle, path)
      if (existing) {
        if (existing.type !== 'file') {
          throw new Error(`${formatPath(path)}: not a file`)
        }
        existing.handle.change((draft) => {
          draft.content = options?.append
            ? `${draft.content}${content}`
            : content
        })
        return
      }

      const { folderHandle, name } = await resolveParentFolder(
        repo,
        rootHandle,
        path,
      )
      folderHandle.change((draft) => {
        draft.entries.push(createFileEntry(repo, name, content))
      })
    },
    async makeDirectory(path) {
      if (await resolveOptionalPath(repo, rootHandle, path)) {
        throw new Error(`${formatPath(path)}: file exists`)
      }

      const { folderHandle, name } = await resolveParentFolder(
        repo,
        rootHandle,
        path,
      )
      folderHandle.change((draft) => {
        draft.entries.push(createFolderEntry(repo, name))
      })
    },
    async touchFile(path) {
      const existing = await resolveOptionalPath(repo, rootHandle, path)
      if (existing) {
        if (existing.type !== 'file') {
          throw new Error(`${formatPath(path)}: not a file`)
        }
        return
      }

      const { folderHandle, name } = await resolveParentFolder(
        repo,
        rootHandle,
        path,
      )
      folderHandle.change((draft) => {
        draft.entries.push(createFileEntry(repo, name, ''))
      })
    },
    async remove(path) {
      const name = basename(path)
      const parentPath = path.slice(0, -1)
      if (!name) throw new Error('rm: cannot remove root')

      const parent = await resolvePath(repo, rootHandle, parentPath)
      if (parent.type !== 'folder') {
        throw new Error(`${formatPath(parentPath)}: not a directory`)
      }

      parent.handle.change((draft) => {
        const index = draft.entries.findIndex((entry) => entry.name === name)
        if (index === -1) throw new Error(`${formatPath(path)}: no such file`)
        draft.entries.splice(index, 1)
      })
    },
  }
}

async function resolveOptionalPath(
  repo: Repo,
  rootHandle: DocHandle<FolderDoc>,
  path: readonly string[],
): Promise<ResolvedPath | null> {
  try {
    return await resolvePath(repo, rootHandle, path)
  } catch (error) {
    if (error instanceof MissingPathError) return null
    throw error
  }
}

async function resolvePath(
  repo: Repo,
  rootHandle: DocHandle<FolderDoc>,
  path: readonly string[],
): Promise<ResolvedPath> {
  let folderHandle = rootHandle
  let parentHandle: DocHandle<FolderDoc> | undefined
  let entry: FolderEntry | undefined

  if (path.length === 0) return { type: 'folder', handle: rootHandle }

  for (const [index, segment] of path.entries()) {
    const folder = currentFolderDoc(folderHandle, path.slice(0, index))
    entry = folder.entries.find((item) => item.name === segment)
    if (!entry) throw new MissingPathError(`${formatPath(path)}: no such file`)
    if (!isAutomergeEntryUrl(entry.url)) {
      throw new Error(`${formatPath(path.slice(0, index + 1))}: external file`)
    }

    parentHandle = folderHandle
    if (entry.type === 'file') {
      const fileHandle = await repo.find<FileDoc>(entry.url)
      if (index !== path.length - 1) {
        throw new Error(
          `${formatPath(path.slice(0, index + 1))}: not a directory`,
        )
      }
      return { type: 'file', handle: fileHandle, entry, parentHandle }
    }

    folderHandle = await repo.find<FolderDoc>(entry.url)
  }

  const resolved: ResolvedPath = { type: 'folder', handle: folderHandle }
  if (entry) resolved.entry = entry
  if (parentHandle) resolved.parentHandle = parentHandle
  return resolved
}

async function resolveParentFolder(
  repo: Repo,
  rootHandle: DocHandle<FolderDoc>,
  path: readonly string[],
) {
  const name = basename(path)
  if (!name) throw new Error('missing file name')

  const parent = await resolvePath(repo, rootHandle, path.slice(0, -1))
  if (parent.type !== 'folder') {
    throw new Error(`${formatPath(path.slice(0, -1))}: not a directory`)
  }

  return { folderHandle: parent.handle, name }
}

function createFileEntry(
  repo: Repo,
  name: string,
  content: string,
): FolderEntry {
  const handle = createFile(repo, name, 'source', content)
  return { name, type: 'file', url: handle.url }
}

function createFolderEntry(repo: Repo, name: string): FolderEntry {
  const handle = createFolder(repo, name, [])
  return { name, type: 'folder', url: handle.url }
}

function currentFolderDoc(
  handle: DocHandle<FolderDoc>,
  path: readonly string[],
): FolderDoc {
  const doc = handle.doc()
  if (!isFolderDoc(doc))
    throw new Error(`${formatPath(path)}: invalid folder doc`)
  return doc
}

function currentFileDoc(
  handle: DocHandle<FileDoc>,
  path: readonly string[],
): FileDoc {
  const doc = handle.doc()
  if (!isFileDoc(doc)) throw new Error(`${formatPath(path)}: invalid file doc`)
  return doc
}

function basename(path: readonly string[]): string | null {
  return path[path.length - 1] ?? null
}

function formatPath(path: readonly string[]): string {
  return `/${path.join('/')}`
}

class MissingPathError extends Error {}
