import * as Automerge from '@automerge/automerge';
import {
  createFsAttachment,
  fsEntriesRelation,
  fsSchemaArtifact,
  type FsEntry,
} from '@patchpit/fs';
import {
  AutomergeAtomicSource,
  AutomergeMappedStorageBinding,
  AutomergeSourceRuntime,
  type AutomergeSourceRuntimeApi,
} from '@tarstate/automerge';
import {
  CapabilityRegistry,
  ExactArtifactResolver,
  ResourceResolver,
  canonicalizeJson,
  exactArtifactAttachmentResolver,
  normalizeArtifactRef,
  prepareDatabaseAttachment,
  registerBuiltInCapabilities,
  sealStorageMapping,
  type DocumentDeclaration,
} from '@tarstate/core';

export type AutomergeFsFile = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType?: string;
  readonly entryId: string;
  readonly name: string;
  readonly order: number;
  readonly parentId: string | null;
  readonly resourceRef: string;
};

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

export type AutomergeFsFolderDoc = {
  readonly '@patchpit': typeof automergeFsDocumentMetadata;
  readonly entries: Record<string, StoredFsEntry>;
};

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

type AutomergeFsPackage = {
  readonly files: readonly (readonly [resourceRef: string, doc: AutomergeFileContentDoc])[];
  readonly folder: AutomergeFsFolderDoc;
};

export const automergeFsPackageFromFiles = (
  files: readonly AutomergeFsFile[],
): AutomergeFsPackage => ({
  files: files.filter(({ resourceRef }) => !resourceRef.startsWith('https:'))
    .map((file) => [
      file.resourceRef,
      createAutomergeFileContentDocument(file.bytes, file.contentType),
    ] as const),
  folder: {
    '@patchpit': automergeFsDocumentMetadata,
    entries: Object.fromEntries(files.map(({
      bytes: _bytes,
      contentType: _contentType,
      entryId,
      ...entry
    }) => [entryId, { ...entry, kind: 'file' }])),
  },
});

export function openAutomergeFsFolder(
  runtime: AutomergeSourceRuntimeApi<AutomergeFsFolderDoc>,
): Promise<Awaited<ReturnType<typeof projectAutomergeFsFolder>>>;
export function openAutomergeFsFolder(
  sourceId: string,
  folder: AutomergeFsFolderDoc,
): Promise<Awaited<ReturnType<typeof projectAutomergeFsFolder>>>;
export async function openAutomergeFsFolder(
  runtimeOrSourceId: AutomergeSourceRuntimeApi<AutomergeFsFolderDoc> | string,
  folder?: AutomergeFsFolderDoc,
) {
  if (typeof runtimeOrSourceId === 'string' && folder === undefined) {
    throw new TypeError('A folder document is required with a source ID');
  }
  const runtime = typeof runtimeOrSourceId === 'string'
    ? new AutomergeSourceRuntime({ sourceId: runtimeOrSourceId, doc: Automerge.from(folder!) })
    : runtimeOrSourceId;
  return projectAutomergeFsFolder(runtime);
}

/** Takes ownership of the runtime, not of any Repo handle behind it. */
const projectAutomergeFsFolder = async (runtime: AutomergeSourceRuntimeApi<AutomergeFsFolderDoc>) => {
  const source = new AutomergeAtomicSource({
    runtime,
    operationEpoch: `${runtime.sourceId}:operations:${crypto.randomUUID()}`,
    ownsRuntime: true,
  });
  try {
    const snapshot = source.snapshot();
    if (snapshot.state !== 'ready' || snapshot.storage === undefined) {
      throw new Error('Automerge filesystem source is unavailable', { cause: snapshot.issues });
    }
    const metadata = inertAutomergeValue(Automerge.toJS(snapshot.storage)['@patchpit']);
    const registry = new CapabilityRegistry('patchpit.automerge-fs@1');
    await registerBuiltInCapabilities(registry);
    const schemas = isRecord(metadata) && isRecord(metadata.schemas) ? metadata.schemas : {};
    const resolver = new ExactArtifactResolver({
      resourceResolver: new ResourceResolver({ authority: { permits: () => false } }),
      embedded: { get: (reference) => schemas[reference.id] },
    });
    const prepared = await prepareDatabaseAttachment({
      sourceId: source.sourceId,
      bootstrap: filesystemBootstrap(metadata),
      resolveArtifact: exactArtifactAttachmentResolver(resolver, {
        authorityScope: 'patchpit.automerge-fs',
      }),
      registry,
    });
    if (prepared.state !== 'ready' || prepared.mapping === undefined) {
      throw new Error('Automerge filesystem attachment is unavailable', { cause: prepared.issues });
    }
    const binding = new AutomergeMappedStorageBinding<AutomergeFsFolderDoc>({
      id: 'patchpit.automerge-fs.mapping',
      locatorNamespace: source.sourceId,
      mapping: prepared.mapping,
      registry,
    });
    const attachment = createFsAttachment({
      source,
      close: () => source.close(),
      project: (snapshot) => {
        const projection = binding.project(snapshot);
        return {
          entries: projection.rows.map(({ fields }) => fields as FsEntry),
          occurrenceIds: projection.rows.map(({ locator }) => canonicalizeJson(locator)),
          completeness: projection.completeness,
          issues: projection.issues,
        };
      },
    });
    return { attachment, close: () => source.close() };
  } catch (error) {
    source.close();
    throw error;
  }
};

const filesystemBootstrap = (metadata: unknown) => {
  if (!isRecord(metadata)
    || metadata.type !== automergeFsDocumentMetadata.type
    || !isRecord(metadata.schema)
    || metadata.schema.id !== automergeFsDocumentMetadata.schema.id
    || metadata.schema.contentHash !== automergeFsDocumentMetadata.schema.contentHash
    || !isRecord(metadata.schemas)
    || !isRecord(metadata.declaration)
    || !isRecord(metadata.declaration.storageSchema)
    || metadata.schema.id !== metadata.declaration.storageSchema.id
    || metadata.schema.contentHash !== metadata.declaration.storageSchema.contentHash) {
    return { status: 'malformed' as const };
  }
  return { status: 'ready' as const, declaration: metadata.declaration };
};

const inertAutomergeValue = (value: unknown): unknown => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Automerge metadata is not JSON data');
  return JSON.parse(encoded) as unknown;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
