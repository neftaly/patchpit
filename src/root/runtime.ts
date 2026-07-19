import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import {
  createAutomergeBinaryFileDocument,
  createAutomergeFolderDocument,
  createAutomergeTextFileDocument,
  openAutomergeFileDatabase,
  openAutomergeFilesystemDatabase,
  openAutomergeFolderDatabase,
  type AutomergeFilesystemDatabase,
  type AutomergeFolderDocument,
} from '@patchpit/automerge-fs';
import {
  openFileDocumentQuery,
  openFileDocumentTitlesQuery,
  openFolderDocumentTitlesQuery,
  openFolderGraphQuery,
  openFolderLinksQuery,
  type DocumentTitleRow,
  type FolderLink,
  type FolderLinkRow,
} from '@patchpit/fs';
import type {
  DatabaseQuerySession,
  MountableDatabaseSource,
} from '@tarstate/core/database/session';
import {
  APP_FILE_AUTHORITY_SCOPE,
  snapshotFilesystemApp,
} from '@patchpit/sandbox-fs';
import { appContentUrl } from '../content/invocation.ts';
import {
  createEditorDocumentHub,
  type EditorDocumentHub,
} from '../content/editor-document-runtime.ts';
import {
  createWorkspaceDocument,
  openWorkspaceRuntime,
  type WorkspaceDocument,
} from '../workspace/runtime.ts';
import { paneIdsInLayoutOrder } from '../workspace/durable-state.ts';
import { openWorkspacePresence } from '../workspace/presence-runtime.ts';

const WORKSPACE_LINK_ID = 'workspace';

export type RootSeedFile = {
  readonly linkId: string;
  readonly name: string;
  readonly order: number;
} & ({
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly text?: never;
  readonly contentType?: string;
  readonly documentName?: string;
  readonly resourceUrl?: never;
} | {
  readonly bytes?: never;
  readonly text: string;
  readonly contentType?: string;
  readonly documentName?: string;
  readonly resourceUrl?: never;
} | {
  readonly bytes?: never;
  readonly text?: never;
  readonly contentType?: never;
  readonly documentName?: never;
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
  readonly displayIdentityId?: string;
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
        ?? options.repo.create(file.text === undefined
          ? createAutomergeBinaryFileDocument(file.bytes, fileMetadata(file))
          : createAutomergeTextFileDocument(file.text, fileMetadata(file))).url,
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
  return openRootHandle(options.repo, rootHandle, undefined, options.displayIdentityId);
};

const fileMetadata = (file: RootSeedFile) => ({
  name: file.documentName ?? file.name,
  ...(file.contentType === undefined ? {} : { mimeType: file.contentType }),
});

export const openRoot = async (options: {
  readonly repo: Repo;
  readonly rootUrl: string;
  readonly displayIdentityId?: string;
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
    options.displayIdentityId,
  );
};

const openRootHandle = async (
  repo: Repo,
  rootHandle: DocHandle<AutomergeFolderDocument>,
  signal?: AbortSignal,
  displayIdentityId: string = crypto.randomUUID(),
) => {
  const handles = new Map<string, DocHandle<object>>([[rootHandle.url, asObjectHandle(rootHandle)]]);
  const pendingHandles = new Map<string, Promise<DocHandle<object>>>();
  const resourceObservers = new Set<{ readonly close: () => void }>();
  const editorHubs = new Map<string, {
    readonly promise: Promise<EditorDocumentHub>;
    pendingConsumers: number;
  }>();
  const resolver = new AbortController();
  let closed = false;
  const findResourceHandle = (resourceRef: string, findSignal?: AbortSignal) => {
    const current = handles.get(resourceRef);
    if (current !== undefined) return abortable(Promise.resolve(current), findSignal);
    let loading = pendingHandles.get(resourceRef);
    if (loading === undefined) {
      const requested = repo.find<object>(resourceRef as AutomergeUrl, { signal: resolver.signal });
      loading = requested;
      pendingHandles.set(resourceRef, requested);
      const clearPending = () => {
        if (pendingHandles.get(resourceRef) === requested) pendingHandles.delete(resourceRef);
      };
      void requested.then(clearPending, clearPending);
    }
    return abortable(loading, findSignal);
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
    const handle = await findResourceHandle(sourceId, openSignal);
    const opened = await openAutomergeFolderDatabase(handle);
    if (!opened.success) return { state: 'failed' as const, issues: opened.issues };
    if (closed || openSignal.aborted) {
      opened.value.close();
      return undefined;
    }
    handles.set(sourceId, handle);
    return opened.value;
  };
  const resourceQuery = await openFolderGraphQuery({ root: filesystem, openSource: openFolderSource }).catch(
    (error: unknown) => {
      filesystem.close();
      throw error;
    },
  );
  const closeResourceRuntime = () => {
    resolver.abort();
    pendingHandles.clear();
    resourceQuery.close();
    filesystem.close();
  };
  let workspaceHandle: DocHandle<WorkspaceDocument>;
  try {
    const workspaceLink = await readWorkspaceLink(filesystem, rootHandle.url);
    if (!isValidAutomergeUrl(workspaceLink.resourceRef)) {
      throw new Error('Patchpit workspace document reference is invalid');
    }
    workspaceHandle = await repo.find<WorkspaceDocument>(workspaceLink.resourceRef, findOptions(signal));
    handles.set(workspaceLink.resourceRef, asObjectHandle(workspaceHandle));
  } catch (error) {
    closeResourceRuntime();
    throw error;
  }
  const workspaceRuntime = await openWorkspaceRuntime(workspaceHandle).catch((error: unknown) => {
    closeResourceRuntime();
    throw error;
  });
  const initialWorkspace = workspaceRuntime.getSnapshot();
  if (initialWorkspace.state !== 'ready') {
    workspaceRuntime.close();
    closeResourceRuntime();
    throw new Error('Patchpit workspace is unavailable');
  }
  const initialPaneIds = paneIdsInLayoutOrder(initialWorkspace.workspace);
  const initialContextPane = initialWorkspace.workspace.nodes[initialPaneIds.at(-1) ?? ''];
  const workspacePresence = await openWorkspacePresence({
    sourceId: `${rootHandle.url}:presence:${crypto.randomUUID()}`,
    workspace: initialWorkspace.workspace,
    recentContextIds: initialContextPane?.kind === 'pane'
      ? initialContextPane.contexts.slice(0, 1)
      : [],
  }).catch((error: unknown) => {
    workspaceRuntime.close();
    closeResourceRuntime();
    throw error;
  });
  const resolveResourceDocument = async (resourceRef: string, documentSignal?: AbortSignal) => {
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)
      || !isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await findResourceHandle(resourceRef, documentSignal);
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)) return undefined;
    handles.set(resourceRef, handle);
    return handle;
  };
  const openResourceTitles = async (resourceRefs: readonly string[], titleSignal?: AbortSignal) => {
    const stopped = () => closed || titleSignal?.aborted === true;
    const sources = (await Promise.all([...new Set(resourceRefs)].map(async (resourceRef) => {
      if (stopped() || !rootReferencesResource(resourceQuery, resourceRef)
        || !isValidAutomergeUrl(resourceRef)) return undefined;
      try {
        const handle = await findResourceHandle(resourceRef, titleSignal);
        if (stopped() || !rootReferencesResource(resourceQuery, resourceRef)) return undefined;
        const opened = await openAutomergeFilesystemDatabase(handle);
        if (stopped() || !rootReferencesResource(resourceQuery, resourceRef)) {
          if (opened.success) opened.value.database.close();
          return undefined;
        }
        return opened.success ? opened.value : undefined;
      } catch {
        return undefined;
      }
    }))).filter((source) => source !== undefined);
    if (titleSignal?.aborted === true) {
      sources.forEach(({ database }) => database.close());
      titleSignal.throwIfAborted();
    }
    if (sources.length === 0) return undefined;
    const observer = await openTitleObserver(sources, resourceObservers);
    return retainOpenObserver(observer, closed, titleSignal);
  };
  const openResourceFileQuery = async (resourceRef: string, fileSignal?: AbortSignal) => {
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)
      || !isValidAutomergeUrl(resourceRef)) return { state: 'unavailable' as const };
    const handle = await findResourceHandle(resourceRef, fileSignal);
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)) {
      return { state: 'unavailable' as const };
    }
    const opened = await openAutomergeFileDatabase(handle, 'public');
    if (!opened.success) return { issues: opened.issues, state: 'invalid' as const };
    if (closed || fileSignal?.aborted === true || !rootReferencesResource(resourceQuery, resourceRef)) {
      opened.value.close();
      fileSignal?.throwIfAborted();
      return { state: 'unavailable' as const };
    }
    let query: Awaited<ReturnType<typeof openFileDocumentQuery>>;
    try {
      query = await openFileDocumentQuery(opened.value);
    } catch (error) {
      opened.value.close();
      throw error;
    }
    let observerClosed = false;
    const observer = {
      getSnapshot: () => query.getSnapshot(),
      subscribe: (listener: Parameters<typeof query.subscribe>[0]) => query.subscribe(listener),
      whenSettled: (options?: Parameters<typeof query.whenSettled>[0]) => query.whenSettled(options),
      close: () => {
        if (observerClosed) return;
        observerClosed = true;
        resourceObservers.delete(observer);
        query.close();
        opened.value.close();
      },
    };
    resourceObservers.add(observer);
    const retained = retainOpenObserver(observer, closed, fileSignal);
    return retained === undefined
      ? { state: 'unavailable' as const }
      : { query: retained, state: 'ready' as const };
  };
  const createAppSnapshot = async (rootFolderRef: string, snapshotSignal?: AbortSignal) => {
    if (closed) throw new Error('Patchpit root is closed');
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
          const handle = await findResourceHandle(sourceId, openSignal);
          const opened = await openAutomergeFilesystemDatabase(handle, APP_FILE_AUTHORITY_SCOPE);
          return opened.success
            ? opened.value.database
            : { state: 'failed' as const, issues: opened.issues };
        },
      });
    } finally {
      folderOpened.value.close();
    }
  };
  const openAppTextDocument = async (
    rootFolderRef: string,
    path: readonly [string],
    documentSignal?: AbortSignal,
  ) => {
    if (closed) throw new Error('Patchpit root is closed');
    documentSignal?.throwIfAborted();
    const snapshot = resourceQuery.getSnapshot();
    if (snapshot.state !== 'open'
      || snapshot.current.readiness !== 'ready'
      || snapshot.current.completeness !== 'exact'
      || snapshot.current.freshness !== 'current') {
      throw new Error('App document graph is unavailable');
    }
    const matches = snapshot.current.rows.filter(({ name, sourceId, typeHint }) =>
      sourceId === rootFolderRef && name === path[0] && typeHint !== 'folder');
    if (matches.length !== 1) throw new Error('App document path is unavailable or ambiguous');
    const resourceRef = matches[0]?.resourceRef;
    if (resourceRef === undefined || !isValidAutomergeUrl(resourceRef)) {
      throw new Error('App document reference is invalid');
    }
    let hubEntry = editorHubs.get(resourceRef);
    if (hubEntry === undefined) {
      const promise = (async () => {
        const handle = await resolveResourceDocument(resourceRef);
        if (handle === undefined) throw new Error('App document is unavailable');
        const opened = await openAutomergeFileDatabase(handle, 'patchpit.editor-text');
        if (!opened.success) throw new Error('App document is invalid', { cause: opened.issues });
        let hub: EditorDocumentHub;
        hub = createEditorDocumentHub(handle, opened.value, displayIdentityId, () => {
          const entry = editorHubs.get(resourceRef);
          if (entry?.promise === promise && entry.pendingConsumers > 0) return;
          if (entry?.promise === promise) editorHubs.delete(resourceRef);
          hub.close();
        });
        return hub;
      })();
      hubEntry = { promise, pendingConsumers: 0 };
      editorHubs.set(resourceRef, hubEntry);
      void promise.catch(() => {
        if (editorHubs.get(resourceRef)?.promise === promise) editorHubs.delete(resourceRef);
      });
    }
    hubEntry.pendingConsumers += 1;
    try {
      const hub = await abortable(hubEntry.promise, documentSignal);
      if (closed) throw new Error('Patchpit root is closed');
      return hub.openSession();
    } finally {
      hubEntry.pendingConsumers -= 1;
      if (hubEntry.pendingConsumers === 0) {
        void hubEntry.promise.then((hub) => {
          if (hubEntry.pendingConsumers === 0
            && hub.isIdle()
            && editorHubs.get(resourceRef) === hubEntry) {
            editorHubs.delete(resourceRef);
            hub.close();
          }
        }, () => undefined);
      }
    }
  };
  return {
    rootUrl: rootHandle.url,
    resourceQuery,
    workspaceRuntime,
    workspacePresence,
    resolveResourceDocument,
    openResourceTitles,
    openResourceFileQuery,
    createAppSnapshot,
    openAppTextDocument,
    close: () => {
      if (closed) return;
      closed = true;
      for (const observer of resourceObservers) observer.close();
      resourceObservers.clear();
      for (const { promise } of editorHubs.values()) {
        void promise.then((value) => value.close(), () => undefined);
      }
      editorHubs.clear();
      workspaceRuntime.close();
      workspacePresence.close();
      closeResourceRuntime();
    },
  };
};

type ResourceRuntime = Awaited<ReturnType<typeof openFolderGraphQuery>>;

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

const openTitleObserver = async (
  sources: readonly AutomergeFilesystemDatabase[],
  owners: Set<{ readonly close: () => void }>,
) => {
  const queryResults = await Promise.allSettled([
    openTitleQuery(sources, 'folder', openFolderDocumentTitlesQuery),
    openTitleQuery(sources, 'file', openFileDocumentTitlesQuery),
  ]);
  const queries = queryResults.flatMap((result) => result.status === 'fulfilled' && result.value !== undefined
    ? [result.value]
    : []);
  const failure = queryResults.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    queries.forEach((query) => query.close());
    sources.forEach(({ database }) => database.close());
    throw failure.reason;
  }
  let closed = false;
  const observer = {
    getSnapshot: () => materializeResourceTitles(queries.flatMap((query) => {
      const snapshot = query.getSnapshot();
      return snapshot.state === 'open' ? snapshot.current.rows : [];
    })),
    subscribe: (listener: () => void) => {
      const unsubscribes = queries.map((query) => query.subscribe(() => listener()));
      return () => { unsubscribes.forEach((unsubscribe) => unsubscribe()); };
    },
    close: () => {
      if (closed) return;
      closed = true;
      owners.delete(observer);
      queries.forEach((query) => query.close());
      sources.forEach(({ database }) => database.close());
    },
  };
  owners.add(observer);
  return observer;
};

const openTitleQuery = (
  sources: readonly AutomergeFilesystemDatabase[],
  kind: AutomergeFilesystemDatabase['kind'],
  open: (sources: readonly MountableDatabaseSource[]) => Promise<DatabaseQuerySession<DocumentTitleRow>>,
) => {
  const databases = sources.flatMap((source) => source.kind === kind ? [source.database] : []);
  return databases.length === 0 ? undefined : open(databases);
};

const materializeResourceTitles = (
  rows: readonly Readonly<Record<string, unknown>>[],
) => new Map(rows.flatMap(({ resourceRef, title }) =>
  typeof resourceRef === 'string' && typeof title === 'string'
    ? [[resourceRef, title] as const]
    : []));

const retainOpenObserver = <Observer extends { readonly close: () => void }>(
  observer: Observer,
  rootClosed: boolean,
  signal?: AbortSignal,
): Observer | undefined => {
  if (!rootClosed && signal?.aborted !== true) return observer;
  observer.close();
  signal?.throwIfAborted();
  return undefined;
};
export type PatchpitRuntime = Awaited<ReturnType<typeof createRoot>>;
