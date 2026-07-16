import {
  getConflicts,
  getHeads,
} from '@automerge/automerge';
import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import {
  automergeFsDocumentMetadata,
  createAutomergeFileContentDocument,
  openAutomergeFsDocument,
  type AutomergeFileContentDoc,
  type AutomergeFsDocument,
} from '@patchpit/automerge-fs';
import type { FsEntry, FsEntryRow } from '@patchpit/fs';
import { snapshotFilesystemApp, type AppFileContent } from '@patchpit/sandbox-fs';
import { createIssue } from '@tarstate/core';
import type { SourceSnapshot } from '@tarstate/core/source';
import {
  openResources,
  resourcesFromSnapshot,
} from '../content/resources.ts';
import {
  createWorkspaceDocument,
  openWorkspace,
  type WorkspaceDocument,
} from '../workspace/runtime.ts';
import { paneIdsInLayoutOrder } from '../workspace/model.ts';
import { openWorkspacePresence } from '../workspace/presence-runtime.ts';

const workspaceEntryId = 'workspace';

export type RootSeedFile = {
  readonly bytes: Uint8Array<ArrayBuffer>;
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
  const rootHandle = options.repo.create<AutomergeFsDocument>({
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
          file.bytes,
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
    await options.repo.find<AutomergeFsDocument>(options.rootUrl as AutomergeUrl, findOptions(options.signal)),
    options.signal,
  );
};

const openRootHandle = async (
  repo: Repo,
  rootHandle: DocHandle<AutomergeFsDocument>,
  signal?: AbortSignal,
) => {
  const handles = new Map<string, DocHandle<object>>([[rootHandle.url, asObjectHandle(rootHandle)]]);
  const pendingHandles = new Map<string, Promise<DocHandle<object>>>();
  const resolver = new AbortController();
  let closed = false;
  const filesystem = await openAutomergeFsDocument(rootHandle);
  const resources = openResources(filesystem);
  let workspaceHandle: DocHandle<WorkspaceDocument>;
  try {
    const entries = validateRoot(currentResources(resources));
    const workspaceEntry = entries.find(({ entryId }) => entryId === workspaceEntryId)!;
    if (!isValidAutomergeUrl(workspaceEntry.resourceRef)) {
      throw new Error('Patchpit workspace document reference is invalid');
    }
    workspaceHandle = await repo.find<WorkspaceDocument>(
      workspaceEntry.resourceRef,
      findOptions(signal),
    );
    handles.set(workspaceEntry.resourceRef, asObjectHandle(workspaceHandle));
  } catch (error) {
    resources.close();
    filesystem.close();
    throw error;
  }
  const workspace = await openWorkspace(workspaceHandle).catch((error: unknown) => {
    resources.close();
    filesystem.close();
    throw error;
  });
  const initialWorkspace = workspace.getSnapshot();
  if (initialWorkspace.state !== 'ready') {
    resources.close();
    filesystem.close();
    workspace.close();
    throw new Error('Patchpit workspace is unavailable');
  }
  const initialPaneIds = paneIdsInLayoutOrder(initialWorkspace.workspace);
  const workspacePresence = openWorkspacePresence({
    sourceId: `${rootHandle.url}:presence:${crypto.randomUUID()}`,
    workspace: initialWorkspace.workspace,
    activePaneId: initialPaneIds[1] ?? initialPaneIds[0] ?? null,
  });
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
    if (!rootReferences(resources, resourceRef)) {
      handles.delete(resourceRef);
      return undefined;
    }
    if (!isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await findResourceHandle(resourceRef);
    if (closed || !rootReferences(resources, resourceRef)) return undefined;
    validateFileContent(resources, resourceRef, handle.doc());
    handles.set(resourceRef, handle);
    return handle;
  };
  const readAppFileContent = async (
    resourceRef: string,
    signal?: AbortSignal,
  ): Promise<SourceSnapshot<AppFileContent> | undefined> => {
    if (closed || !isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await abortable(findResourceHandle(resourceRef), signal);
    if (closed) return undefined;
    const document = handle.doc();
    if (document === undefined) return undefined;
    const basis = { kind: 'automerge-heads', heads: [...getHeads(document)].sort() } as const;
    const content = parseFileContentDocument(document);
    if (!content.success) {
      return {
        sourceId: handle.url,
        operationEpoch: `patchpit:app-read:${handle.url}`,
        basis,
        state: 'ready',
        freshness: 'current',
        storage: document,
        issues: [createIssue({
          code: `patchpit.app.file-content-${content.reason}`,
          phase: 'parse',
          severity: 'error',
          sourceId: handle.url,
        })],
      };
    }
    const snapshot: SourceSnapshot<AppFileContent> = {
      sourceId: handle.url,
      operationEpoch: `patchpit:app-read:${handle.url}`,
      basis,
      state: 'ready',
      freshness: 'current',
      storage: content.value,
      issues: [],
    };
    handles.set(resourceRef, handle);
    return snapshot;
  };
  const snapshotApp = (rootEntryId: string, signal?: AbortSignal) => snapshotFilesystemApp({
    filesystem,
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
    resources,
    workspace,
    workspacePresence,
    resolve,
    snapshotApp,
    close: () => {
      closed = true;
      resolver.abort();
      pendingHandles.clear();
      resources.close();
      filesystem.close();
      workspace.close();
      workspacePresence.close();
    },
  };
};

type ResourceRuntime = ReturnType<typeof openResources>;

const rootReferences = (resources: ResourceRuntime, resourceRef: string) =>
  currentResources(resources).some((entry) => entry.resourceRef === resourceRef);

const validateFileContent = (
  resources: ResourceRuntime,
  resourceRef: string,
  doc: object,
) => {
  const isContentFile = currentResources(resources).some((entry) =>
      entry.entryId !== workspaceEntryId && entry.kind === 'file'
      && entry.resourceRef === resourceRef);
  if (isContentFile && !parseFileContentDocument(doc).success) {
    throw new Error(`Patchpit file content is invalid: ${resourceRef}`);
  }
};

const currentResources = (resources: ResourceRuntime): readonly FsEntryRow[] => {
  const snapshot = resources.observer.getSnapshot();
  if (snapshot.state !== 'open' || snapshot.current.completeness !== 'exact') {
    throw new Error('Patchpit root entries are unavailable');
  }
  return resourcesFromSnapshot(snapshot);
};

const parseFileContentDocument = (doc: object):
  | { readonly success: true; readonly value: AutomergeFileContentDoc }
  | { readonly success: false; readonly reason: 'conflict' | 'invalid' } => {
  if (['kind', 'bytes', 'contentType'].some((field) => getConflicts(doc, field) !== undefined)) {
    return { success: false, reason: 'conflict' };
  }
  return 'kind' in doc && doc.kind === 'patchpit.file-content@1'
    && 'bytes' in doc && doc.bytes instanceof Uint8Array
    && (!('contentType' in doc) || doc.contentType === undefined || typeof doc.contentType === 'string')
    ? { success: true, value: doc as AutomergeFileContentDoc }
    : { success: false, reason: 'invalid' };
};

const validateRoot = (entries: readonly FsEntryRow[]) => {
  const workspace = entries.find(({ entryId }) => entryId === workspaceEntryId);
  if (workspace?.kind !== 'file') {
    throw new Error('Patchpit root entries are missing');
  }
  return entries;
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
export type PatchpitRuntime = Awaited<ReturnType<typeof createRoot>>;
