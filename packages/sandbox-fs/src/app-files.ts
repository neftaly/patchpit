import type { FolderLinkRow } from '@patchpit/fs';

const MAX_APP_FILES = 4_096;

export const APP_ENTRY_PATH = ['index.html'] as const;

export type AppFileOccurrence = {
  readonly resource: FolderLinkRow;
  readonly path: readonly string[];
};

export const projectAppFiles = (
  rows: readonly FolderLinkRow[],
  rootFolderRef: string,
): readonly AppFileOccurrence[] => {
  const byFolder = rows.reduce((folders, row) => {
    folders.set(row.sourceId, [...folders.get(row.sourceId) ?? [], row]);
    return folders;
  }, new Map<string, FolderLinkRow[]>());
  const activeFolders = new Set<string>();
  const visit = (folderRef: string, parentPath: readonly string[]): readonly AppFileOccurrence[] => {
    if (activeFolders.has(folderRef)) throw new Error(`Filesystem folder cycle at: ${folderRef}`);
    activeFolders.add(folderRef);
    const files = sorted(byFolder.get(folderRef)).flatMap((resource): readonly AppFileOccurrence[] => {
      const path = Object.freeze([...parentPath, resource.name]);
      return resource.typeHint === 'folder'
        ? visit(resource.resourceRef, path)
        : [{ resource, path }];
    });
    activeFolders.delete(folderRef);
    return files;
  };
  const files = visit(rootFolderRef, []);
  if (files.length > MAX_APP_FILES) throw new Error('Filesystem app has too many files');
  const pathKeys = files.map(({ path }) => JSON.stringify(path));
  if (new Set(pathKeys).size !== pathKeys.length) throw new Error('Filesystem app paths are not unique');
  return files;
};

export const hasAppEntry = (files: readonly AppFileOccurrence[]) =>
  files.some(({ path }) => samePath(path, APP_ENTRY_PATH));

const sorted = (rows: readonly FolderLinkRow[] | undefined) => [...rows ?? []].sort((left, right) =>
  (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
  || linkIdentity(left).localeCompare(linkIdentity(right)));

const linkIdentity = ({ linkId, sourceId }: FolderLinkRow) => JSON.stringify([sourceId, linkId]);

const samePath = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((segment, index) => segment === right[index]);
