import {
  isValidAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from '@automerge/automerge-repo';
import {
  openAutomergeFileDatabase,
  openAutomergeFilesystemDatabase,
  openAutomergeFolderDatabase,
  type AutomergeFilesystemDatabase,
  type AutomergeFolderDatabase,
  type AutomergeFolderDocument,
} from '@patchpit/automerge-fs';
import {
  openFileDocumentQuery,
  openFileDocumentTitlesQuery,
  openFolderDocumentTitlesQuery,
  openFolderGraphQuery,
  type DocumentTitleRow,
} from '@patchpit/fs';
import type {
  DatabaseQuerySession,
  MountableDatabaseSource,
} from '@tarstate/core/database/session';
import {
  APP_FILE_AUTHORITY_SCOPE,
  snapshotFilesystemApp,
} from '@patchpit/sandbox-fs';
import {
  createEditorDocumentHub,
  type EditorDocumentHub,
} from '../content/editor-document-runtime.ts';
import { createResourceTransferRuntime } from './resource-transfer-runtime.ts';
import {
  createAutomergeResourceViewSource,
  type ResourceViewSource,
} from './resource-view.ts';

export const openRootResourceRuntime = async ({
  displayIdentityId,
  filesystem,
  protectedLinkId,
  repo,
  rootHandle,
  workspaceHandle,
}: {
  readonly displayIdentityId: string;
  readonly filesystem: AutomergeFolderDatabase;
  readonly protectedLinkId: string;
  readonly repo: Repo;
  readonly rootHandle: DocHandle<AutomergeFolderDocument>;
  readonly workspaceHandle: DocHandle<object>;
}) => {
  const handles = new Map<string, DocHandle<object>>([
    [rootHandle.url, asObjectHandle(rootHandle)],
    [workspaceHandle.url, workspaceHandle],
  ]);
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
  const openFolderSource = async ({ sourceId, signal }: {
    readonly sourceId: string;
    readonly signal: AbortSignal;
  }) => {
    if (closed || !isValidAutomergeUrl(sourceId)) return undefined;
    const handle = await findResourceHandle(sourceId, signal);
    const opened = await openAutomergeFolderDatabase(handle);
    if (!opened.success) return { state: 'failed' as const, issues: opened.issues };
    if (closed || signal.aborted) {
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
  const closeResourceGraph = () => {
    resolver.abort();
    pendingHandles.clear();
    resourceQuery.close();
    filesystem.close();
  };
  const resolveAutomergeHandle = async (resourceRef: string, signal?: AbortSignal) => {
    if (closed || !isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await findResourceHandle(resourceRef, signal);
    if (closed) return undefined;
    handles.set(resourceRef, handle);
    return handle;
  };
  const resolveResourceDocument = async (resourceRef: string, signal?: AbortSignal) => {
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)
      || !isValidAutomergeUrl(resourceRef)) return undefined;
    const handle = await resolveAutomergeHandle(resourceRef, signal);
    if (handle === undefined) return undefined;
    return closed || !rootReferencesResource(resourceQuery, resourceRef) ? undefined : handle;
  };
  const resourceTransfers = await createResourceTransferRuntime({
    isClosed: () => closed,
    isProtectedResource: ({ linkId, sourceId }) =>
      sourceId === rootHandle.url && linkId === protectedLinkId,
    repo,
    resolveDocument: resolveAutomergeHandle,
    resourceQuery,
    rootUrl: rootHandle.url,
  }).catch((error: unknown) => {
    closeResourceGraph();
    throw error;
  });
  const openResourceTitles = async (resourceRefs: readonly string[], signal?: AbortSignal) => {
    const stopped = () => closed || signal?.aborted === true;
    const sources = (await Promise.all([...new Set(resourceRefs)].map(async (resourceRef) => {
      if (stopped() || !rootReferencesResource(resourceQuery, resourceRef)
        || !isValidAutomergeUrl(resourceRef)) return undefined;
      try {
        const handle = await findResourceHandle(resourceRef, signal);
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
    if (signal?.aborted === true) {
      sources.forEach(({ database }) => database.close());
      signal.throwIfAborted();
    }
    if (sources.length === 0) return undefined;
    const observer = await openTitleObserver(sources, resourceObservers);
    return retainOpenObserver(observer, closed, signal);
  };
  const openResourceFileQuery = async (resourceRef: string, signal?: AbortSignal) => {
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)
      || !isValidAutomergeUrl(resourceRef)) return { state: 'unavailable' as const };
    const handle = await findResourceHandle(resourceRef, signal);
    if (closed || !rootReferencesResource(resourceQuery, resourceRef)) {
      return { state: 'unavailable' as const };
    }
    const opened = await openAutomergeFileDatabase(handle, 'public');
    if (!opened.success) return { issues: opened.issues, state: 'invalid' as const };
    if (closed || signal?.aborted === true || !rootReferencesResource(resourceQuery, resourceRef)) {
      opened.value.close();
      signal?.throwIfAborted();
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
    const retained = retainOpenObserver(observer, closed, signal);
    return retained === undefined
      ? { state: 'unavailable' as const }
      : { query: retained, state: 'ready' as const };
  };
  const createAppSnapshot = async (rootFolderRef: string, signal?: AbortSignal) => {
    if (closed) throw new Error('Patchpit root is closed');
    if (!isValidAutomergeUrl(rootFolderRef)) throw new Error('App folder reference is invalid');
    const folderHandle = await findResourceHandle(rootFolderRef, signal);
    const folderOpened = await openAutomergeFolderDatabase(folderHandle, APP_FILE_AUTHORITY_SCOPE);
    if (!folderOpened.success) {
      throw new Error('App folder is invalid', { cause: folderOpened.issues });
    }
    try {
      return await snapshotFilesystemApp({
        root: folderOpened.value,
        rootFolderRef,
        ...(signal === undefined ? {} : { signal }),
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
    signal?: AbortSignal,
  ) => {
    if (closed) throw new Error('Patchpit root is closed');
    signal?.throwIfAborted();
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
      const hub = await abortable(hubEntry.promise, signal);
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
  const resourceViews: ReadonlyMap<string, ResourceViewSource> = new Map([[
    workspaceHandle.url,
    createAutomergeResourceViewSource(workspaceHandle),
  ]]);
  return {
    resourceViews,
    resourceQuery,
    resolveResourceDocument,
    openResourceTitles,
    openResourceFileQuery,
    createAppSnapshot,
    openAppTextDocument,
    ...resourceTransfers,
    close: () => {
      if (closed) return;
      closed = true;
      for (const observer of resourceObservers) observer.close();
      resourceObservers.clear();
      for (const { promise } of editorHubs.values()) {
        void promise.then((value) => value.close(), () => undefined);
      }
      editorHubs.clear();
      closeResourceGraph();
    },
  };
};

type ResourceQuery = Awaited<ReturnType<typeof openFolderGraphQuery>>;

const rootReferencesResource = (resourceQuery: ResourceQuery, resourceRef: string) => {
  const snapshot = resourceQuery.getSnapshot();
  return snapshot.state === 'open'
    && snapshot.current.rows.some((link) => link.resourceRef === resourceRef);
};

const asObjectHandle = <Document extends object>(handle: DocHandle<Document>) =>
  handle as unknown as DocHandle<object>;

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
      const unsubscribes = queries.map((query) => query.subscribe(listener));
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
