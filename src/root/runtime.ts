import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import {
  createAutomergeBinaryFileDocument,
  createAutomergeFolderDocument,
  openAutomergeFileDatabase,
  openAutomergeFolderDatabase,
  type AutomergeFolderDocument,
} from '@patchpit/automerge-fs';
import {
  openFolderLinksQuery,
  type FolderLink,
  type FolderLinkRow,
} from '@patchpit/fs';
import {
  APP_FILE_AUTHORITY_SCOPE,
  snapshotFilesystemApp,
} from '@patchpit/sandbox-fs';
import {
  openResourceQuery,
} from '../content/resource-projection.ts';
import { appContentUrl } from '../content/invocation.ts';
import {
  createWorkspaceDocument,
  openWorkspaceRuntime,
  type WorkspaceDocument,
} from '../workspace/runtime.ts';
import { paneIdsInLayoutOrder } from '../workspace/durable-state.ts';
import { openWorkspaceViewState } from '../workspace/view-state-runtime.ts';

const WORKSPACE_LINK_ID = 'workspace';

export type RootSeedFile = {
  readonly linkId: string;
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
  readonly folderId: string;
  readonly files: readonly RootSeedFile[];
  readonly name: string;
  readonly order: number;
};

type RootOptions = {
  readonly repo: Repo;
  readonly folders: readonly RootSeedFolder[];
  readonly initialContext: string;
  readonly documentContextFolderId?: string;
};

export const createRoot = async (options: RootOptions) => {
  const folderHandles = options.folders.map((folder) => options.repo.create(createAutomergeFolderDocument(
    folder.name,
    folder.files.map((file): FolderLink => ({
      linkId: file.linkId,
      name: file.name,
      order: file.order,
      resourceRef: file.resourceUrl
        ?? options.repo.create(createAutomergeBinaryFileDocument(file.bytes, {
          name: file.name,
          ...(file.contentType === undefined ? {} : { mimeType: file.contentType }),
        })).url,
      typeHint: 'file',
    })),
  )));
  const documentContext = options.documentContextFolderId === undefined
    ? undefined
    : folderHandles[options.folders.findIndex(({ folderId }) =>
      folderId === options.documentContextFolderId)]?.url;
  if (options.documentContextFolderId !== undefined && documentContext === undefined) {
    throw new Error('Initial document context folder is unavailable');
  }
  const workspace = options.repo.create(createWorkspaceDocument(
    options.initialContext,
    documentContext === undefined ? undefined : appContentUrl(documentContext),
  ));
  const rootHandle = options.repo.create(createAutomergeFolderDocument('patchpit', [
    folderLink(WORKSPACE_LINK_ID, 'workspace.am', 0, 'file', workspace.url),
    ...options.folders.map((folder, index) => folderLink(
      folder.folderId,
      folder.name,
      folder.order,
      'folder',
      folderHandles[index]?.url ?? unreachableFolder(folder.folderId),
    )),
  ]));
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
    await options.repo.find<AutomergeFolderDocument>(
      options.rootUrl as AutomergeUrl,
      findOptions(options.signal),
    ),
    options.signal,
  );
};

const openRootHandle = async (
  repo: Repo,
  rootHandle: DocHandle<AutomergeFolderDocument>,
  signal?: AbortSignal,
) => {
  const handles = new Map<string, DocHandle<object>>([[rootHandle.url, asObjectHandle(rootHandle)]]);
  const pendingHandles = new Map<string, Promise<DocHandle<object>>>();
  const resolver = new AbortController();
  let closed = false;
  const findResourceHandle = async (resourceRef: string, findSignal = resolver.signal) => {
    const current = handles.get(resourceRef);
    if (current !== undefined) return current;
    const loading = pendingHandles.get(resourceRef)
      ?? repo.find<object>(resourceRef as AutomergeUrl, { signal: findSignal });
    pendingHandles.set(resourceRef, loading);
    try {
      return await loading;
    } finally {
      if (pendingHandles.get(resourceRef) === loading) pendingHandles.delete(resourceRef);
    }
  };
  const rootOpened = await openAutomergeFolderDatabase(asObjectHandle(rootHandle));
  if (!rootOpened.success) {
    throw new Error('Patchpit root folder is unavailable', { cause: rootOpened.issues });
  }
  const filesystem = rootOpened.value;
  const openFolderSource = async ({ sourceId, signal: openSignal }: {
    readonly sourceId: string;
    readonly signal: AbortSignal;
  }) => {
    if (closed || !isValidAutomergeUrl(sourceId)) return undefined;
    const handle = await abortable(findResourceHandle(sourceId, openSignal), openSignal);
    const opened = await openAutomergeFolderDatabase(handle);
    if (!opened.success) return { state: 'failed' as const, issues: opened.issues };
    if (closed || openSignal.aborted) {
      opened.value.close();
      return undefined;
    }
    handles.set(sourceId, handle);
    return opened.value;
  };
  const resourceQuery = await openResourceQuery({ root: filesystem, openSource: openFolderSource }).catch(
    (error: unknown) => {
      filesystem.close();
      throw error;
    },
  );
  let workspaceHandle: DocHandle<WorkspaceDocument>;
  try {
    const workspaceLink = await readWorkspaceLink(filesystem, rootHandle.url);
    if (!isValidAutomergeUrl(workspaceLink.resourceRef)) {
      throw new Error('Patchpit workspace document reference is invalid');
    }
    workspaceHandle = await repo.find<WorkspaceDocument>(workspaceLink.resourceRef, findOptions(signal));
    handles.set(workspaceLink.resourceRef, asObjectHandle(workspaceHandle));
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
  const resolveResourceDocument = async (resourceRef: string) => {
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)
      || !isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await findResourceHandle(resourceRef);
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)) return undefined;
    handles.set(resourceRef, handle);
    return handle;
  };
  const createAppSnapshot = async (rootFolderRef: string, snapshotSignal?: AbortSignal) => {
    if (!isValidAutomergeUrl(rootFolderRef)) throw new Error('App folder reference is invalid');
    const folderHandle = await findResourceHandle(rootFolderRef, snapshotSignal);
    const folderOpened = await openAutomergeFolderDatabase(folderHandle, APP_FILE_AUTHORITY_SCOPE);
    if (!folderOpened.success) {
      throw new Error('App folder is invalid', { cause: folderOpened.issues });
    }
    try {
      return await snapshotFilesystemApp({
        root: folderOpened.value,
        rootFolderRef,
        ...(snapshotSignal === undefined ? {} : { signal: snapshotSignal }),
        openSource: async ({ sourceId, signal: openSignal }) => {
          if (closed || !isValidAutomergeUrl(sourceId)) return undefined;
          const handle = await abortable(findResourceHandle(sourceId, openSignal), openSignal);
          const folder = await openAutomergeFolderDatabase(handle, APP_FILE_AUTHORITY_SCOPE);
          if (folder.success) return folder.value;
          const file = await openAutomergeFileDatabase(handle, APP_FILE_AUTHORITY_SCOPE);
          return file.success ? file.value : { state: 'failed' as const, issues: file.issues };
        },
      });
    } finally {
      folderOpened.value.close();
    }
  };
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

const rootReferencesResource = (resourceQuery: ResourceRuntime, resourceRef: string) => {
  const snapshot = resourceQuery.getSnapshot();
  return snapshot.state === 'open'
    && snapshot.current.rows.some((link) => link.resourceRef === resourceRef);
};

const readWorkspaceLink = async (
  filesystem: Parameters<typeof openFolderLinksQuery>[0][number],
  rootSourceId: string,
) => {
  const query = await openFolderLinksQuery([filesystem]);
  try {
    const result = await query.whenSettled();
    if (result.readiness !== 'ready' || result.completeness !== 'exact') {
      throw new Error('Patchpit root links are unavailable', { cause: result.issues });
    }
    return requireWorkspaceLink(result.rows, rootSourceId);
  } finally {
    query.close();
  }
};

const requireWorkspaceLink = (links: readonly FolderLinkRow[], rootSourceId: string) => {
  const workspace = links.find(({ linkId, sourceId }) =>
    linkId === WORKSPACE_LINK_ID && sourceId === rootSourceId);
  if (workspace?.typeHint === 'folder') throw new Error('Patchpit root links are missing');
  if (workspace === undefined) throw new Error('Patchpit root links are missing');
  return workspace;
};

const folderLink = (
  linkId: string,
  name: string,
  order: number,
  typeHint: string,
  resourceRef: string,
): FolderLink => ({ linkId, name, order, resourceRef, typeHint });
const unreachableFolder = (folderId: string): never => {
  throw new Error(`Created folder is unavailable: ${folderId}`);
};
const asObjectHandle = <T extends object>(handle: DocHandle<T>) =>
  handle as unknown as DocHandle<object>;
const findOptions = (findSignal: AbortSignal | undefined) =>
  findSignal === undefined ? {} : { signal: findSignal };
const abortable = async <Value>(promise: Promise<Value>, abortSignal?: AbortSignal): Promise<Value> => {
  if (abortSignal === undefined) return promise;
  abortSignal.throwIfAborted();
  return new Promise<Value>((resolve, reject) => {
    const aborted = () => reject(abortSignal.reason);
    abortSignal.addEventListener('abort', aborted, { once: true });
    if (abortSignal.aborted) {
      abortSignal.removeEventListener('abort', aborted);
      reject(abortSignal.reason);
      return;
    }
    void promise.then(
      (value) => {
        abortSignal.removeEventListener('abort', aborted);
        resolve(value);
      },
      (error: unknown) => {
        abortSignal.removeEventListener('abort', aborted);
        reject(error);
      },
    );
  });
};
export type PatchpitRuntime = Awaited<ReturnType<typeof createRoot>>;
