import type {
  DatabaseTransactionOptions,
  DatabaseTransactionService,
  DatabaseTransactionSnapshot,
} from '@tarstate/core/transactions';
import { fileRelation, type FileKey } from '@patchpit/artifacts';
import { folderLinksRelation, type FolderLink } from './schema.ts';

export type FolderOperation = {
  readonly kind: 'folder.link.rename';
  readonly linkId: string;
  readonly name: string;
} | {
  readonly kind: 'folder.link.unlink';
  readonly linkId: string;
} | {
  readonly kind: 'folder.link.alias';
  readonly link: Omit<FolderLink, 'order'>;
};

export type TextFileSpliceOperation = {
  readonly kind: 'file.text.splice';
  readonly index: number;
  readonly deleteCount: number;
  readonly insert: string;
};

export const commitFolderOperation = (
  database: DatabaseTransactionService,
  operation: FolderOperation,
  signal?: AbortSignal,
) => database.transact(
  operation,
  (snapshot) => snapshot.withRows(
    folderLinksRelation,
    applyFolderOperation(snapshot.rows(folderLinksRelation), operation),
  ),
  signal === undefined ? undefined : { signal },
);

export const commitTextFileSplice = (
  database: DatabaseTransactionService,
  operation: TextFileSpliceOperation,
  options?: DatabaseTransactionOptions,
) => database.transact(
  operation,
  (snapshot) => stageTextFileSplice(snapshot, operation),
  options,
);

export const stageTextFileSplice = (
  snapshot: DatabaseTransactionSnapshot,
  operation: TextFileSpliceOperation,
) => snapshot.spliceText(
  fileRelation,
  ['text'] satisfies FileKey,
  'textContent',
  operation,
);

export const applyFolderOperation = (
  links: readonly FolderLink[],
  operation: FolderOperation,
): readonly FolderLink[] => {
  if (operation.kind === 'folder.link.rename') {
    return links.map((link) => link.linkId === operation.linkId
      ? { ...link, name: operation.name }
      : link);
  }
  if (operation.kind === 'folder.link.unlink') {
    return links.filter(({ linkId }) => linkId !== operation.linkId);
  }
  return links.some(({ linkId }) => linkId === operation.link.linkId)
    ? links
    : [...links, operation.link];
};
