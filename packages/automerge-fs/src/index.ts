import { getConflicts } from '@automerge/automerge';
import type { DocHandle } from '@automerge/automerge-repo';
import {
  openAutomergeDatabase,
  type AutomergeDatabase,
} from '@tarstate/automerge';
import { adoptConflictFreeAutomergeJsonValue } from '@tarstate/automerge/values';
import {
  createIssue,
  type Issue,
  type ParseResult,
} from '@tarstate/core';
import {
  safeParseDocumentDeclaration,
  type DocumentDeclaration,
} from '@tarstate/core/attachment/declaration';
import {
  folderForeignAttachment,
  folderOwnedAttachment,
} from '@patchpit/artifacts';
import {
  folderSchemaArtifact,
  type FolderDatabaseSource,
  type FolderLink,
} from '@patchpit/fs';
import {
  openAutomergeFileDatabase,
} from './file-content.ts';
import {
  filesystemSelectionIssue,
  hasPatchworkFolderShape,
  isRecord,
  patchworkMetadataIssue,
  sameArtifactRef,
  sameDocumentDeclaration,
  selectFilesystemDocumentKind,
} from './document-selection.ts';

export {
  automergeBinaryFileDocumentMetadata,
  automergeTextFileDocumentMetadata,
  createAutomergeBinaryFileDocument,
  createAutomergeTextFileDocument,
  fileRelation,
  fileSchemaArtifact,
  openAutomergeFileDatabase,
  type AutomergeBinaryFileDocument,
  type AutomergeTextFileDocument,
} from './file-content.ts';

const patchworkFolderMetadata = { type: 'folder' } as const;

export type AutomergeFolderLink = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly url: string;
  readonly icon?: string;
  readonly copyOf?: string;
};

export type AutomergeFolderDocument = {
  readonly '@patchpit': typeof automergeFolderDocumentMetadata;
  readonly '@patchwork': typeof patchworkFolderMetadata;
  readonly title: string;
  readonly docs: readonly AutomergeFolderLink[];
};

export type AutomergeFolderDatabase = AutomergeDatabase & FolderDatabaseSource;

export type AutomergeFilesystemDatabase = {
  readonly kind: 'folder';
  readonly database: AutomergeFolderDatabase;
} | {
  readonly kind: 'file';
  readonly database: AutomergeDatabase;
};

type SelectedFolderAttachment = {
  readonly declaration: DocumentDeclaration;
  readonly artifacts: Readonly<Record<string, unknown>>;
};

export const automergeFolderDocumentMetadata = {
  type: 'folder',
  schema: folderOwnedAttachment.declaration.storageSchema,
  declaration: folderOwnedAttachment.declaration,
  schemas: folderOwnedAttachment.artifacts,
} as const;

export const createAutomergeFolderDocument = (
  title: string,
  links: readonly FolderLink[],
): AutomergeFolderDocument => ({
  '@patchpit': automergeFolderDocumentMetadata,
  '@patchwork': patchworkFolderMetadata,
  title,
  docs: links.map(({ linkId, name, typeHint, resourceRef, icon, copyOf }) => ({
    id: linkId,
    name,
    type: typeHint,
    url: resourceRef,
    ...(icon === undefined ? {} : { icon }),
    ...(copyOf === undefined ? {} : { copyOf }),
  })),
});

export const openAutomergeFolderDatabase = async (
  handle: DocHandle<object>,
  authorityScope = 'public',
): Promise<ParseResult<AutomergeFolderDatabase>> => {
  const sourceId = handle.url;
  const document = handle.doc();
  if (document === undefined) {
    return { success: false, issues: [folderIssue('source-unavailable', sourceId)] };
  }
  const kind = selectFilesystemDocumentKind(document, sourceId);
  if (!kind.success) return kind;
  if (kind.value !== 'folder') {
    return { success: false, issues: [...kind.issues, folderIssue('type-mismatch', sourceId)] };
  }
  const selected = selectFolderAttachment(document, sourceId);
  if (selected.attachment === undefined) return { success: false, issues: selected.issues };
  const attachmentId = `patchpit:folder:${sourceId}`;
  const opened = await openAutomergeDatabase({
    handle,
    declaration: selected.attachment.declaration,
    embeddedArtifacts: selected.attachment.artifacts,
    authorityScope,
    attachmentId,
  });
  return opened.success
    ? {
        success: true,
        value: opened.value,
        issues: [...selected.issues, ...opened.issues],
      }
    : { success: false, issues: [...selected.issues, ...opened.issues] };
};

export const openAutomergeFilesystemDatabase = async (
  handle: DocHandle<object>,
  authorityScope = 'public',
): Promise<ParseResult<AutomergeFilesystemDatabase>> => {
  const sourceId = handle.url;
  const document = handle.doc();
  if (document === undefined) {
    return { success: false, issues: [filesystemSelectionIssue('source-unavailable', sourceId)] };
  }
  const selected = selectFilesystemDocumentKind(document, sourceId);
  if (!selected.success) return selected;
  if (selected.value === 'folder') {
    const opened = await openAutomergeFolderDatabase(handle, authorityScope);
    return opened.success
      ? {
          success: true,
          value: { kind: 'folder', database: opened.value },
          issues: [...selected.issues, ...opened.issues],
        }
      : { success: false, issues: [...selected.issues, ...opened.issues] };
  }
  const opened = await openAutomergeFileDatabase(handle, authorityScope);
  return opened.success
    ? {
        success: true,
        value: { kind: 'file', database: opened.value },
        issues: [...selected.issues, ...opened.issues],
      }
    : { success: false, issues: [...selected.issues, ...opened.issues] };
};

const selectFolderAttachment = (
  document: object,
  sourceId: string,
): { readonly attachment: SelectedFolderAttachment; readonly issues: readonly Issue[] }
  | { readonly attachment?: undefined; readonly issues: readonly Issue[] } => {
  if ('@patchpit' in document) return selectOwnedFolderAttachment(document, sourceId);
  if (!hasPatchworkFolderShape(document)) {
    return { issues: [folderIssue('shape-invalid', sourceId)] };
  }
  const interopIssue = patchworkMetadataIssue(document, 'folder', sourceId);
  return {
    attachment: folderForeignAttachment,
    issues: interopIssue === undefined ? [] : [interopIssue],
  };
};

const selectOwnedFolderAttachment = (
  document: object & { readonly '@patchpit': unknown },
  sourceId: string,
): { readonly attachment: SelectedFolderAttachment; readonly issues: readonly Issue[] }
  | { readonly attachment?: undefined; readonly issues: readonly Issue[] } => {
  if (getConflicts(document, '@patchpit') !== undefined) {
    return { issues: [folderIssue('metadata-conflicted', sourceId)] };
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchpit']);
  if (!adopted.success || !isRecord(adopted.value) || adopted.value.type !== 'folder') {
    return { issues: [...adopted.issues, folderIssue('metadata-invalid', sourceId)] };
  }
  const metadata = adopted.value;
  if (!isRecord(metadata.schemas) || !sameArtifactRef(metadata.schema, folderSchemaArtifact)) {
    return { issues: [folderIssue('metadata-invalid', sourceId)] };
  }
  const parsedDeclaration = safeParseDocumentDeclaration(metadata.declaration);
  if (!parsedDeclaration.success) {
    return { issues: [...parsedDeclaration.issues, folderIssue('metadata-invalid', sourceId)] };
  }
  const declaration = parsedDeclaration.value;
  if (!sameDocumentDeclaration(declaration, folderOwnedAttachment.declaration)) {
    return { issues: [folderIssue('metadata-invalid', sourceId)] };
  }
  const interopIssue = patchworkMetadataIssue(document, 'folder', sourceId);
  return {
    attachment: { declaration, artifacts: metadata.schemas },
    issues: interopIssue === undefined ? [] : [interopIssue],
  };
};

const folderIssue = (
  kind: string,
  sourceId: string,
  severity: 'error' | 'warning' = 'error',
) => createIssue({
  code: `patchpit.folder.${kind}`,
  phase: 'parse',
  severity,
  sourceId,
});
