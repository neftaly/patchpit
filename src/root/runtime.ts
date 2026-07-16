import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import {
  automergeFsDocumentMetadata,
  createAutomergeBinaryFileDocument,
  openAutomergeFileDatabase,
  openAutomergeFsDocument,
  type AutomergeFsDocument,
} from '@patchpit/automerge-fs';
import type { FsEntry, FsEntryRow } from '@patchpit/fs';
import {
  APP_FILE_AUTHORITY_SCOPE,
  snapshotFilesystemApp,
} from '@patchpit/sandbox-fs';
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
          ?? options.repo.create(createAutomergeBinaryFileDocument(file.bytes, {
            name: file.name,
            ...(file.contentType === undefined ? {} : { mimeType: file.contentType }),
          })).url;
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
    const workspaceEntry = requireWorkspaceEntry(requireResourceRows(resourceQuery));
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
    handles.set(resourceRef, handle);
    return handle;
  };
  const createAppSnapshot = (rootEntryId: string, signal?: AbortSignal) => snapshotFilesystemApp({
    filesystem,
    rootEntryId,
    ...(signal === undefined ? {} : { signal }),
    openSource: async ({ sourceId, signal: openSignal }) => {
      if (closed || !isValidAutomergeUrl(sourceId)) return undefined;
      const handle = await abortable(findResourceHandle(sourceId), openSignal);
      if (closed || handle.doc() === undefined) return undefined;
      const opened = await openAutomergeFileDatabase(handle, APP_FILE_AUTHORITY_SCOPE);
      if (!opened.success) {
        throw new Error(`App file content is invalid: ${sourceId}`, { cause: opened.issues });
      }
      if (closed || openSignal.aborted) {
        opened.value.close();
        return undefined;
      }
      handles.set(sourceId, handle);
      return opened.value;
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
      if (closed) return;
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

const requireResourceRows = (resourceQuery: ResourceRuntime): readonly FsEntryRow[] => {
  const snapshot = resourceQuery.getSnapshot();
  if (snapshot.state !== 'open' || snapshot.current.completeness !== 'exact') {
    throw new Error('Patchpit root entries are unavailable');
  }
  return resourceRowsFromQuerySnapshot(snapshot);
};

const requireWorkspaceEntry = (entries: readonly FsEntryRow[]) => {
  const workspace = entries.find(({ entryId }) => entryId === WORKSPACE_ENTRY_ID);
  if (workspace?.kind !== 'file') {
    throw new Error('Patchpit root entries are missing');
  }
  return workspace;
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
