import type { FsEntryRow } from '@patchpit/fs';

const MAX_APP_FILES = 4_096;

export const APP_ENTRY_PATH = ['index.html'] as const;

export const selectAppFiles = (rows: readonly FsEntryRow[], rootEntryId: string) => {
  const root = rows.find(({ entryId }) => entryId === rootEntryId);
  if (root?.kind !== 'folder') throw new Error('Filesystem app root is not an authorized folder');
  const entries = rows.filter(({ entryId }) => entryId !== root.entryId);
  const files = entries.filter(({ kind }) => kind === 'file');
  if (files.length > MAX_APP_FILES) throw new Error('Filesystem app has too many files');
  return {
    root,
    entries,
    files,
    resourceRefs: [...new Set(files.map(({ resourceRef }) => resourceRef))],
  };
};

export const projectAppFilePaths = (root: FsEntryRow, entries: readonly FsEntryRow[]) => {
  const byId = new Map(entries.map((entry) => [entry.entryId, entry]));
  const paths = new Map<string, readonly string[]>();
  const resolving = new Set<string>();
  const pathFor = (entry: FsEntryRow): readonly string[] => {
    const known = paths.get(entry.entryId);
    if (known !== undefined) return known;
    if (resolving.has(entry.entryId)) throw new Error(`Filesystem parent cycle at: ${entry.entryId}`);
    resolving.add(entry.entryId);
    const parent = entry.parentId === null ? undefined : byId.get(entry.parentId);
    if (entry.parentId !== root.entryId && parent === undefined) {
      throw new Error(`Filesystem parent is outside the app subtree: ${entry.entryId}`);
    }
    const path = entry.parentId === root.entryId
      ? [entry.name]
      : [...pathFor(parent!), entry.name];
    resolving.delete(entry.entryId);
    paths.set(entry.entryId, Object.freeze(path));
    return path;
  };
  for (const entry of entries) pathFor(entry);
  const filePathKeys = entries
    .filter(({ kind }) => kind === 'file')
    .map(({ entryId }) => JSON.stringify(pathFor(byId.get(entryId)!)));
  if (new Set(filePathKeys).size !== filePathKeys.length) throw new Error('Filesystem app paths are not unique');
  return paths;
};

export const hasAppEntry = (
  files: readonly FsEntryRow[],
  paths: ReadonlyMap<string, readonly string[]>,
) => files.some((file) => samePath(paths.get(file.entryId), APP_ENTRY_PATH));

const samePath = (left: readonly string[] | undefined, right: readonly string[]) =>
  left !== undefined && left.length === right.length
  && left.every((segment, index) => segment === right[index]);
