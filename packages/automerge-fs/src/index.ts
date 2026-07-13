import * as Automerge from '@automerge/automerge';
import {
  createFsAttachment,
  fsEntriesRelation,
  fsSchemaArtifact,
  parseFsEntry,
  type FsEntry,
} from '@patchpit/fs';
import {
  AutomergeAtomicSource,
  AutomergeMapStorageBinding,
  AutomergeSourceRuntime,
  type AutomergeSourceRuntimeApi,
} from '@tarstate/automerge';
import {
  coordinateSourceCommit,
  normalizeArtifactRef,
  sha256Json,
  type JsonValue,
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
type ProjectedFsEntry = FsEntry & Readonly<Record<string, JsonValue>>;

export type AutomergeFsFolderDoc = {
  readonly '@patchpit': typeof automergeFsDocumentMetadata;
  readonly entries: Record<string, StoredFsEntry>;
};

export const automergeFsDocumentMetadata = {
  type: 'filesystem',
  schema: normalizeArtifactRef(fsSchemaArtifact),
  schemas: { [fsSchemaArtifact.id]: fsSchemaArtifact },
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
): ReturnType<typeof projectAutomergeFsFolder>;
export function openAutomergeFsFolder(
  sourceId: string,
  folder: AutomergeFsFolderDoc,
): ReturnType<typeof projectAutomergeFsFolder>;
export function openAutomergeFsFolder(
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
const projectAutomergeFsFolder = (runtime: AutomergeSourceRuntimeApi<AutomergeFsFolderDoc>) => {
  const source = new AutomergeAtomicSource({
    runtime,
    operationEpoch: `${runtime.sourceId}:operations:${crypto.randomUUID()}`,
    ownsRuntime: true,
  });
  const binding = new AutomergeMapStorageBinding<AutomergeFsFolderDoc, ProjectedFsEntry>({
    relationId: fsEntriesRelation.relationId,
    collectionPath: ['entries'],
    missingCollection: 'invalid',
    keySource: 'map-key',
    parse: (candidate, { mapKey, path }) => {
      if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return { success: false, issue: { code: 'automerge.row_invalid', path } };
      }
      return { success: true, row: parseFsEntry({ ...candidate, entryId: mapKey }) as ProjectedFsEntry };
    },
  });
  const attachment = createFsAttachment({
    source,
    close: () => source.close(),
    project: (snapshot) => {
      const projection = binding.project(snapshot);
      return {
        entries: projection.rows.map(({ fields }) => fields),
        occurrenceIds: projection.rows.map(({ locator }) => locator.rowIncarnation),
        completeness: projection.completeness,
        issues: projection.issues,
      };
    },
  });
  const renameEntry = async (input: {
    readonly entryId: string;
    readonly name: string;
    readonly operationId: string;
  }) => {
    const snapshot = source.snapshot();
    const row = binding.project(snapshot).rows.find(({ key }) => key[0] === input.entryId);
    if (row === undefined) throw new Error(`Filesystem entry not found: ${input.entryId}`);
    return coordinateSourceCommit({
      source,
      bindings: [binding],
      edits: [{
        kind: 'replace-fields',
        relationId: fsEntriesRelation.relationId,
        key: row.key,
        locator: row.locator as unknown as JsonValue,
        fields: { name: input.name },
      }],
      commit: {
        operationEpoch: source.operationEpoch,
        operationId: input.operationId,
        intentHash: await sha256Json({
          kind: 'rename-fs-entry',
          sourceId: runtime.sourceId,
          entryId: input.entryId,
          name: input.name,
        }),
        expectedBasis: snapshot.basis,
      },
    });
  };
  return { attachment, close: () => source.close(), renameEntry };
};
