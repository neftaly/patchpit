import * as Automerge from '@automerge/automerge';
import {
  createFsAttachment,
  fsEntriesRelation,
  fsSchemaArtifact,
  safeParseFsEntry,
  type FsEntry,
} from '@patchpit/fs';
import {
  AutomergeAtomicSource,
  AutomergeMapStorageBinding,
  AutomergeSourceRuntime,
  type AutomergeSourceRuntimeApi,
} from '@tarstate/automerge';
import {
  normalizeArtifactRef,
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
      const result = candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)
        ? undefined
        : safeParseFsEntry({ ...candidate, entryId: mapKey }, { path });
      return result?.success === true
        ? { success: true, row: result.value as ProjectedFsEntry }
        : {
            success: false,
            issue: {
              code: 'automerge.row_invalid',
              path,
              ...(result === undefined ? {} : {
                details: { schemaIssueCodes: result.issues.map(({ code }) => code) },
              }),
            },
          };
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
  return { attachment, close: () => source.close() };
};
