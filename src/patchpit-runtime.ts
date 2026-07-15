import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import { toJS } from '@automerge/automerge';
import {
  automergeFsDocumentMetadata,
  createAutomergeFileContentDocument,
  openAutomergeFsFolder,
  type AutomergeFileContentDoc,
  type AutomergeFsFolderDoc,
} from '@patchpit/automerge-fs';
import { parseFsEntry, type FsEntry } from '@patchpit/fs';
import { snapshotFilesystemApp, type AppFileContent } from '@patchpit/sandbox-fs';
import { AutomergeAtomicSource, automergeRepoSourceRuntime } from '@tarstate/automerge';
import { safeParseArtifactValue, type ArtifactRef } from '@tarstate/core';
import { openResources } from './resources.ts';
import {
  createWorkspaceDocument,
  openWorkspace,
  type WorkspaceDocument,
} from './workspace-runtime.ts';
import { workspaceDocumentMetadata } from './workspace-schema.ts';

const workspaceEntryId = 'workspace';

export type RootSeedFile = {
  readonly bytes: readonly number[];
  readonly contentType?: string;
  readonly entryId: string;
  readonly name: string;
  readonly order: number;
  readonly resourceRef: string;
};

export type RootSeedFolder = {
  readonly entryId: string;
  readonly files: readonly RootSeedFile[];
  readonly name: string;
  readonly order: number;
};

type RootOptions = {
  readonly repo: Repo;
  readonly folders: readonly RootSeedFolder[];
  readonly initialContext: string;
  readonly documentContext?: string;
};

export const createRoot = async (options: RootOptions) => {
  const rootHandle = options.repo.create<AutomergeFsFolderDoc>({
    '@patchpit': automergeFsDocumentMetadata,
    entries: {},
  });
  const workspace = options.repo.create(createWorkspaceDocument(
    options.initialContext,
    options.documentContext,
  ));
  const entries: FsEntry[] = [
    rootEntry(workspaceEntryId, 'file', 'workspace.am', 0, null, workspace.url),
  ];

  for (const folder of options.folders) {
    entries.push(rootEntry(folder.entryId, 'folder', folder.name, folder.order, null, rootHandle.url));
    for (const file of folder.files) {
      const entryId = folderFileId(folder.entryId, file.entryId);
      let resourceRef = file.resourceRef;
      if (!resourceRef.startsWith('https:')) {
        resourceRef = options.repo.create(createAutomergeFileContentDocument(
          Uint8Array.from(file.bytes),
          file.contentType,
        )).url;
      }
      entries.push(rootEntry(
        entryId,
        'file',
        file.name,
        file.order,
        folder.entryId,
        resourceRef,
      ));
    }
  }
  rootHandle.change((doc) => {
    const target = doc.entries as Record<string, Omit<FsEntry, 'entryId'>>;
    for (const { entryId, ...entry } of entries) target[entryId] = entry;
  });
  return openRootHandle(options.repo, rootHandle);
};

export const openRoot = async (options: {
  readonly repo: Repo;
  readonly rootUrl: string;
  readonly signal?: AbortSignal;
}) => {
  if (!isValidAutomergeUrl(options.rootUrl)) throw new Error('Invalid Patchpit root URL');
  return openRootHandle(
    options.repo,
    await options.repo.find<AutomergeFsFolderDoc>(options.rootUrl as AutomergeUrl, findOptions(options.signal)),
    options.signal,
  );
};

const openRootHandle = async (
  repo: Repo,
  rootHandle: DocHandle<AutomergeFsFolderDoc>,
  signal?: AbortSignal,
) => {
  const entries = validateRoot(rootHandle);
  await validateMetadata(toJS(rootHandle.doc())['@patchpit'], automergeFsDocumentMetadata);
  const handles = new Map<string, DocHandle<object>>([[rootHandle.url, asObjectHandle(rootHandle)]]);
  const pendingHandles = new Map<string, Promise<DocHandle<object>>>();
  const resolver = new AbortController();
  let closed = false;
  const workspaceEntry = entries.find(({ entryId }) => entryId === workspaceEntryId)!;
  if (!isValidAutomergeUrl(workspaceEntry.resourceRef)) {
    throw new Error('Patchpit workspace document reference is invalid');
  }
  const workspaceHandle = await repo.find<WorkspaceDocument>(
    workspaceEntry.resourceRef,
    findOptions(signal),
  );
  handles.set(workspaceEntry.resourceRef, asObjectHandle(workspaceHandle));
  await validateMetadata(toJS(workspaceHandle.doc())['@patchpit'], workspaceDocumentMetadata);

  const folder = openAutomergeFsFolder(automergeRepoSourceRuntime({ handle: rootHandle }));
  const resources = openResources(folder.attachment);
  const workspace = openWorkspace(workspaceHandle);
  const findResourceHandle = async (resourceRef: string) => {
    const current = handles.get(resourceRef);
    if (current !== undefined) return current;
    const loading = pendingHandles.get(resourceRef)
      ?? repo.find<object>(resourceRef as AutomergeUrl, { signal: resolver.signal });
    pendingHandles.set(resourceRef, loading);
    try {
      return await loading;
    } finally {
      if (pendingHandles.get(resourceRef) === loading) pendingHandles.delete(resourceRef);
    }
  };
  const resolve = async (resourceRef: string) => {
    if (closed) return undefined;
    if (!rootReferences(rootHandle, resourceRef)) {
      handles.delete(resourceRef);
      return undefined;
    }
    if (!isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await findResourceHandle(resourceRef);
    if (closed || !rootReferences(rootHandle, resourceRef)) return undefined;
    validateFileContent(rootHandle, resourceRef, handle.doc());
    handles.set(resourceRef, handle);
    return handle;
  };
  const readAppFileContent = async (resourceRef: string, signal?: AbortSignal) => {
    if (closed || !isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await abortable(findResourceHandle(resourceRef), signal);
    if (closed) return undefined;
    const source = new AutomergeAtomicSource({
      runtime: automergeRepoSourceRuntime({
        handle: handle as unknown as DocHandle<AppFileContent>,
      }),
      operationEpoch: `patchpit:app-read:${crypto.randomUUID()}`,
      ownsRuntime: true,
    });
    try {
      const snapshot = source.snapshot();
      if (snapshot.storage !== undefined && fileContent(snapshot.storage) !== undefined) {
        handles.set(resourceRef, handle);
      }
      return snapshot;
    } finally {
      source.close();
    }
  };
  const snapshotApp = (rootEntryId: string, signal?: AbortSignal) => snapshotFilesystemApp({
    filesystem: folder.attachment,
    rootEntryId,
    ...(signal === undefined ? {} : { signal }),
    read: async (resourceRef, readSignal) => {
      const content = await readAppFileContent(resourceRef, readSignal);
      if (content === undefined) throw new Error(`App file content is unavailable: ${resourceRef}`);
      return content;
    },
  });
  return {
    rootUrl: rootHandle.url,
    folder,
    resources,
    workspace,
    resolve,
    snapshotApp,
    close: () => {
      closed = true;
      resolver.abort();
      pendingHandles.clear();
      resources.close();
      workspace.close();
    },
  };
};

const rootReferences = (handle: DocHandle<AutomergeFsFolderDoc>, resourceRef: string) =>
  Object.values(handle.doc().entries).some((entry) => entry.resourceRef === resourceRef);

const validateFileContent = (
  root: DocHandle<AutomergeFsFolderDoc>,
  resourceRef: string,
  doc: object,
) => {
  const isContentFile = Object.entries(root.doc().entries).some(([entryId, entry]) =>
    entryId !== workspaceEntryId && entry.kind === 'file'
      && entry.resourceRef === resourceRef);
  if (isContentFile && fileContent(doc) === undefined) {
    throw new Error(`Patchpit file content is invalid: ${resourceRef}`);
  }
};

const fileContent = (doc: object): AutomergeFileContentDoc | undefined =>
  'kind' in doc && doc.kind === 'patchpit.file-content@1'
    && 'bytes' in doc && doc.bytes instanceof Uint8Array
    && (!('contentType' in doc) || doc.contentType === undefined || typeof doc.contentType === 'string')
    ? doc as AutomergeFileContentDoc
    : undefined;

const validateRoot = (handle: DocHandle<AutomergeFsFolderDoc>) => {
  const doc = handle.doc();
  if (doc.entries === null || typeof doc.entries !== 'object') {
    throw new Error('Patchpit root document is invalid');
  }
  let entries: readonly FsEntry[];
  try {
    entries = Object.entries(doc.entries).map(([entryId, entry]) => parseFsEntry({ ...entry, entryId }));
  } catch (cause) {
    throw new Error('Patchpit root entries are invalid', { cause });
  }
  const workspace = entries.find(({ entryId }) => entryId === workspaceEntryId);
  if (workspace?.kind !== 'file') {
    throw new Error('Patchpit root entries are missing');
  }
  const byId = new Map(entries.map((entry) => [entry.entryId, entry]));
  for (const entry of entries) {
    if (entry.parentId !== null && byId.get(entry.parentId)?.kind !== 'folder') {
      throw new Error(`Patchpit root parent is invalid: ${entry.name}`);
    }
  }
  return entries;
};

type DocumentMetadata = {
  readonly type: string;
  readonly schema: ArtifactRef;
  readonly schemas: Readonly<Record<string, unknown>>;
};

const validateMetadata = async (value: unknown, expected: DocumentMetadata) => {
  if (!isRecord(value) || value.type !== expected.type || !isRecord(value.schema)
    || value.schema.id !== expected.schema.id
    || value.schema.contentHash !== expected.schema.contentHash
    || !isRecord(value.schemas)) {
    throw new Error(`Patchpit ${expected.type} metadata is invalid`);
  }
  const artifact = await safeParseArtifactValue(structuredClone(value.schemas[expected.schema.id]));
  if (!artifact.success || artifact.value.kind !== 'schema'
    || artifact.value.id !== expected.schema.id
    || artifact.value.contentHash !== expected.schema.contentHash) {
    throw new Error(`Patchpit ${expected.type} schema is invalid`, {
      cause: artifact.success ? undefined : artifact.issues,
    });
  }
};

const rootEntry = (
  entryId: string,
  kind: FsEntry['kind'],
  name: string,
  order: number,
  parentId: string | null,
  resourceRef: string,
): FsEntry => ({ entryId, kind, name, order, parentId, resourceRef });

const folderFileId = (folderEntryId: string, fileEntryId: string) => `${folderEntryId}:${fileEntryId}`;
const asObjectHandle = <T extends object>(handle: DocHandle<T>) =>
  handle as unknown as DocHandle<object>;
const findOptions = (signal: AbortSignal | undefined) => signal === undefined ? {} : { signal };
const abortable = async <Value>(promise: Promise<Value>, signal?: AbortSignal): Promise<Value> => {
  if (signal === undefined) return promise;
  signal.throwIfAborted();
  return new Promise<Value>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', aborted);
        reject(error);
      },
    );
  });
};
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type PatchpitRuntime = Awaited<ReturnType<typeof createRoot>>;
