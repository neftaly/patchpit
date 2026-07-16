import { getConflicts } from '@automerge/automerge';
import type { DocHandle } from '@automerge/automerge-repo';
import {
  openAutomergeAttachment,
  type AutomergeAttachment,
} from '@tarstate/automerge';
import { adoptConflictFreeAutomergeJsonValue } from '@tarstate/automerge/values';
import { normalizeArtifactRef } from '@tarstate/core';
import type { DocumentDeclaration } from '@tarstate/core/attachment';
import { sealStorageMapping } from '@tarstate/core/schema';
import {
  fsEntriesRelation,
  fsSchemaArtifact,
  type FsAttachment,
  type FsEntry,
} from '@patchpit/fs';

export type AutomergeFileContentDoc = {
  readonly kind: 'patchpit.file-content@1';
  readonly contentType?: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
};

export const createAutomergeFileContentDocument = (
  bytes: Uint8Array<ArrayBuffer>,
  contentType?: string,
): AutomergeFileContentDoc => ({
  bytes: bytes.slice(),
  ...(contentType === undefined ? {} : { contentType }),
  kind: 'patchpit.file-content@1',
});

type StoredFsEntry = Omit<FsEntry, 'entryId'>;

export type AutomergeFsDocument = {
  readonly '@patchpit': typeof automergeFsDocumentMetadata;
  readonly entries: Record<string, StoredFsEntry>;
};

export type AutomergeFsAttachment = FsAttachment & Pick<AutomergeAttachment, 'close'>;

export const automergeFsStorageMappingArtifact = await sealStorageMapping({
  id: 'urn:patchpit:mapping:automerge-fs@1',
  body: {
    schema: normalizeArtifactRef(fsSchemaArtifact),
    model: 'json-tree-v1',
    relations: {
      [fsEntriesRelation.relationId]: {
        collection: { kind: 'object-map', path: ['entries'], absent: 'invalid' },
        keys: { entryId: { kind: 'map-key', onMismatch: 'reject' } },
        fields: {
          parentId: { path: ['parentId'], write: { kind: 'read-only' } },
          order: { path: ['order'], write: { kind: 'read-only' } },
          kind: { path: ['kind'], write: { kind: 'read-only' } },
          name: { path: ['name'], write: { kind: 'read-only' } },
          resourceRef: { path: ['resourceRef'], write: { kind: 'read-only' } },
        },
      },
    },
  },
});

export const automergeFsDocumentDeclaration: DocumentDeclaration = {
  formatVersion: 1,
  storageSchema: normalizeArtifactRef(fsSchemaArtifact),
  projection: {
    kind: 'storage-mapping',
    storageMapping: normalizeArtifactRef(automergeFsStorageMappingArtifact),
  },
};

export const automergeFsDocumentMetadata = {
  type: 'filesystem',
  schema: normalizeArtifactRef(fsSchemaArtifact),
  declaration: automergeFsDocumentDeclaration,
  schemas: {
    [fsSchemaArtifact.id]: fsSchemaArtifact,
    [automergeFsStorageMappingArtifact.id]: automergeFsStorageMappingArtifact,
  },
} as const;

export const openAutomergeFsDocument = async (
  handle: DocHandle<AutomergeFsDocument>,
): Promise<AutomergeFsAttachment> => {
  const document = handle.doc();
  if (document === undefined) throw new Error('Automerge filesystem source is unavailable');
  const metadata = parseFilesystemMetadata(document);
  const opened = await openAutomergeAttachment({
    handle,
    declaration: metadata.declaration,
    embeddedArtifacts: metadata.schemas,
    authorityScope: 'public',
    attachmentId: `patchpit:fs:${handle.url}`,
  });
  if (!opened.success) {
    throw new Error('Automerge filesystem attachment is unavailable', { cause: opened.issues });
  }
  return opened.value;
};

const parseFilesystemMetadata = (document: AutomergeFsDocument) => {
  if (Object.keys(getConflicts(document, '@patchpit') ?? {}).length > 1) {
    throw new Error('Automerge filesystem metadata is conflicted');
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchpit']);
  if (!adopted.success) {
    throw new Error('Automerge filesystem metadata is invalid', { cause: adopted.issues });
  }
  const input = adopted.value;
  if (!isRecord(input)
    || input.type !== automergeFsDocumentMetadata.type
    || !sameArtifactRef(input.schema, automergeFsDocumentMetadata.schema)
    || !isRecord(input.declaration)
    || !sameArtifactRef(input.declaration.storageSchema, automergeFsDocumentMetadata.schema)
    || !isRecord(input.schemas)) {
    throw new Error('Automerge filesystem metadata is invalid');
  }
  return { declaration: input.declaration, schemas: input.schemas };
};

const sameArtifactRef = (input: unknown, expected: { readonly id: string; readonly contentHash: string }) =>
  isRecord(input) && input.id === expected.id && input.contentHash === expected.contentHash;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
