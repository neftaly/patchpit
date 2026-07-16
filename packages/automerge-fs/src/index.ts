import { getConflicts } from '@automerge/automerge';
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
  type KeyMapping,
  type StoredFieldMapping,
  type StorageMappingBody,
} from '@tarstate/core/schema';
import {
  folderLinksRelation,
  folderRelation,
  folderSchemaArtifact,
  type FolderDatabaseSource,
  type FolderLink,
} from '@patchpit/fs';

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
const replace = {
  kind: 'replace',
  capability: builtInCapabilityRefs.fieldReplace,
} as const;
const readOnly = { kind: 'read-only' } as const;

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

type SelectedFolderAttachment = {
  readonly declaration: DocumentDeclaration;
  readonly artifacts: Readonly<Record<string, unknown>>;
};

const ownedFolderAttachment = await createFolderAttachment({
  mappingId: 'urn:patchpit:mapping:automerge-folder@1',
  linkKey: { kind: 'field', path: ['id'] },
  nameWrite: replace,
});
const foreignFolderAttachment = await createFolderAttachment({
  mappingId: 'urn:patchpit:mapping:foreign-automerge-folder@1',
  linkKey: { kind: 'source-metadata', value: 'collection-element-identity' },
  nameWrite: readOnly,
});

export const automergeFolderDocumentMetadata = {
  type: 'folder',
  schema: normalizeArtifactRef(folderSchemaArtifact),
  declaration: ownedFolderAttachment.declaration,
  schemas: ownedFolderAttachment.artifacts,
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
  const selected = selectFolderAttachment(document, sourceId);
  if (selected.attachment === undefined) return { success: false, issues: selected.issues };
  const opened = await openAutomergeDatabase({
    handle,
    declaration: selected.attachment.declaration,
    embeddedArtifacts: selected.attachment.artifacts,
    authorityScope,
    attachmentId: `patchpit:folder:${sourceId}`,
  });
  return opened.success
    ? {
        success: true,
        value: opened.value,
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
  if (getConflicts(document, 'docs') !== undefined || getConflicts(document, 'title') !== undefined) {
    return { issues: [folderIssue('content-conflicted', sourceId)] };
  }
  if (!hasPatchworkFolderShape(document)) {
    return { issues: [folderIssue('shape-invalid', sourceId)] };
  }
  const interopIssue = patchworkMetadataIssue(document, sourceId);
  return {
    attachment: foreignFolderAttachment,
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
  if (!isRecord(metadata.declaration) || !isRecord(metadata.schemas)
    || !sameArtifactRef(metadata.schema, folderSchemaArtifact)
    || !sameArtifactRef(metadata.declaration.storageSchema, metadata.schema)) {
    return { issues: [folderIssue('metadata-invalid', sourceId)] };
  }
  const declaration = metadata.declaration as DocumentDeclaration;
  if (!sameStorageMapping(declaration, ownedFolderAttachment.declaration)) {
    return { issues: [folderIssue('metadata-invalid', sourceId)] };
  }
  const interopIssue = patchworkMetadataIssue(document, sourceId);
  return {
    attachment: { declaration, artifacts: metadata.schemas },
    issues: interopIssue === undefined ? [] : [interopIssue],
  };
};

async function createFolderAttachment(input: {
  readonly mappingId: string;
  readonly linkKey: KeyMapping;
  readonly nameWrite: StoredFieldMapping['write'];
}): Promise<SelectedFolderAttachment> {
  const schema = normalizeArtifactRef(folderSchemaArtifact);
  const mapping = await sealStorageMapping({
    id: input.mappingId,
    body: folderStorageMapping(schema, input.linkKey, input.nameWrite),
  });
  return {
    declaration: {
      formatVersion: 1,
      storageSchema: schema,
      projection: {
        kind: 'storage-mapping',
        storageMapping: normalizeArtifactRef(mapping),
      },
    },
    artifacts: {
      [folderSchemaArtifact.id]: folderSchemaArtifact,
      [mapping.id]: mapping,
    },
  };
}

function folderStorageMapping(
  schema: ArtifactRef,
  linkKey: KeyMapping,
  nameWrite: StoredFieldMapping['write'],
): StorageMappingBody {
  return {
    schema,
    model: 'json-tree-v1',
    relations: {
      [folderRelation.relationId]: {
        collection: { kind: 'singleton', path: [], absent: 'invalid' },
        keys: { id: { kind: 'literal', value: 'folder' } },
        fields: { title: { path: ['title'], write: readOnly } },
      },
      [folderLinksRelation.relationId]: {
        collection: { kind: 'array', path: ['docs'], absent: 'invalid' },
        keys: { linkId: linkKey },
        fields: {
          order: { kind: 'source-metadata', value: 'collection-position' },
          name: { path: ['name'], write: nameWrite },
          typeHint: { path: ['type'], write: readOnly },
          resourceRef: { path: ['url'], write: readOnly },
          icon: { path: ['icon'], write: readOnly },
          copyOf: { path: ['copyOf'], write: readOnly },
        },
      },
    },
  };
}

const hasPatchworkFolderShape = (document: object): document is {
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

const patchworkMetadataIssue = (document: object, sourceId: string): Issue | undefined => {
  if (!('@patchwork' in document)) return undefined;
  if (getConflicts(document, '@patchwork') !== undefined) {
    return folderIssue('interop-metadata-conflicted', sourceId, 'warning');
  }
  const adopted = adoptConflictFreeAutomergeJsonValue(document['@patchwork']);
  return adopted.success && isRecord(adopted.value) && adopted.value.type === 'folder'
    ? undefined
    : folderIssue('interop-metadata-invalid', sourceId, 'warning');
};

const sameStorageMapping = (left: DocumentDeclaration, right: DocumentDeclaration) =>
  left.projection.kind === 'storage-mapping'
  && right.projection.kind === 'storage-mapping'
  && sameArtifactRef(left.projection.storageMapping, right.projection.storageMapping);

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

const sameArtifactRef = (input: unknown, expected: unknown) =>
  isRecord(input) && isRecord(expected)
  && input.id === expected.id && input.contentHash === expected.contentHash;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
