import {
  isValidAutomergeUrl,
  Repo,
  type AutomergeUrl,
} from '@automerge/automerge-repo';
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import {
  createRoot,
  openRoot,
  type PatchpitRuntime,
  RootRuntimeOpenError,
  type RootSeedFolder,
} from '../root/runtime.ts';
import { DEMO_BOOTSTRAP } from '../root/document.ts';
import type { RootInvocation } from '../root/invocation.ts';
import {
  createMemoryRootCatalogue,
  openBrowserRootCatalogue,
  RootCatalogueError,
  type BrowserRootCatalogue,
  type BrowserRootRecord,
} from './root-catalogue.ts';
import {
  captureRepoBaseline,
  collectDisposableBrowserRoots,
  flushBaseline,
  flushReadyRepoDocuments,
} from './root-storage-retention.ts';

const DISPLAY_IDENTITY_STORAGE_KEY = 'patchpit.display-identity.v1';
const DEFAULT_STORAGE_NAME = 'patchpit.documents.v1';
const DEFAULT_CATALOGUE_NAME = 'patchpit.roots.v1';
const DEFAULT_CHANNEL_NAME = 'patchpit';
const ROOT_OPEN_TIMEOUT_MS = 15_000;

export class BrowserRootOpenError extends Error {
  readonly reason: 'cancelled' | 'catalogue' | 'evicted' | 'incomplete' | 'invalid'
    | 'root-unavailable' | 'storage' | 'timeout' | 'unsupported';

  constructor(reason: BrowserRootOpenError['reason'], cause?: unknown) {
    super(rootErrorMessage(reason), cause === undefined ? {} : { cause });
    this.name = 'BrowserRootOpenError';
    this.reason = reason;
  }
}

export const loadBrowserDisplayIdentityId = async () => {
  const load = () => {
    try {
      const stored = localStorage.getItem(DISPLAY_IDENTITY_STORAGE_KEY);
      if (isDisplayIdentityId(stored)) return stored;
      const created = crypto.randomUUID();
      localStorage.setItem(DISPLAY_IDENTITY_STORAGE_KEY, created);
      const persisted = localStorage.getItem(DISPLAY_IDENTITY_STORAGE_KEY);
      return isDisplayIdentityId(persisted) ? persisted : created;
    } catch {
      return crypto.randomUUID();
    }
  };
  try {
    return await navigator.locks.request(DISPLAY_IDENTITY_STORAGE_KEY, load);
  } catch {
    return load();
  }
};

export const createBrowserRootHost = (options: {
  readonly broadcastChannelName?: string;
  readonly catalogue?: BrowserRootCatalogue;
  readonly catalogueName?: string;
  readonly displayIdentityId?: string;
  readonly repo?: Repo;
  readonly storageName?: string;
  readonly seed: (signal?: AbortSignal) => Promise<{
    readonly documentContextFolderId?: string;
    readonly folders: readonly RootSeedFolder[];
    readonly initialContext: string;
  }>;
}) => {
  const ownsRepos = options.repo === undefined;
  const displayIdentityId = options.displayIdentityId ?? crypto.randomUUID();
  const channelName = options.broadcastChannelName ?? DEFAULT_CHANNEL_NAME;
  const lockNamespace = options.catalogueName ?? DEFAULT_CATALOGUE_NAME;
  const storageName = options.storageName ?? DEFAULT_STORAGE_NAME;
  const storage = ownsRepos ? new IndexedDBStorageAdapter(storageName) : undefined;
  const catalogue = options.catalogue ?? (ownsRepos
    ? openBrowserRootCatalogue(options.catalogueName ?? DEFAULT_CATALOGUE_NAME)
    : createMemoryRootCatalogue());
  const createRepo = () => {
    if (options.repo !== undefined) return options.repo;
    if (storage === undefined) throw new BrowserRootOpenError('storage');
    return new Repo({
      storage,
      network: [new BroadcastChannelNetworkAdapter({ channelName })],
      saveDebounceRate: 0,
    });
  };
  let repo = createRepo();
  let active: {
    readonly lease: RootLease;
    readonly runtime: PatchpitRuntime;
  } | undefined;
  let openTail = Promise.resolve();
  let generation = 0;
  let closed = false;

  const release = () => {
    generation += 1;
    const released = active;
    active = undefined;
    released?.runtime.close();
    released?.lease.release();
  };

  const open = async (
    invocation: RootInvocation,
    signal?: AbortSignal,
    openOptions?: { readonly fresh?: boolean },
  ) => {
    if (closed) throw new BrowserRootOpenError('cancelled');
    release();
    const currentGeneration = generation;
    const run = async () => {
      if (closed || generation !== currentGeneration) throw new BrowserRootOpenError('cancelled');
      signal?.throwIfAborted();
      const timeoutSignal = AbortSignal.timeout(ROOT_OPEN_TIMEOUT_MS);
      const openSignal = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
      const openingRepo = repo;
      let openingRecord: BrowserRootRecord | undefined;
      try {
        const selected = invocation.src === undefined && openOptions?.fresh !== true
          ? await catalogue.getDefault().then((record) => record === undefined
              ? invocation
              : { ...invocation, src: record.rootUrl })
          : invocation;
        const selectedRootUrl = selected.src;
        openingRecord = selectedRootUrl === undefined || !isValidAutomergeUrl(selectedRootUrl)
          ? undefined
          : await catalogue.get(selectedRootUrl);
        const opened = selectedRootUrl === undefined
          ? await createDefaultRoot({
              catalogue,
              displayIdentityId,
              fresh: openOptions?.fresh === true,
              invocation,
              lockNamespace,
              options,
              repo: openingRepo,
              signal: openSignal,
            })
          : await acquireRootLease(lockNamespace, selectedRootUrl, openSignal).then(async (lease) => {
              try {
                const runtime = await openRememberedRoot({
                  catalogue,
                  displayIdentityId,
                  invocation: { ...selected, src: selectedRootUrl },
                  repo: openingRepo,
                  signal: openSignal,
                });
                return { lease, runtime };
              } catch (error) {
                lease.release();
                throw error;
              }
            });
        const { lease, runtime } = opened;
        if (closed || generation !== currentGeneration || signal?.aborted === true) {
          runtime.close();
          lease.release();
          signal?.throwIfAborted();
          throw new BrowserRootOpenError('cancelled');
        }
        active = { lease, runtime };
        if (ownsRepos && lease.supported) {
          queueMicrotask(() => { void collectDisposableRoots().catch(() => undefined); });
        }
        return {
          invocation: { ...invocation, src: runtime.rootUrl },
          runtime,
        };
      } catch (error) {
        const failure = classifyRootOpenFailure({ error, openingRecord, signal, timeoutSignal });
        if (ownsRepos && repoRotationReasons.has(failure.reason)) rotateRepo(openingRepo);
        throw failure;
      }
    };
    const result = openTail.then(run);
    openTail = result.then(() => undefined, () => undefined);
    return result;
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    release();
    await openTail;
    if (ownsRepos) {
      await flushReadyRepoDocuments(repo).catch(() => undefined);
      await repo.shutdown().catch(() => undefined);
    }
    catalogue.close();
  };

  const rotateRepo = (failedRepo: Repo) => {
    if (repo !== failedRepo) return;
    repo = createRepo();
    void failedRepo.shutdown().catch(() => undefined);
  };

  const collectDisposableRoots = async () => {
    if (!ownsRepos || typeof navigator === 'undefined' || navigator.locks === undefined) return;
    if (storage === undefined) return;
    await collectDisposableBrowserRoots({
      ...(active === undefined ? {} : { activeRootUrl: active.runtime.rootUrl }),
      catalogue,
      lockNamespace,
      storage,
    });
  };

  return {
    close,
    flush: async () => active === undefined ? undefined : flushReadyRepoDocuments(repo),
    collectDisposableRoots,
    listRecentRoots: (limit?: number) => catalogue.listRecent(limit),
    open,
    release,
  };
};

const createDefaultRoot = async ({
  catalogue,
  displayIdentityId,
  fresh,
  invocation,
  lockNamespace,
  options,
  repo,
  signal,
}: {
  readonly catalogue: BrowserRootCatalogue;
  readonly displayIdentityId: string;
  readonly fresh: boolean;
  readonly invocation: RootInvocation;
  readonly lockNamespace: string;
  readonly options: Parameters<typeof createBrowserRootHost>[0];
  readonly repo: Repo;
  readonly signal?: AbortSignal;
}) => withBootstrapLock(lockNamespace, async () => {
  const existing = fresh ? undefined : await catalogue.getDefault();
  if (existing !== undefined) {
    const lease = await acquireRootLease(lockNamespace, existing.rootUrl, signal);
    try {
      const runtime = await openRememberedRoot({
        catalogue,
        displayIdentityId,
        invocation: { ...invocation, src: existing.rootUrl },
        repo,
        ...(signal === undefined ? {} : { signal }),
      });
      return { lease, runtime };
    } catch (error) {
      lease.release();
      throw error;
    }
  }
  signal?.throwIfAborted();
  const createdSourceIds = new Set<AutomergeUrl>();
  const seed = await options.seed(signal);
  const runtime = await createRoot({
    repo,
    displayIdentityId,
    folders: seed.folders,
    initialContext: seed.initialContext,
    onDocumentCreated: (sourceId) => { createdSourceIds.add(sourceId); },
    ...(seed.documentContextFolderId === undefined
      ? {}
      : { documentContextFolderId: seed.documentContextFolderId }),
  });
  let lease: RootLease | undefined;
  try {
    lease = await acquireRootLease(lockNamespace, runtime.rootUrl, signal);
    const baseline = captureRepoBaseline(repo, createdSourceIds);
    await flushBaseline(repo, baseline);
    await catalogue.remember({
      rootUrl: runtime.rootUrl,
      provenance: 'bootstrap',
      bootstrap: DEMO_BOOTSTRAP,
      retention: 'disposable',
      baseline,
    });
    return { lease, runtime };
  } catch (error) {
    runtime.close();
    lease?.release();
    throw error;
  }
}, signal);

const openRememberedRoot = async ({ catalogue, displayIdentityId, invocation, repo, signal }: {
  readonly catalogue: BrowserRootCatalogue;
  readonly displayIdentityId: string;
  readonly invocation: RootInvocation & { readonly src: string };
  readonly repo: Repo;
  readonly signal?: AbortSignal;
}) => {
  const runtime = await openRoot({
    repo,
    rootUrl: invocation.src,
    displayIdentityId,
    ...(signal === undefined ? {} : { signal }),
  });
  try {
    const bootstrap = runtime.rootDeclaration?.bootstrap;
    if (bootstrap !== undefined
      && (bootstrap.id !== DEMO_BOOTSTRAP.id || bootstrap.generation !== DEMO_BOOTSTRAP.generation)) {
      throw new BrowserRootOpenError('unsupported');
    }
    await flushReadyRepoDocuments(repo);
    const existing = await catalogue.get(runtime.rootUrl);
    await catalogue.remember({
      rootUrl: runtime.rootUrl,
      provenance: bootstrap === undefined ? 'explicit' : 'bootstrap',
      ...(bootstrap === undefined ? {} : { bootstrap }),
      retention: existing?.retention ?? 'retained',
      ...(existing?.baseline === undefined ? {} : { baseline: existing.baseline }),
    });
    return runtime;
  } catch (error) {
    runtime.close();
    throw error;
  }
};

type RootLease = {
  readonly supported: boolean;
  readonly release: () => void;
};

const acquireRootLease = async (
  namespace: string,
  rootUrl: string,
  signal?: AbortSignal,
): Promise<RootLease> => {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) {
    return { supported: false, release: () => undefined };
  }
  let releaseLock: () => void = () => undefined;
  let resolveAcquired: (lease: RootLease) => void = () => undefined;
  let rejectAcquired: (error: unknown) => void = () => undefined;
  const acquired = new Promise<RootLease>((resolve, reject) => {
    resolveAcquired = resolve;
    rejectAcquired = reject;
  });
  const held = new Promise<void>((resolve) => { releaseLock = resolve; });
  const request = navigator.locks.request(
    `${namespace}:root:${rootUrl}`,
    { mode: 'shared', ...(signal === undefined ? {} : { signal }) },
    () => {
      let released = false;
      const lease = {
        supported: true,
        release: () => {
          if (released) return;
          released = true;
          releaseLock();
        },
      };
      resolveAcquired(lease);
      return held;
    },
  );
  void request.catch((error: unknown) => {
    rejectAcquired(error);
  });
  return acquired;
};

const withBootstrapLock = async <Value>(
  namespace: string,
  action: () => Promise<Value>,
  signal?: AbortSignal,
): Promise<Value> => {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) return action();
  return navigator.locks.request(
    `${namespace}:bootstrap`,
    { mode: 'exclusive', ...(signal === undefined ? {} : { signal }) },
    action,
  );
};

const rootErrorMessage = (reason: BrowserRootOpenError['reason']) => ({
  cancelled: 'Root opening was cancelled',
  catalogue: 'Browser root catalogue is unavailable',
  evicted: 'Root document was locally evicted',
  incomplete: 'Root document graph is incomplete',
  invalid: 'Root document is invalid',
  'root-unavailable': 'Root document is unavailable',
  storage: 'Browser document storage is unavailable',
  timeout: 'Root opening timed out',
  unsupported: 'Root document version is unsupported',
})[reason];

const repoRotationReasons: ReadonlySet<BrowserRootOpenError['reason']> = new Set([
  'evicted',
  'incomplete',
  'root-unavailable',
  'storage',
  'timeout',
]);

const classifyRootOpenFailure = ({ error, openingRecord, signal, timeoutSignal }: {
  readonly error: unknown;
  readonly openingRecord: BrowserRootRecord | undefined;
  readonly signal: AbortSignal | undefined;
  readonly timeoutSignal: AbortSignal;
}): BrowserRootOpenError => {
  if (error instanceof BrowserRootOpenError) return error;
  if (error instanceof RootCatalogueError) return new BrowserRootOpenError('catalogue', error);
  if (error instanceof RootRuntimeOpenError) return new BrowserRootOpenError(error.reason, error);
  if (timeoutSignal.aborted && signal?.aborted !== true) {
    return new BrowserRootOpenError('timeout', error);
  }
  if (signal?.aborted === true || error instanceof DOMException && error.name === 'AbortError') {
    return new BrowserRootOpenError('cancelled', error);
  }
  if (isStorageFailure(error)) return new BrowserRootOpenError('storage', error);
  if (openingRecord?.localCopy.state === 'evicted'
    || openingRecord?.localCopy.state === 'evicting') {
    return new BrowserRootOpenError('evicted', error);
  }
  return new BrowserRootOpenError('root-unavailable', error);
};

const isDisplayIdentityId = (value: string | null): value is string => value !== null
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);

const isStorageFailure = (error: unknown) => error instanceof DOMException
  && ['AbortError', 'InvalidStateError', 'NotFoundError', 'QuotaExceededError', 'UnknownError', 'VersionError']
    .includes(error.name);

export type BrowserRootHost = ReturnType<typeof createBrowserRootHost>;
export type RecentBrowserRoot = BrowserRootRecord;
