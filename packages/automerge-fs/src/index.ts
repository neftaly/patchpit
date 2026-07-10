import * as Automerge from '@automerge/automerge';
import {
  createFsAttachment,
  fsEntriesRelation,
  parseFsEntry,
  type FsAttachment,
  type FsEntry,
} from '@patchpit/fs';
import {
  AutomergeAtomicSource,
  AutomergeMapStorageBinding,
  AutomergeSourceRuntime,
} from '@tarstate/automerge';
import type { JsonValue } from '@tarstate/core';

export type AutomergeFsFile = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType?: string;
  readonly entryId: string;
  readonly name: string;
  readonly order: number;
  readonly parentId: string | null;
  readonly resourceRef: string;
};

type AutomergeFileContentDoc = {
  readonly kind: 'patchpit.file-content@1';
  readonly contentType?: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
};

type StoredFsEntry = Omit<FsEntry, 'entryId'>;
type ProjectedFsEntry = FsEntry & Readonly<Record<string, JsonValue>>;

export type AutomergeFsFolderDoc = {
  readonly kind: 'patchpit.fs-folder@1';
  readonly entries: Record<string, StoredFsEntry>;
};

type AutomergeFsPackage = {
  readonly files: readonly (readonly [resourceRef: string, doc: AutomergeFileContentDoc])[];
  readonly folder: AutomergeFsFolderDoc;
};

export const automergeFsPackageFromFiles = (
  files: readonly AutomergeFsFile[],
): AutomergeFsPackage => ({
  files: files.map((file) => [file.resourceRef, {
    bytes: file.bytes.slice(),
    ...(file.contentType === undefined ? {} : { contentType: file.contentType }),
    kind: 'patchpit.file-content@1',
  }] as const),
  folder: {
    entries: Object.fromEntries(files.map(({
      bytes: _bytes,
      contentType: _contentType,
      entryId,
      ...entry
    }) => [entryId, { ...entry, kind: 'file' }])),
    kind: 'patchpit.fs-folder@1',
  },
});

export const openAutomergeFsFolder = (
  sourceId: string,
  folder: AutomergeFsFolderDoc,
): { readonly attachment: FsAttachment; readonly runtime: AutomergeSourceRuntime<AutomergeFsFolderDoc> } => {
  const runtime = new AutomergeSourceRuntime({ sourceId, doc: Automerge.from(folder) });
  const source = new AutomergeAtomicSource({
    runtime,
    operationEpoch: `${sourceId}:operations:1`,
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
  return { attachment, runtime };
};
