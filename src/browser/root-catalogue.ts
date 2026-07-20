import {
  isValidAutomergeUrl,
  type AutomergeUrl,
} from '@automerge/automerge-repo';

const CATALOGUE_FORMAT = 1;
const MAX_CATALOGUED_ROOTS = 1_024;
const MAX_BASELINE_SOURCES = 4_096;
export const MAX_ROOT_EVICTION_SOURCES = 256;
const ROOTS_STORE = 'roots';
const SETTINGS_STORE = 'settings';
const DEFAULT_ROOT_KEY = 'default-root';

export type RootBaselineSource = {
  readonly sourceId: AutomergeUrl;
  readonly heads: readonly string[];
};

export type BrowserRootRecord = {
  readonly format: typeof CATALOGUE_FORMAT;
  readonly rootUrl: AutomergeUrl;
  readonly provenance: 'bootstrap' | 'explicit';
  readonly bootstrap?: {
    readonly id: string;
    readonly generation: number;
  };
  readonly retention: 'disposable' | 'retained';
  readonly localCopy:
    | { readonly state: 'stored'; readonly changedAt: number }
    | {
        readonly state: 'evicting';
        readonly changedAt: number;
        readonly remainingSourceIds: readonly AutomergeUrl[];
      }
    | { readonly state: 'evicted'; readonly changedAt: number };
  readonly createdAt: number;
  readonly lastOpenedAt: number;
  readonly baseline?: readonly RootBaselineSource[];
};

export type RememberedRoot = Pick<
  BrowserRootRecord,
  'rootUrl' | 'provenance' | 'bootstrap' | 'retention' | 'baseline'
>;

export type BrowserRootCatalogue = {
  readonly get: (rootUrl: AutomergeUrl) => Promise<BrowserRootRecord | undefined>;
  readonly getDefault: () => Promise<BrowserRootRecord | undefined>;
  readonly listRecent: (limit?: number) => Promise<readonly BrowserRootRecord[]>;
  readonly remember: (root: RememberedRoot) => Promise<BrowserRootRecord>;
  readonly retain: (rootUrl: AutomergeUrl) => Promise<BrowserRootRecord | undefined>;
  readonly setLocalCopy: (
    rootUrl: AutomergeUrl,
    localCopy: BrowserRootRecord['localCopy'],
  ) => Promise<BrowserRootRecord | undefined>;
  readonly close: () => void;
};

export class RootCatalogueError extends Error {
  readonly reason: 'capacity' | 'storage';

  constructor(reason: RootCatalogueError['reason'], cause?: unknown) {
    super(
      reason === 'capacity' ? 'Root catalogue capacity reached' : 'Root catalogue storage failed',
      cause === undefined ? {} : { cause },
    );
    this.name = 'RootCatalogueError';
    this.reason = reason;
  }
}

export const openBrowserRootCatalogue = (
  databaseName: string,
): BrowserRootCatalogue => {
  const database = openDatabase(databaseName);
  const readRecord = async (rootUrl: AutomergeUrl) => {
    try {
      const db = await database;
      return parseRootRecord(await requestResult(db.transaction(ROOTS_STORE).objectStore(ROOTS_STORE).get(rootUrl)));
    } catch (error) {
      throw asCatalogueStorageError(error);
    }
  };

  return {
    get: readRecord,
    getDefault: async () => {
      try {
        const db = await database;
        const setting = await requestResult(db.transaction(SETTINGS_STORE).objectStore(SETTINGS_STORE).get(DEFAULT_ROOT_KEY));
        if (setting === undefined) return undefined;
        const rootUrl = parseDefaultRoot(setting);
        if (rootUrl === undefined) throw new RootCatalogueError('storage');
        const record = await readRecord(rootUrl);
        if (record === undefined) throw new RootCatalogueError('storage');
        return record;
      } catch (error) {
        throw asCatalogueStorageError(error);
      }
    },
    listRecent: async (limit = 20) => {
      try {
        const db = await database;
        const values = await requestResult(db.transaction(ROOTS_STORE).objectStore(ROOTS_STORE).getAll(
          undefined,
          MAX_CATALOGUED_ROOTS + 1,
        ));
        if (values.length > MAX_CATALOGUED_ROOTS) throw new RootCatalogueError('capacity');
        return values.flatMap((value) => {
          const parsed = parseRootRecord(value);
          return parsed === undefined ? [] : [parsed];
        }).sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, Math.max(0, limit));
      } catch (error) {
        throw asCatalogueStorageError(error);
      }
    },
    remember: async (root) => {
      try {
        const db = await database;
        const transaction = db.transaction([ROOTS_STORE, SETTINGS_STORE], 'readwrite');
        const roots = transaction.objectStore(ROOTS_STORE);
        const [stored, count] = await Promise.all([
          requestResult(roots.get(root.rootUrl)),
          requestResult(roots.count()),
        ]);
        const existing = parseRootRecord(stored);
        if (existing === undefined && count >= MAX_CATALOGUED_ROOTS) {
          transaction.abort();
          throw new RootCatalogueError('capacity');
        }
        const record = rememberedRootRecord(root, existing, Date.now());
        roots.put(record);
        transaction.objectStore(SETTINGS_STORE).put({ key: DEFAULT_ROOT_KEY, rootUrl: root.rootUrl });
        await transactionDone(transaction);
        return record;
      } catch (error) {
        throw asCatalogueStorageError(error);
      }
    },
    setLocalCopy: async (rootUrl, localCopy) => {
      try {
        const db = await database;
        const transaction = db.transaction(ROOTS_STORE, 'readwrite');
        const roots = transaction.objectStore(ROOTS_STORE);
        const existing = parseRootRecord(await requestResult(roots.get(rootUrl)));
        if (existing === undefined) return undefined;
        const updated = { ...existing, localCopy } satisfies BrowserRootRecord;
        roots.put(updated);
        await transactionDone(transaction);
        return updated;
      } catch (error) {
        throw asCatalogueStorageError(error);
      }
    },
    retain: async (rootUrl) => {
      try {
        const db = await database;
        const transaction = db.transaction(ROOTS_STORE, 'readwrite');
        const roots = transaction.objectStore(ROOTS_STORE);
        const existing = parseRootRecord(await requestResult(roots.get(rootUrl)));
        if (existing === undefined) return undefined;
        const retained = { ...existing, retention: 'retained' as const } satisfies BrowserRootRecord;
        roots.put(retained);
        await transactionDone(transaction);
        return retained;
      } catch (error) {
        throw asCatalogueStorageError(error);
      }
    },
    close: () => { void database.then((db) => db.close(), () => undefined); },
  };
};

export const createMemoryRootCatalogue = (): BrowserRootCatalogue => {
  const roots = new Map<AutomergeUrl, BrowserRootRecord>();
  let defaultRootUrl: AutomergeUrl | undefined;
  return {
    get: async (rootUrl) => roots.get(rootUrl),
    getDefault: async () => defaultRootUrl === undefined ? undefined : roots.get(defaultRootUrl),
    listRecent: async (limit = 20) => [...roots.values()]
      .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
      .slice(0, Math.max(0, limit)),
    remember: async (root) => {
      const existing = roots.get(root.rootUrl);
      if (existing === undefined && roots.size >= MAX_CATALOGUED_ROOTS) {
        throw new RootCatalogueError('capacity');
      }
      const record = rememberedRootRecord(root, existing, Date.now());
      roots.set(root.rootUrl, record);
      defaultRootUrl = root.rootUrl;
      return record;
    },
    setLocalCopy: async (rootUrl, localCopy) => {
      const existing = roots.get(rootUrl);
      if (existing === undefined) return undefined;
      const updated = { ...existing, localCopy } satisfies BrowserRootRecord;
      roots.set(rootUrl, updated);
      return updated;
    },
    retain: async (rootUrl) => {
      const existing = roots.get(rootUrl);
      if (existing === undefined) return undefined;
      const retained = { ...existing, retention: 'retained' as const } satisfies BrowserRootRecord;
      roots.set(rootUrl, retained);
      return retained;
    },
    close: () => undefined,
  };
};

const rememberedRootRecord = (
  root: RememberedRoot,
  existing: BrowserRootRecord | undefined,
  now: number,
): BrowserRootRecord => ({
  format: CATALOGUE_FORMAT,
  rootUrl: root.rootUrl,
  provenance: existing?.provenance ?? root.provenance,
  ...(existing?.bootstrap === undefined && root.bootstrap === undefined
    ? {}
    : { bootstrap: existing?.bootstrap ?? root.bootstrap }),
  retention: existing?.retention ?? root.retention,
  localCopy: { state: 'stored', changedAt: now },
  createdAt: existing?.createdAt ?? now,
  lastOpenedAt: now,
  ...(existing?.baseline === undefined && root.baseline === undefined
    ? {}
    : { baseline: existing?.baseline ?? root.baseline }),
});

const openDatabase = (name: string) => new Promise<IDBDatabase>((resolve, reject) => {
  try {
    const request = indexedDB.open(name, CATALOGUE_FORMAT);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Root catalogue upgrade is blocked'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ROOTS_STORE)) {
        database.createObjectStore(ROOTS_STORE, { keyPath: 'rootUrl' });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  } catch (error) {
    reject(error);
  }
});

const requestResult = <Value>(request: IDBRequest<Value>) => new Promise<Value>((resolve, reject) => {
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error ?? new Error('Root catalogue transaction aborted'));
  transaction.oncomplete = () => resolve();
});

const parseDefaultRoot = (value: unknown): AutomergeUrl | undefined =>
  isRecord(value) && value.key === DEFAULT_ROOT_KEY
    && typeof value.rootUrl === 'string' && isValidAutomergeUrl(value.rootUrl)
    ? value.rootUrl
    : undefined;

export const parseRootRecord = (value: unknown): BrowserRootRecord | undefined => {
  if (!isRecord(value)
    || value.format !== CATALOGUE_FORMAT
    || typeof value.rootUrl !== 'string'
    || !isValidAutomergeUrl(value.rootUrl)
    || (value.provenance !== 'bootstrap' && value.provenance !== 'explicit')
    || (value.retention !== 'disposable' && value.retention !== 'retained')
    || !isTimestamp(value.createdAt)
    || !isTimestamp(value.lastOpenedAt)) return undefined;
  const bootstrap = parseBootstrap(value.bootstrap);
  if (value.bootstrap !== undefined && bootstrap === undefined) return undefined;
  const localCopy = parseLocalCopy(value.localCopy);
  if (localCopy === undefined) return undefined;
  const baseline = parseBaseline(value.baseline);
  if (value.baseline !== undefined && baseline === undefined) return undefined;
  return {
    format: CATALOGUE_FORMAT,
    rootUrl: value.rootUrl,
    provenance: value.provenance,
    ...(bootstrap === undefined ? {} : { bootstrap }),
    retention: value.retention,
    localCopy,
    createdAt: value.createdAt,
    lastOpenedAt: value.lastOpenedAt,
    ...(baseline === undefined ? {} : { baseline }),
  };
};

const parseBootstrap = (value: unknown): BrowserRootRecord['bootstrap'] | undefined =>
  isRecord(value) && typeof value.id === 'string' && value.id.length > 0
    && Number.isSafeInteger(value.generation) && (value.generation as number) > 0
    ? { id: value.id, generation: value.generation as number }
    : undefined;

const parseLocalCopy = (value: unknown): BrowserRootRecord['localCopy'] | undefined =>
  isRecord(value) && isTimestamp(value.changedAt)
    ? value.state === 'stored' || value.state === 'evicted'
      ? { state: value.state, changedAt: value.changedAt }
      : value.state === 'evicting' && Array.isArray(value.remainingSourceIds)
        && value.remainingSourceIds.length <= MAX_ROOT_EVICTION_SOURCES
        && value.remainingSourceIds.every((sourceId) =>
          typeof sourceId === 'string' && isValidAutomergeUrl(sourceId))
        ? {
            state: 'evicting',
            changedAt: value.changedAt,
            remainingSourceIds: value.remainingSourceIds,
          }
        : undefined
    : undefined;

const parseBaseline = (value: unknown): readonly RootBaselineSource[] | undefined => {
  if (!Array.isArray(value) || value.length > MAX_BASELINE_SOURCES) return undefined;
  const sources = value.flatMap((candidate): RootBaselineSource[] =>
    isRecord(candidate)
      && typeof candidate.sourceId === 'string'
      && isValidAutomergeUrl(candidate.sourceId)
      && Array.isArray(candidate.heads)
      && candidate.heads.every((head) => typeof head === 'string')
      ? [{ sourceId: candidate.sourceId, heads: candidate.heads }]
      : []);
  return sources.length === value.length ? sources : undefined;
};

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asCatalogueStorageError = (error: unknown) => error instanceof RootCatalogueError
  ? error
  : new RootCatalogueError('storage', error);
