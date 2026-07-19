import type {
  DatabaseTransactionOptions,
  DatabaseTransactionService,
  DatabaseTransactionSnapshot,
} from '@tarstate/core/transactions';
import { createIssue } from '@tarstate/core';
import { fileRelation, type FileKey } from '@patchpit/artifacts';
import { folderLinksRelation, type FolderLink } from './schema.ts';

export type FolderLinkFacts = Omit<FolderLink, 'order'>;

export type FolderOperation = {
  readonly kind: 'folder.link.rename';
  readonly linkId: string;
  readonly name: string;
} | {
  readonly kind: 'folder.link.unlink';
  readonly linkId: string;
  readonly expected?: FolderLinkFacts;
} | {
  readonly kind: 'folder.link.alias';
  readonly link: FolderLinkFacts;
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
  (snapshot) => {
    const links = snapshot.rows(folderLinksRelation);
    const issue = folderOperationRejection(links, operation);
    return issue === undefined
      ? snapshot.withRows(folderLinksRelation, applyFolderOperation(links, operation))
      : snapshot.reject(issue);
  },
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
    const existing = links.find(({ linkId }) => linkId === operation.linkId);
    return existing !== undefined
      && (operation.expected === undefined || sameFolderLinkFacts(existing, operation.expected))
      ? links.filter(({ linkId }) => linkId !== operation.linkId)
      : links;
  }
  return links.some(({ linkId }) => linkId === operation.link.linkId)
    ? links
    : [...links, operation.link];
};

export const sameFolderLinkFacts = (
  left: FolderLinkFacts,
  right: FolderLinkFacts,
) => left.linkId === right.linkId
  && left.name === right.name
  && left.resourceRef === right.resourceRef
  && left.typeHint === right.typeHint
  && left.copyOf === right.copyOf
  && left.icon === right.icon;

export const folderLinkFactsFromRow = (
  link: FolderLinkFacts,
): FolderLinkFacts => ({
  linkId: link.linkId,
  name: link.name,
  resourceRef: link.resourceRef,
  typeHint: link.typeHint,
  ...(link.copyOf === undefined ? {} : { copyOf: link.copyOf }),
  ...(link.icon === undefined ? {} : { icon: link.icon }),
});

const folderOperationRejection = (
  links: readonly FolderLink[],
  operation: FolderOperation,
) => {
  if (operation.kind === 'folder.link.rename') return undefined;
  const link = links.find(({ linkId }) => linkId === (
    operation.kind === 'folder.link.alias' ? operation.link.linkId : operation.linkId
  ));
  if (operation.kind === 'folder.link.alias') {
    return link === undefined || sameFolderLinkFacts(link, operation.link)
      ? undefined
      : folderOperationIssue('link_id_collision', operation.link.linkId);
  }
  return link === undefined || operation.expected === undefined
    || sameFolderLinkFacts(link, operation.expected)
    ? undefined
    : folderOperationIssue('link_changed', operation.linkId);
};

const folderOperationIssue = (reason: 'link_changed' | 'link_id_collision', linkId: string) =>
  createIssue({
    code: `patchpit.folder.${reason}`,
    phase: 'commit',
    severity: 'error',
    retry: 'after_refresh',
    relationId: folderLinksRelation.relationId,
    key: [linkId],
    details: { linkId },
  });
