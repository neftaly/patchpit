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
  fileBinaryAttachment,
  fileForeignBinaryAttachment,
  fileForeignTextAttachment,
  fileTextAttachment,
} from '@patchpit/artifacts';
import {
  fileSchemaArtifact,
} from '@patchpit/fs';
import {
  hasPatchworkFileShape,
  isRecord,
  patchworkMetadataIssue,
  sameArtifactRef,
  sameDocumentDeclaration,
  selectFilesystemDocumentKind,
} from './document-selection.ts';

export {
  fileRelation,
  fileSchemaArtifact,
} from '@patchpit/fs';

const patchworkFileMetadata = { type: 'file' } as const;

type SelectedFileAttachment = {
  readonly declaration: DocumentDeclaration;
  readonly artifacts: Readonly<Record<string, unknown>>;
};

export const automergeBinaryFileDocumentMetadata = {
  type: 'file',
  schema: fileBinaryAttachment.declaration.storageSchema,
  declaration: fileBinaryAttachment.declaration,
  schemas: fileBinaryAttachment.artifacts,
} as const;

export const automergeTextFileDocumentMetadata = {
  type: 'file',
  schema: fileTextAttachment.declaration.storageSchema,
  declaration: fileTextAttachment.declaration,
  schemas: fileTextAttachment.artifacts,
} as const;

type AutomergeFileDocument<Metadata, Content> = {
  readonly '@patchpit': Metadata;
  readonly '@patchwork': typeof patchworkFileMetadata;
  readonly content: Content;
  readonly extension: string;
  readonly mimeType: string;
  readonly name: string;
};

export type AutomergeBinaryFileDocument = AutomergeFileDocument<
  typeof automergeBinaryFileDocumentMetadata,
  Uint8Array<ArrayBuffer>
>;
export type AutomergeTextFileDocument = AutomergeFileDocument<
  typeof automergeTextFileDocumentMetadata,
  string
>;

type FileDocumentOptions = {
  readonly extension?: string;
  readonly mimeType?: string;
  readonly name: string;
};

export const createAutomergeBinaryFileDocument = (
  content: Uint8Array<ArrayBuffer>,
  options: FileDocumentOptions,
): AutomergeBinaryFileDocument => ({
  '@patchpit': automergeBinaryFileDocumentMetadata,
  '@patchwork': patchworkFileMetadata,
  content: content.slice(),
  extension: options.extension ?? extensionOf(options.name),
  mimeType: options.mimeType ?? 'application/octet-stream',
  name: options.name,
});

export const createAutomergeTextFileDocument = (
  content: string,
  options: FileDocumentOptions,
): AutomergeTextFileDocument => ({
  '@patchpit': automergeTextFileDocumentMetadata,
  '@patchwork': patchworkFileMetadata,
  content,
  extension: options.extension ?? extensionOf(options.name),
  mimeType: options.mimeType ?? 'text/plain',
  name: options.name,
});

export const openAutomergeFileDatabase = async (
  handle: DocHandle<object>,
  authorityScope: string,
): Promise<ParseResult<AutomergeDatabase>> => {
  const sourceId = handle.url;
  const document = handle.doc();
  if (document === undefined) {
    return { success: false, issues: [fileIssue('source-unavailable', sourceId)] };
  }
  const kind = selectFilesystemDocumentKind(document, sourceId);
  if (!kind.success) return kind;
  if (kind.value !== 'file') {
    return { success: false, issues: [...kind.issues, fileIssue('type-mismatch', sourceId)] };
  }
  const selected = selectFileAttachment(document, sourceId);
  if (selected.attachment === undefined) return { success: false, issues: selected.issues };
  const opened = await openAutomergeDatabase({
    handle,
    declaration: selected.attachment.declaration,
    embeddedArtifacts: selected.attachment.artifacts,
    authorityScope,
  });
  return opened.success
    ? {
        success: true,
        value: opened.value,
        issues: [...selected.issues, ...opened.issues],
      }
    : { success: false, issues: [...selected.issues, ...opened.issues] };
};

const selectFileAttachment = (
  document: object,
  sourceId: string,
): { readonly attachment: SelectedFileAttachment; readonly issues: readonly Issue[] }
  | { readonly attachment?: undefined; readonly issues: readonly Issue[] } => {
  if ('@patchpit' in document) return selectOwnedFileAttachment(document, sourceId);
  if (!hasPatchworkFileShape(document)) {
    return { issues: [fileIssue('shape-invalid', sourceId)] };
  }
  const interopIssue = patchworkMetadataIssue(document, 'file', sourceId);
  return {
    attachment: document.content instanceof Uint8Array
      ? fileForeignBinaryAttachment
      : fileForeignTextAttachment,
    issues: interopIssue === undefined ? [] : [interopIssue],
  };
};

const selectOwnedFileAttachment = (
  document: object & { readonly '@patchpit': unknown },
  sourceId: string,
): { readonly attachment: SelectedFileAttachment; readonly issues: readonly Issue[] }
  | { readonly attachment?: undefined; readonly issues: readonly Issue[] } => {
  if (getConflicts(document, '@patchpit') !== undefined) {
    return { issues: [fileIssue('metadata-conflicted', sourceId)] };
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchpit']);
  if (!adopted.success || !isRecord(adopted.value) || adopted.value.type !== 'file') {
    return { issues: [...adopted.issues, fileIssue('metadata-invalid', sourceId)] };
  }
  const metadata = adopted.value;
  if (!isRecord(metadata.schemas) || !sameArtifactRef(metadata.schema, fileSchemaArtifact)) {
    return { issues: [fileIssue('metadata-invalid', sourceId)] };
  }
  const parsedDeclaration = safeParseDocumentDeclaration(metadata.declaration);
  if (!parsedDeclaration.success) {
    return { issues: [...parsedDeclaration.issues, fileIssue('metadata-invalid', sourceId)] };
  }
  const declaration = parsedDeclaration.value;
  const attachment = [fileBinaryAttachment, fileTextAttachment].find((candidate) =>
    sameDocumentDeclaration(declaration, candidate.declaration));
  if (attachment === undefined) return { issues: [fileIssue('metadata-invalid', sourceId)] };
  const interopIssue = patchworkMetadataIssue(document, 'file', sourceId);
  return {
    attachment: {
      ...attachment,
      declaration,
      artifacts: metadata.schemas,
    },
    issues: interopIssue === undefined ? [] : [interopIssue],
  };
};

const extensionOf = (name: string) => {
  const separator = name.lastIndexOf('.');
  return separator > 0 && separator < name.length - 1 ? name.slice(separator + 1) : '';
};

const fileIssue = (
  kind: string,
  sourceId: string,
  details: Readonly<Record<string, string | number>> = {},
  severity: 'error' | 'warning' = 'error',
) => createIssue({
  code: `patchpit.file.${kind}`,
  phase: 'parse',
  severity,
  sourceId,
  details,
});
