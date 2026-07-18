import { getConflicts, isImmutableString } from '@automerge/automerge';
import { adoptConflictFreeAutomergeJsonValue } from '@tarstate/automerge/values';
import {
  canonicalizeJson,
  createIssue,
  type Issue,
  type ParseResult,
} from '@tarstate/core';
import type { DocumentDeclaration } from '@tarstate/core/attachment/declaration';

export type FilesystemDocumentKind = 'folder' | 'file';

export const sameDocumentDeclaration = (
  left: DocumentDeclaration,
  right: DocumentDeclaration,
) => canonicalizeJson(left) === canonicalizeJson(right);

export const selectFilesystemDocumentKind = (
  document: object,
  sourceId: string,
): ParseResult<FilesystemDocumentKind> => {
  if ('@patchpit' in document) return selectOwnedKind(document, sourceId);

  const patchwork = inspectPatchworkKind(document, sourceId);
  if (patchwork.kind !== undefined) return { success: true, value: patchwork.kind, issues: [] };

  const folder = hasPatchworkFolderShape(document);
  const file = hasPatchworkFileShape(document);
  if (folder !== file) return { success: true, value: folder ? 'folder' : 'file', issues: [] };
  return {
    success: false,
    issues: [
      ...(patchwork.issue === undefined ? [] : [patchwork.issue]),
      filesystemSelectionIssue(folder ? 'adapter-ambiguous' : 'adapter-unknown', sourceId),
    ],
  };
};

export const hasPatchworkFolderShape = (document: object): document is {
  readonly title: string;
  readonly docs: readonly object[];
} => 'title' in document && typeof document.title === 'string'
  && 'docs' in document && Array.isArray(document.docs)
  && document.docs.every((link) => isRecord(link)
    && typeof link.name === 'string'
    && typeof link.type === 'string'
    && typeof link.url === 'string'
    && (link.icon === undefined || typeof link.icon === 'string')
    && (link.copyOf === undefined || typeof link.copyOf === 'string'));

export const hasPatchworkFileShape = (document: object): document is {
  readonly content: Uint8Array | string | object;
  readonly extension: string;
  readonly mimeType: string;
  readonly name: string;
} => 'content' in document
  && (document.content instanceof Uint8Array
    || typeof document.content === 'string'
    || isImmutableString(document.content))
  && 'extension' in document && typeof document.extension === 'string'
  && 'mimeType' in document && typeof document.mimeType === 'string'
  && 'name' in document && typeof document.name === 'string';

export const patchworkMetadataIssue = (
  document: object,
  expectedKind: FilesystemDocumentKind,
  sourceId: string,
): Issue | undefined => {
  if (!('@patchwork' in document)) return undefined;
  const issue = (kind: string) => createIssue({
    code: `patchpit.${expectedKind}.${kind}`, phase: 'parse', severity: 'warning', sourceId,
  });
  if (getConflicts(document, '@patchwork') !== undefined) {
    return issue('interop-metadata-conflicted');
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchwork']);
  return adopted.success && isRecord(adopted.value) && adopted.value.type === expectedKind
    ? undefined
    : issue('interop-metadata-invalid');
};

const selectOwnedKind = (
  document: object & { readonly '@patchpit': unknown },
  sourceId: string,
): ParseResult<FilesystemDocumentKind> => {
  if (getConflicts(document, '@patchpit') !== undefined) {
    return { success: false, issues: [filesystemSelectionIssue('metadata-conflicted', sourceId)] };
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchpit']);
  if (!adopted.success || !isRecord(adopted.value) || typeof adopted.value.type !== 'string') {
    return {
      success: false,
      issues: [...adopted.issues, filesystemSelectionIssue('metadata-invalid', sourceId)],
    };
  }
  return adopted.value.type === 'folder' || adopted.value.type === 'file'
    ? { success: true, value: adopted.value.type, issues: adopted.issues }
    : { success: false, issues: [filesystemSelectionIssue('adapter-unknown', sourceId)] };
};

const inspectPatchworkKind = (
  document: object,
  sourceId: string,
): { readonly kind?: FilesystemDocumentKind; readonly issue?: Issue } => {
  if (!('@patchwork' in document)) return {};
  if (getConflicts(document, '@patchwork') !== undefined) {
    return { issue: filesystemSelectionIssue('interop-metadata-conflicted', sourceId, 'warning') };
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchwork']);
  return adopted.success && isRecord(adopted.value)
    && (adopted.value.type === 'folder' || adopted.value.type === 'file')
    ? { kind: adopted.value.type }
    : { issue: filesystemSelectionIssue('interop-metadata-invalid', sourceId, 'warning') };
};

export const filesystemSelectionIssue = (
  kind: string,
  sourceId: string,
  severity: 'error' | 'warning' = 'error',
) => createIssue({
  code: `patchpit.filesystem.${kind}`,
  phase: 'parse',
  severity,
  sourceId,
});

export const sameArtifactRef = (input: unknown, expected: unknown) =>
  isRecord(input) && isRecord(expected)
  && input.id === expected.id && input.contentHash === expected.contentHash;

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
