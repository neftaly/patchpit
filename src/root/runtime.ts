import { getHeads } from '@automerge/automerge';
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
  parseAutomergeFileContentDocument,
  type AutomergeFsDocument,
} from '@patchpit/automerge-fs';
import type { FsEntry, FsEntryRow } from '@patchpit/fs';
import { snapshotFilesystemApp, type AppFileContent } from '@patchpit/sandbox-fs';
import { createIssue } from '@tarstate/core';
import type { SourceSnapshot } from '@tarstate/core/source';
import {
  openResourceQuery,
  resourceRowsFromQuerySnapshot,
} from '../content/resource-projection.ts';
import {
  createWorkspaceDocument,
  openWorkspaceRuntime,
  type WorkspaceDocument,
} from '../workspace/runtime.ts';
import { paneIdsInLayoutOrder } from '../workspace/durable-state.ts';
import { openWorkspaceViewState } from '../workspace/view-state-runtime.ts';

const WORKSPACE_ENTRY_ID = 'workspace';

export type RootSeedFile = {
  readonly entryId: string;
  readonly name: string;
  readonly order: number;
} & ({
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType?: string;
  readonly resourceUrl?: never;
} | {
  readonly bytes?: never;
  readonly contentType?: never;
  readonly resourceUrl: `https:${string}`;
});

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
  const entries: readonly FsEntry[] = [
    rootEntry(WORKSPACE_ENTRY_ID, 'file', 'workspace.am', 0, null, workspace.url),
    ...options.folders.flatMap((folder) => [
      rootEntry(folder.entryId, 'folder', folder.name, folder.order, null, rootHandle.url),
      ...folder.files.map((file) => {
        const entryId = folderFileId(folder.entryId, file.entryId);
        const resourceRef = file.resourceUrl
          ?? options.repo.create(createAutomergeFileContentDocument(file.bytes, file.contentType)).url;
        return rootEntry(
          entryId,
          'file',
          file.name,
          file.order,
          folder.entryId,
          resourceRef,
        );
      }),
    ]),
  ];
  rootHandle.change((doc) => {
    Object.assign(doc.entries, Object.fromEntries(entries.map(({ entryId, ...entry }) => [entryId, entry])));
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
  const resourceQuery = await openResourceQuery(filesystem).catch((error: unknown) => {
    filesystem.close();
    throw error;
  });
  let workspaceHandle: DocHandle<WorkspaceDocument>;
  try {
    const entries = requireValidRootEntries(requireResourceRows(resourceQuery));
    const workspaceEntry = entries.find(({ entryId }) => entryId === WORKSPACE_ENTRY_ID)!;
    if (!isValidAutomergeUrl(workspaceEntry.resourceRef)) {
      throw new Error('Patchpit workspace document reference is invalid');
    }
    workspaceHandle = await repo.find<WorkspaceDocument>(
      workspaceEntry.resourceRef,
      findOptions(signal),
    );
    handles.set(workspaceEntry.resourceRef, asObjectHandle(workspaceHandle));
  } catch (error) {
    resourceQuery.close();
    filesystem.close();
    throw error;
  }
  const workspaceRuntime = await openWorkspaceRuntime(workspaceHandle).catch((error: unknown) => {
    resourceQuery.close();
    filesystem.close();
    throw error;
  });
  const initialWorkspace = workspaceRuntime.getSnapshot();
  if (initialWorkspace.state !== 'ready') {
    resourceQuery.close();
    filesystem.close();
    workspaceRuntime.close();
    throw new Error('Patchpit workspace is unavailable');
  }
  const initialPaneIds = paneIdsInLayoutOrder(initialWorkspace.workspace);
  const workspaceViewStateRuntime = openWorkspaceViewState({
    sourceId: `${rootHandle.url}:view-state:${crypto.randomUUID()}`,
    workspace: initialWorkspace.workspace,
    activePaneId: initialPaneIds.at(-1) ?? null,
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
  const resolveResourceDocument = async (resourceRef: string) => {
    if (closed) return undefined;
    if (!rootReferencesResource(resourceQuery, resourceRef)) {
      handles.delete(resourceRef);
      return undefined;
    }
    if (!isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await findResourceHandle(resourceRef);
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)) return undefined;
    assertValidFileContent(resourceQuery, resourceRef, handle.doc());
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
    const content = parseAutomergeFileContentDocument(document);
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
  const createAppSnapshot = (rootEntryId: string, signal?: AbortSignal) => snapshotFilesystemApp({
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
    resourceQuery,
    workspaceRuntime,
    workspaceViewStateRuntime,
    resolveResourceDocument,
    createAppSnapshot,
    close: () => {
      closed = true;
      resolver.abort();
      pendingHandles.clear();
      resourceQuery.close();
      filesystem.close();
      workspaceRuntime.close();
      workspaceViewStateRuntime.close();
    },
  };
};

type ResourceRuntime = Awaited<ReturnType<typeof openResourceQuery>>;

const rootReferencesResource = (resourceQuery: ResourceRuntime, resourceRef: string) =>
  requireResourceRows(resourceQuery).some((entry) => entry.resourceRef === resourceRef);

const assertValidFileContent = (
  resourceQuery: ResourceRuntime,
  resourceRef: string,
  document: object,
) => {
  const isContentFile = requireResourceRows(resourceQuery).some((entry) =>
    entry.entryId !== WORKSPACE_ENTRY_ID && entry.kind === 'file'
    && entry.resourceRef === resourceRef);
  if (isContentFile && !parseAutomergeFileContentDocument(document).success) {
    throw new Error(`Patchpit file content is invalid: ${resourceRef}`);
  }
};

const requireResourceRows = (resourceQuery: ResourceRuntime): readonly FsEntryRow[] => {
  const snapshot = resourceQuery.getSnapshot();
  if (snapshot.state !== 'open' || snapshot.current.completeness !== 'exact') {
    throw new Error('Patchpit root entries are unavailable');
  }
  return resourceRowsFromQuerySnapshot(snapshot);
};

const requireValidRootEntries = (entries: readonly FsEntryRow[]) => {
  const workspace = entries.find(({ entryId }) => entryId === WORKSPACE_ENTRY_ID);
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

const folderFileId = (folderEntryId: string, fileEntryId: string) =>
  `${encodeURIComponent(folderEntryId)}:${encodeURIComponent(fileEntryId)}`;
const asObjectHandle = <T extends object>(handle: DocHandle<T>) =>
  handle as unknown as DocHandle<object>;
const findOptions = (signal: AbortSignal | undefined) => signal === undefined ? {} : { signal };
const abortable = async <Value>(promise: Promise<Value>, signal?: AbortSignal): Promise<Value> => {
  if (signal === undefined) return promise;
  signal.throwIfAborted();
  return new Promise<Value>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) {
      signal.removeEventListener('abort', aborted);
      reject(signal.reason);
      return;
    }
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
