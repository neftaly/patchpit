import { getConflicts, isImmutableString } from '@automerge/automerge';
import type { DocHandle } from '@automerge/automerge-repo';
import {
  openAutomergeDatabase,
  type AutomergeDatabase,
} from '@tarstate/automerge';
import { adoptConflictFreeAutomergeJsonValue } from '@tarstate/automerge/values';
import {
  builtInCapabilityRefs,
  createIssue,
  normalizeArtifactRef,
  type ArtifactRef,
  type Issue,
  type ParseResult,
} from '@tarstate/core';
import type { DocumentDeclaration } from '@tarstate/core/attachment';
import {
  sealStorageMapping,
  type StoredFieldMapping,
  type StorageMappingBody,
} from '@tarstate/core/schema';
import {
  fileRelation,
  fileSchemaArtifact,
  type FileRow,
} from '@patchpit/fs';

export {
  fileRelation,
  fileSchemaArtifact,
} from '@patchpit/fs';

const patchworkFileMetadata = { type: 'file' } as const;
const replaceContent = {
  kind: 'replace',
  capability: builtInCapabilityRefs.fieldReplace,
} as const;
const readOnly = { kind: 'read-only' } as const;
const absentContent = { kind: 'absent' } as const;

type SelectedFileAttachment = {
  readonly declaration: DocumentDeclaration;
  readonly artifacts: Readonly<Record<string, unknown>>;
};
type FileContentKind = FileRow['contentKind'];

const binaryFileAttachment = await createFileAttachment({
  kind: 'binary',
  mappingId: 'urn:patchpit:mapping:binary-file@1',
  schema: fileSchemaArtifact,
  write: replaceContent,
});
const textFileAttachment = await createFileAttachment({
  kind: 'text',
  mappingId: 'urn:patchpit:mapping:text-file@1',
  schema: fileSchemaArtifact,
  write: replaceContent,
});
const foreignBinaryFileAttachment = await createFileAttachment({
  kind: 'binary',
  mappingId: 'urn:patchpit:mapping:foreign-binary-file@1',
  schema: fileSchemaArtifact,
  write: readOnly,
});
const foreignTextFileAttachment = await createFileAttachment({
  kind: 'text',
  mappingId: 'urn:patchpit:mapping:foreign-text-file@1',
  schema: fileSchemaArtifact,
  write: readOnly,
});

export const automergeBinaryFileDocumentMetadata = {
  type: 'file',
  schema: normalizeArtifactRef(fileSchemaArtifact),
  declaration: binaryFileAttachment.declaration,
  schemas: binaryFileAttachment.artifacts,
} as const;

export const automergeTextFileDocumentMetadata = {
  type: 'file',
  schema: normalizeArtifactRef(fileSchemaArtifact),
  declaration: textFileAttachment.declaration,
  schemas: textFileAttachment.artifacts,
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
  if (getConflicts(document, 'content') !== undefined) {
    return { issues: [fileIssue('content-conflicted', sourceId)] };
  }
  if (!hasPatchworkFileShape(document)) {
    return { issues: [fileIssue('shape-invalid', sourceId)] };
  }
  const interopIssue = patchworkMetadataIssue(document, sourceId);
  return {
    attachment: document.content instanceof Uint8Array
      ? foreignBinaryFileAttachment
      : foreignTextFileAttachment,
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
  if (!isRecord(metadata.declaration) || !isRecord(metadata.schemas)) {
    return { issues: [fileIssue('metadata-invalid', sourceId)] };
  }
  if (!sameArtifactRef(metadata.schema, fileSchemaArtifact)
    || !sameArtifactRef(metadata.declaration.storageSchema, metadata.schema)) {
    return { issues: [fileIssue('metadata-invalid', sourceId)] };
  }
  const declaration = metadata.declaration as DocumentDeclaration;
  const attachment = [binaryFileAttachment, textFileAttachment].find((candidate) =>
    sameStorageMapping(declaration, candidate.declaration));
  if (attachment === undefined) return { issues: [fileIssue('metadata-invalid', sourceId)] };
  const interopIssue = patchworkMetadataIssue(document, sourceId);
  return {
    attachment: {
      ...attachment,
      declaration,
      artifacts: metadata.schemas,
    },
    issues: interopIssue === undefined ? [] : [interopIssue],
  };
};

const hasPatchworkFileShape = (document: object): document is {
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

const patchworkMetadataIssue = (document: object, sourceId: string): Issue | undefined => {
  if (!('@patchwork' in document)) return undefined;
  if (getConflicts(document, '@patchwork') !== undefined) {
    return fileIssue('interop-metadata-conflicted', sourceId, {}, 'warning');
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchwork']);
  return adopted.success && isRecord(adopted.value) && adopted.value.type === 'file'
    ? undefined
    : fileIssue('interop-metadata-invalid', sourceId, {}, 'warning');
};

async function createFileAttachment(input: {
  readonly kind: FileContentKind;
  readonly mappingId: string;
  readonly schema: typeof fileSchemaArtifact;
  readonly write: StoredFieldMapping['write'];
}): Promise<SelectedFileAttachment> {
  const schema = normalizeArtifactRef(input.schema);
  const mapping = await sealStorageMapping({
    id: input.mappingId,
    body: fileStorageMapping(schema, input.kind, input.write),
  });
  return {
    declaration: fileDeclaration(schema, normalizeArtifactRef(mapping)),
    artifacts: {
      [input.schema.id]: input.schema,
      [mapping.id]: mapping,
    },
  };
}

const sameStorageMapping = (left: DocumentDeclaration, right: DocumentDeclaration) =>
  left.projection.kind === 'storage-mapping'
  && right.projection.kind === 'storage-mapping'
  && sameArtifactRef(left.projection.storageMapping, right.projection.storageMapping);

function fileStorageMapping(
  schema: ArtifactRef,
  contentKind: FileContentKind,
  contentWrite: StoredFieldMapping['write'],
): StorageMappingBody {
  return {
    schema,
    model: 'json-tree-v1',
    relations: {
      [fileRelation.relationId]: {
        collection: { kind: 'singleton', path: [], absent: 'invalid' },
        keys: {
          id: { kind: 'literal', value: 'file' },
          contentKind: { kind: 'literal', value: contentKind },
        },
        fields: {
          binaryContent: contentKind === 'binary'
            ? { path: ['content'], write: contentWrite }
            : absentContent,
          textContent: contentKind === 'text'
            ? { path: ['content'], write: contentWrite }
            : absentContent,
          extension: { path: ['extension'], write: readOnly },
          mimeType: { path: ['mimeType'], write: readOnly },
          name: { path: ['name'], write: readOnly },
        },
      },
    },
  };
}

function fileDeclaration(
  storageSchema: ArtifactRef,
  storageMapping: ArtifactRef,
): DocumentDeclaration {
  return {
    formatVersion: 1,
    storageSchema,
    projection: { kind: 'storage-mapping', storageMapping },
  };
}

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

const sameArtifactRef = (input: unknown, expected: unknown) =>
  isRecord(input) && isRecord(expected)
  && input.id === expected.id && input.contentHash === expected.contentHash;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
