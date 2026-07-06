import type { DocHandle } from '@automerge/automerge-repo';
import {
  appLaunchIntentBoundary,
  ContainerMountKind,
  PatchpitType,
  RuntimeMountProvider,
  rootContainer,
  SurfaceRole,
  type AppManifestDoc,
  type AppContainer,
  type ContainerMount,
  type FilesystemResource,
  type FolderDoc,
  type SeedFilesystem,
  type WindowContext,
  type WindowManagerStateDoc,
} from '@patchpit/system';
import {
  appLaunchIntent,
  runtimeError,
  runtimeIntentRequestRow,
  type AppLaunchIntentRow,
  type CapabilityRequest,
  type CapabilityPort,
  type CapabilityName,
  type IntentName,
  type IntentRequest,
  type IntentResult,
  type AutomergeHeadSet,
  type ProjectionBasis,
  type ProjectionEvent,
  type ProjectionName,
  type ProjectionSubscriptionRequest,
  type RuntimeClient,
  type RuntimeError,
} from '@patchpit/system/runtime';
import {
  relationRowCounts,
  relationSetCounts,
} from '@patchpit/system/runtime/relations';
import {
  commitWindowManagerState,
  ContextLaunchBehavior,
  launchContext,
} from '../window-manager/window-manager-state';
import { createBootstrapProjectionSubscriber } from './bootstrap-projections';
import { submitBootstrapFilePickerIntent } from './bootstrap-file-picker-intents';
import {
  badRequest,
  errorReason,
  isOptionalBoolean,
  isOptionalString,
  isRecord,
  isRuntimeError,
  rejected,
  sameHeadSet,
} from './bootstrap-intent-result';
import {
  submitBootstrapRouteIntent,
  submitBootstrapWindowIntent,
} from './bootstrap-window-intents';
import {
  surfaceWithContext,
  targetLaunchSurface,
} from './bootstrap-window-topology';
import { installedAppManifests } from './manifest-routing';
import { automergeHeadSetForHandle } from './automerge-heads';
import { allowAllRuntimePolicy, type RuntimePolicy } from './policy';
import { isPackageAppManifestDoc } from './app-manifest-discovery';

export type BootstrapRuntimeOptions = {
  readonly capabilityProviders?: readonly BootstrapCapabilityProvider[];
  readonly policy?: RuntimePolicy;
  readonly seed: SeedFilesystem;
  readonly workspaceId: string;
};

export type BootstrapRuntimeClient = RuntimeClient & {
  readonly diagnostics: BootstrapRuntimeDiagnosticsStore;
  readonly resources: BootstrapRuntimeResourceStore;
};

export type BootstrapRuntimeDiagnosticsStore = {
  getSnapshot(): BootstrapRuntimeDiagnostics;
  subscribe(listener: () => void): () => void;
};

export type BootstrapRuntimeResourceStore = {
  readonly documentUrls: BootstrapRuntimeDocumentUrls;
  readonly rootUrl: string;
  getDocument<T = unknown>(url: string): T | undefined;
  subscribeDocument(url: string, listener: () => void): () => void;
};

export type BootstrapRuntimeDocumentUrls = {
  readonly appearance: string;
  readonly darkTheme: string;
  readonly filePickerState: string;
  readonly fileTypes: string;
  readonly filesystemIndex: string;
  readonly lightTheme: string;
  readonly runtimeState: string;
  readonly windowManager: string;
};

export type BootstrapRuntimeDiagnostics = {
  readonly intentLog: readonly BootstrapIntentLogEntry[];
  readonly projectionSubscriptions: readonly BootstrapProjectionDiagnostics[];
};

export type BootstrapProjectionDiagnostics = {
  readonly basis: ProjectionBasis;
  readonly counters: {
    readonly errors: number;
    readonly patches: number;
    readonly resets: number;
    readonly snapshots: number;
  };
  readonly latestEvent?: unknown;
  readonly lastEventAt?: string;
  readonly openedAt: string;
  readonly closedAt?: string;
  readonly projection: ProjectionName;
  readonly schemaId: string;
  readonly status: 'active' | 'closed' | 'error';
  readonly subscriptionId: string;
};

export type BootstrapIntentLogEntry = {
  readonly durationMs?: number;
  readonly error?: string;
  readonly finishedAt?: string;
  readonly intent: IntentName;
  readonly request: {
    readonly baseHeadDocs: readonly string[];
    readonly idempotencyKey?: string;
    readonly input: IntentRequest['input'];
    readonly relationCounts: Readonly<Record<string, number>>;
  };
  readonly result?: unknown;
  readonly sequence: number;
  readonly startedAt: string;
  readonly status: 'pending' | IntentResult['status'] | 'thrown';
};

type BootstrapRuntimeDiagnosticsStoreInternal = BootstrapRuntimeDiagnosticsStore & {
  recordIntentResult(sequence: number, result: IntentResult): void;
  recordIntentStart(request: IntentRequest): number;
  recordIntentThrown(sequence: number, error: unknown): void;
  recordProjectionClosed(subscriptionId: string): void;
  recordProjectionEvent(subscriptionId: string, event: ProjectionEvent): void;
  recordProjectionOpened(subscriptionId: string, request: ProjectionSubscriptionRequest): void;
};

type AppLaunchRequest = {
  readonly id: string;
  readonly app: string;
  readonly behavior: ContextLaunchBehavior;
  readonly context?: WindowContext;
  readonly delegation?: string;
  readonly role: SurfaceRole;
};

type AppLaunchCommit = {
  readonly context: WindowContext;
};

export type BootstrapCapabilityProvider = {
  readonly capability: CapabilityName;
  open(request: CapabilityRequest): CapabilityPort;
};

export function createBootstrapRuntimeClient({
  capabilityProviders = [],
  policy = allowAllRuntimePolicy,
  seed,
  workspaceId,
}: BootstrapRuntimeOptions): BootstrapRuntimeClient {
  const diagnostics = createBootstrapRuntimeDiagnosticsStore();
  const resources = createBootstrapRuntimeResourceStore(seed);
  const subscribeProjection = createBootstrapProjectionSubscriber({ diagnostics, seed, workspaceId });
  const capabilityProvidersByName = capabilityProviderMap(capabilityProviders);

  return {
    diagnostics,
    resources,
    subscribeProjection,

    async submitIntent(request) {
      return submitIntentWithDiagnostics(diagnostics, request, async () => {
        const policyDecision = policy.admitIntent(request);
        if (policyDecision.status !== 'allow') {
          if (request.intent === appLaunchIntent && policyDecision.status === 'deny') {
            return appLaunchPolicyDenied(policyDecision.result);
          }
          return policyDecision.result;
        }

        const appLaunchResult = submitBootstrapAppLaunchIntent(request, {
          seed,
        });
        if (appLaunchResult !== undefined) return appLaunchResult;

        const routeResult = submitBootstrapRouteIntent(seed, request);
        if (routeResult !== undefined) return routeResult;

        const filePickerResult = submitBootstrapFilePickerIntent(seed, request);
        if (filePickerResult !== undefined) return filePickerResult;

        const windowResult = submitBootstrapWindowIntent(seed, request);
        if (windowResult !== undefined) return windowResult;

        return rejected(runtimeError('unknown_intent', `Unknown intent: ${request.intent}`));
      });
    },

    async openCapability(request) {
      return openBootstrapCapability(request, capabilityProvidersByName);
    },
  };
}

function createBootstrapRuntimeResourceStore(seed: SeedFilesystem): BootstrapRuntimeResourceStore {
  return {
    documentUrls: {
      appearance: seed.appearanceHandle.url,
      darkTheme: seed.darkThemeHandle.url,
      filePickerState: seed.filePickerStateHandle.url,
      fileTypes: seed.fileTypesHandle.url,
      filesystemIndex: seed.indexHandle.url,
      lightTheme: seed.lightThemeHandle.url,
      runtimeState: seed.runtimeStateHandle.url,
      windowManager: seed.windowManagerHandle.url,
    },
    rootUrl: seed.rootUrl,

    getDocument<T = unknown>(url: string) {
      return documentHandleForUrl(seed, url)?.doc() as T | undefined;
    },

    subscribeDocument(url: string, listener) {
      const handle = documentHandleForUrl(seed, url);
      if (handle === undefined) return () => {};
      handle.on('change', listener);
      return () => handle.off('change', listener);
    },
  };
}

function documentHandleForUrl(seed: SeedFilesystem, url: string): DocHandle<unknown> | undefined {
  if (url === seed.indexHandle.url) return seed.indexHandle as DocHandle<unknown>;
  return seed.documentHandles[url] as DocHandle<unknown> | undefined;
}

function openBootstrapCapability(
  request: CapabilityRequest,
  providers: ReadonlyMap<CapabilityName, BootstrapCapabilityProvider>,
): CapabilityPort {
  const provider = providers.get(request.capability);
  if (provider === undefined) {
    throw runtimeError('unknown_capability', `Unknown capability: ${request.capability}`);
  }

  return provider.open(request);
}

type BootstrapAppLaunchIntentOptions = {
  readonly seed: SeedFilesystem;
};

function submitBootstrapAppLaunchIntent(
  request: IntentRequest,
  options: BootstrapAppLaunchIntentOptions,
): IntentResult | undefined {
  if (request.intent !== appLaunchIntent) return undefined;

  const launch = appLaunchIntentRequest(request);
  if (isRuntimeError(launch)) return rejected(launch);

  const resolvedLaunch = resolveAppLaunchContext(options.seed, launch);
  if (isRuntimeError(resolvedLaunch)) return rejected(resolvedLaunch);

  const admissionError = prepareAppLaunchIntent(
    options.seed,
    request,
    resolvedLaunch,
  );
  if (admissionError !== undefined) {
    return appLaunchAdmissionFailure(options.seed, admissionError);
  }

  const commit = appLaunchCommit(resolvedLaunch);
  if ('code' in commit) return rejected(commit);

  try {
    commitWindowManagerState(options.seed.windowManagerHandle, (doc) => {
      launchContext(doc, {
        behavior: resolvedLaunch.behavior,
        context: commit.context,
        role: resolvedLaunch.role,
      });
    });
  } catch (error) {
    return rejected(appLaunchCommitError(resolvedLaunch, error));
  }

  const committedError = validateAppLaunchCommitted(options.seed.windowManagerHandle.doc(), commit.context);
  if (committedError !== undefined) return rejected(committedError);

  return {
    status: 'committed',
    heads: appLaunchCommitHeads(options.seed),
  };
}

const diagnosticsLogLimit = 50;

function createBootstrapRuntimeDiagnosticsStore(): BootstrapRuntimeDiagnosticsStoreInternal {
  let nextIntentSequence = 1;
  let snapshot: BootstrapRuntimeDiagnostics = {
    intentLog: [],
    projectionSubscriptions: [],
  };
  const listeners = new Set<() => void>();

  const setSnapshot = (update: (current: BootstrapRuntimeDiagnostics) => BootstrapRuntimeDiagnostics) => {
    snapshot = update(snapshot);
    for (const listener of listeners) listener();
  };

  const updateProjection = (
    subscriptionId: string,
    update: (entry: BootstrapProjectionDiagnostics) => BootstrapProjectionDiagnostics,
  ) => {
    setSnapshot((current) => ({
      ...current,
      projectionSubscriptions: current.projectionSubscriptions.map((entry) => (
        entry.subscriptionId === subscriptionId ? update(entry) : entry
      )),
    }));
  };

  return {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    recordIntentStart(request) {
      const sequence = nextIntentSequence++;
      const entry: BootstrapIntentLogEntry = {
        intent: request.intent,
        request: intentRequestDiagnostics(request),
        sequence,
        startedAt: nowIso(),
        status: 'pending',
      };
      setSnapshot((current) => ({
        ...current,
        intentLog: appendLimited(current.intentLog, entry),
      }));
      return sequence;
    },

    recordIntentResult(sequence, result) {
      updateIntentLog(setSnapshot, sequence, (entry) => ({
        ...entry,
        durationMs: elapsedMs(entry.startedAt),
        finishedAt: nowIso(),
        result: intentResultDiagnostics(result),
        status: result.status,
      }));
    },

    recordIntentThrown(sequence, error) {
      updateIntentLog(setSnapshot, sequence, (entry) => ({
        ...entry,
        durationMs: elapsedMs(entry.startedAt),
        error: errorReason(error),
        finishedAt: nowIso(),
        status: 'thrown',
      }));
    },

    recordProjectionOpened(subscriptionId, request) {
      const entry: BootstrapProjectionDiagnostics = {
        basis: request.basis ?? { kind: 'live' },
        counters: {
          errors: 0,
          patches: 0,
          resets: 0,
          snapshots: 0,
        },
        openedAt: nowIso(),
        projection: request.projection,
        schemaId: request.schemaId,
        status: 'active',
        subscriptionId,
      };
      setSnapshot((current) => ({
        ...current,
        projectionSubscriptions: appendLimited(current.projectionSubscriptions, entry),
      }));
    },

    recordProjectionEvent(subscriptionId, event) {
      updateProjection(subscriptionId, (entry) => ({
        ...entry,
        counters: projectionCountersAfterEvent(entry.counters, event),
        latestEvent: projectionEventDiagnostics(event),
        lastEventAt: nowIso(),
        status: event.type === 'error' ? 'error' : entry.status,
      }));
    },

    recordProjectionClosed(subscriptionId) {
      updateProjection(subscriptionId, (entry) => ({
        ...entry,
        closedAt: nowIso(),
        status: entry.status === 'error' ? 'error' : 'closed',
      }));
    },
  };
}

async function submitIntentWithDiagnostics(
  diagnostics: BootstrapRuntimeDiagnosticsStoreInternal,
  request: IntentRequest,
  submit: () => Promise<IntentResult>,
): Promise<IntentResult> {
  const sequence = diagnostics.recordIntentStart(request);
  try {
    const result = await submit();
    diagnostics.recordIntentResult(sequence, result);
    return result;
  } catch (error) {
    diagnostics.recordIntentThrown(sequence, error);
    throw error;
  }
}

function updateIntentLog(
  setSnapshot: (update: (current: BootstrapRuntimeDiagnostics) => BootstrapRuntimeDiagnostics) => void,
  sequence: number,
  update: (entry: BootstrapIntentLogEntry) => BootstrapIntentLogEntry,
): void {
  setSnapshot((current) => ({
    ...current,
    intentLog: current.intentLog.map((entry) => (entry.sequence === sequence ? update(entry) : entry)),
  }));
}

function intentRequestDiagnostics(request: IntentRequest): BootstrapIntentLogEntry['request'] {
  return {
    baseHeadDocs: Object.keys(request.baseHeads ?? {}).sort(),
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
    input: request.input,
    relationCounts: relationRowCounts(request.input.relations),
  };
}

function intentResultDiagnostics(result: IntentResult): unknown {
  if (result.status === 'committed') {
    return {
      status: result.status,
      effectCount: result.effects?.length ?? 0,
      headDocs: Object.keys(result.heads).sort(),
      ...(result.policy === undefined ? {} : { policy: result.policy }),
    };
  }
  if (result.status === 'conflict') {
    return {
      status: result.status,
      currentHeadDocs: Object.keys(result.currentHeads).sort(),
      ...(result.error === undefined ? {} : { error: result.error }),
    };
  }
  if (result.status === 'rejected') {
    return {
      status: result.status,
      error: result.error,
    };
  }
  if (result.status === 'queued') {
    return {
      status: result.status,
      ticket: result.ticket,
    };
  }
  return {
    status: result.status,
    reason: result.reason,
  };
}

function projectionCountersAfterEvent(
  counters: BootstrapProjectionDiagnostics['counters'],
  event: ProjectionEvent,
): BootstrapProjectionDiagnostics['counters'] {
  if (event.type === 'snapshot') return { ...counters, snapshots: counters.snapshots + 1 };
  if (event.type === 'reset') return { ...counters, resets: counters.resets + 1 };
  if (event.type === 'patch') return { ...counters, patches: counters.patches + 1 };
  return { ...counters, errors: counters.errors + 1 };
}

function projectionEventDiagnostics(event: ProjectionEvent): unknown {
  if (event.type === 'error') {
    return {
      type: event.type,
      error: event.error,
    };
  }
  if (event.type === 'patch') {
    return {
      type: event.type,
      opCount: event.patch.patch.ops.length,
      seq: event.patch.seq,
      storageHeadDocs: Object.keys(event.patch.storageHeads ?? {}).sort(),
    };
  }
  return {
    type: event.type,
    ...(event.type === 'reset' && event.reason !== undefined ? { reason: event.reason } : {}),
    relationCounts: relationSetCounts(event.snapshot.relations),
    schemaHash: event.snapshot.schemaHash,
    storageHeadDocs: Object.keys(event.snapshot.storageHeads ?? {}).sort(),
  };
}

function appendLimited<T>(entries: readonly T[], entry: T): readonly T[] {
  const next = [...entries, entry];
  return next.length > diagnosticsLogLimit ? next.slice(next.length - diagnosticsLogLimit) : next;
}

function elapsedMs(startedAt: string): number {
  return Math.max(0, Date.now() - Date.parse(startedAt));
}

function nowIso(): string {
  return new Date().toISOString();
}

function appLaunchCommit(launch: AppLaunchRequest): AppLaunchCommit | RuntimeError {
  if (launch.context !== undefined) return { context: launchContextWithDelegation(launch.context, launch.delegation) };

  return runtimeError(
    'missing_handler',
    `No app instance state handler is registered for ${launch.app} ${launch.role}.`,
  );
}

function resolveAppLaunchContext(seed: SeedFilesystem, launch: AppLaunchRequest): AppLaunchRequest | RuntimeError {
  if (launch.context !== undefined) return launch;

  const manifest = appManifestForApp(seed, launch.app);
  if (manifest === undefined) {
    return runtimeError('missing_handler', `No installed app.launch handler was found for ${launch.app}.`);
  }

  const surface = manifest.surfaces?.find((spec) => spec.role === launch.role);
  if (surface === undefined) {
    return runtimeError('missing_handler', `App ${launch.app} has no ${launch.role} launch surface.`);
  }

  if (surface.state !== undefined) {
    const existing = launch.app === 'file-picker'
      ? existingStatefulLaunchContext(seed, launch.app, surface.state.type)
      : undefined;
    return existing === undefined ? launch : { ...launch, context: existing };
  }

  const entryUrl = installedAppEntryUrl(seed, manifest);
  if (entryUrl === undefined) {
    return runtimeError('missing_handler', `App ${launch.app} entry ${manifest.entry} is not installed.`);
  }

  return {
    ...launch,
    context: {
      app: launch.app,
      container: rootContainer(seed.rootUrl),
      ...(launch.delegation === undefined ? {} : { delegation: launch.delegation }),
      id: `${launch.app}:${entryUrl}`,
      title: manifest.name,
      url: entryUrl,
    },
  };
}

function existingStatefulLaunchContext(
  seed: SeedFilesystem,
  app: string,
  stateType: string,
): WindowContext | undefined {
  return Object.values(seed.windowManagerHandle.doc().contexts).find((context) => {
    if (context.app !== app) return false;
    return seed.documentHandles[context.url]?.doc()['@patchpit'].type === stateType;
  });
}

function installedAppEntryUrl(seed: SeedFilesystem, manifest: AppManifestDoc): string | undefined {
  const root = seed.documentHandles[seed.rootUrl]?.doc();
  if (!isFolderDoc(root)) return undefined;

  const appsEntry = root.docs.find((entry) => entry.name === 'apps' && entry.type === PatchpitType.Folder);
  const appsFolder = appsEntry === undefined ? undefined : seed.documentHandles[appsEntry.url]?.doc();
  if (!isFolderDoc(appsFolder)) return undefined;

  for (const appEntry of appsFolder.docs) {
    const packageFolder = seed.documentHandles[appEntry.url]?.doc();
    if (!isFolderDoc(packageFolder)) continue;
    if (!packageContainsManifest(seed, packageFolder, manifest.id)) continue;
    const entryUrl = folderEntryUrl(seed, packageFolder, manifest.entry);
    if (entryUrl !== undefined) return entryUrl;
  }

  return undefined;
}

function packageContainsManifest(seed: SeedFilesystem, folder: FolderDoc, app: string): boolean {
  return folder.docs.some((entry) => {
    const doc = seed.documentHandles[entry.url]?.doc();
    return isPackageAppManifestDoc(doc) && doc.id === app;
  });
}

function folderEntryUrl(seed: SeedFilesystem, folder: FolderDoc, path: string): string | undefined {
  const parts = path.split('/').filter((part) => part !== '' && part !== '.');
  let current: FolderDoc | undefined = folder;
  let url: string | undefined;

  for (const part of parts) {
    const entry: FolderDoc['docs'][number] | undefined = current?.docs.find((candidate) => candidate.name === part);
    if (entry === undefined) return undefined;
    url = entry.url;
    const doc: FilesystemResource | undefined = seed.documentHandles[entry.url]?.doc();
    current = isFolderDoc(doc) ? doc : undefined;
  }

  return url;
}

function isFolderDoc(doc: FilesystemResource | undefined): doc is FolderDoc {
  return doc?.['@patchpit'].type === PatchpitType.Folder;
}

function appLaunchCommitHeads(seed: SeedFilesystem): AutomergeHeadSet {
  return mergeHeadSets(automergeHeadSetForHandle(seed.windowManagerHandle));
}

function mergeHeadSets(...headSets: readonly AutomergeHeadSet[]): AutomergeHeadSet {
  return Object.assign({}, ...headSets);
}

function capabilityProviderMap(
  providers: readonly BootstrapCapabilityProvider[],
): ReadonlyMap<CapabilityName, BootstrapCapabilityProvider> {
  const providerMap = new Map<CapabilityName, BootstrapCapabilityProvider>();
  for (const provider of providers) {
    if (providerMap.has(provider.capability)) {
      throw runtimeError('bad_request', `Duplicate capability provider for ${provider.capability}.`);
    }
    providerMap.set(provider.capability, provider);
  }
  return providerMap;
}

function appLaunchAdmissionFailure(seed: SeedFilesystem, error: RuntimeError): IntentResult {
  if (error.code !== 'conflict') return rejected(error);
  return {
    status: 'conflict',
    currentHeads: automergeHeadSetForHandle(seed.windowManagerHandle),
    error,
  };
}

function appLaunchPolicyDenied(result: IntentResult): IntentResult {
  if (result.status === 'rejected' && result.error.code === 'policy_denied') return result;
  return rejected(runtimeError(
    'policy_denied',
    'app.launch was denied by runtime policy.',
    intentResultReason(result),
  ));
}

function appLaunchCommitError(launch: AppLaunchRequest, error: unknown): RuntimeError {
  return runtimeError(
    'commit_error',
    `app.launch failed while committing ${launch.app}.`,
    errorReason(error),
  );
}

function intentResultReason(result: IntentResult): string {
  if (result.status === 'rejected') return `${result.error.code}: ${result.error.message}`;
  if (result.status === 'conflict') return result.error?.message ?? 'conflict';
  if (result.status === 'queued') return `queued ticket ${result.ticket}`;
  if (result.status === 'quarantined') return `quarantined: ${result.reason}`;
  return 'policy returned committed for a denied intent';
}

function prepareAppLaunchIntent(
  seed: SeedFilesystem,
  request: IntentRequest,
  launch: AppLaunchRequest,
): RuntimeError | undefined {
  const staleBaseError = validateAppLaunchBaseHeads(seed, request);
  if (staleBaseError !== undefined) return staleBaseError;

  const state = seed.windowManagerHandle.doc();
  const targetError = validateAppLaunchTarget(seed, state, launch);
  if (targetError !== undefined) return targetError;

  const canLaunch = (
    (launch.context !== undefined && surfaceWithContext(state, launch.context.id) !== undefined)
    || targetLaunchSurface(state, launch.role) !== undefined
    || launch.role === SurfaceRole.DocumentSet
  );
  return canLaunch ? undefined : runtimeError('conflict', `No ${launch.role} surface can accept app.launch.`);
}

function validateAppLaunchBaseHeads(
  seed: SeedFilesystem,
  request: IntentRequest,
): RuntimeError | undefined {
  const expectedHeads = request.baseHeads?.[seed.windowManagerHandle.url];
  if (expectedHeads === undefined) return undefined;

  const currentHeads = automergeHeadSetForHandle(seed.windowManagerHandle)[seed.windowManagerHandle.url] ?? [];
  if (sameHeadSet(expectedHeads, currentHeads)) return undefined;

  return runtimeError(
    'stale_target',
    'app.launch target changed since the request was prepared.',
    `window-manager heads changed for ${seed.windowManagerHandle.url}`,
  );
}

function validateAppLaunchTarget(
  seed: SeedFilesystem,
  state: WindowManagerStateDoc,
  launch: AppLaunchRequest,
): RuntimeError | undefined {
  if (launch.context === undefined) return undefined;

  const existing = state.contexts[launch.context.id];
  const existingSurface = surfaceWithContext(state, launch.context.id);
  if (existing !== undefined && existingSurface === undefined) {
    return runtimeError('stale_target', `Context ${launch.context.id} is no longer attached to a surface.`);
  }
  if (existing !== undefined && (existing.app !== launch.context.app || existing.url !== launch.context.url)) {
    return runtimeError('stale_target', `Context ${launch.context.id} no longer targets ${launch.context.url}.`);
  }
  if (!Object.hasOwn(seed.documentHandles, launch.context.url)) {
    return runtimeError('stale_target', `App launch target ${launch.context.url} is no longer available.`);
  }

  return undefined;
}

function validateAppLaunchCommitted(
  state: WindowManagerStateDoc,
  context: WindowContext,
): RuntimeError | undefined {
  const committed = state.contexts[context.id];
  if (committed?.app === context.app && committed.url === context.url && surfaceWithContext(state, context.id) !== undefined) {
    return undefined;
  }

  return runtimeError('commit_error', `app.launch commit did not attach context ${context.id}.`);
}

function appManifestForApp(seed: SeedFilesystem, app: string): AppManifestDoc | undefined {
  return installedAppManifests(seed).find((manifest) => manifest.id === app);
}

function appLaunchIntentRequest(request: IntentRequest): AppLaunchRequest | RuntimeError {
  const row = runtimeIntentRequestRow<AppLaunchIntentRow>(request, appLaunchIntentBoundary);
  if (isRuntimeError(row)) return row;
  const behavior = appLaunchBehavior(row.behavior);
  if (behavior === undefined) return badRequest('App launch request behavior is invalid.');

  const role = appLaunchSurfaceRole(row.role);
  if (role === undefined) return badRequest('App launch request role is invalid.');
  if (!isOptionalString(row.delegation)) return badRequest('App launch request delegation must be a string.');

  const context = row.context === undefined ? undefined : appLaunchContext(row.context);
  if (context instanceof Error) return badRequest(context);
  if (context !== undefined && context.app !== row.app) {
    return badRequest('App launch context app must match the request app.');
  }

  return {
    id: row.id,
    app: row.app,
    behavior,
    ...(context === undefined ? {} : { context }),
    ...(row.delegation === undefined ? {} : { delegation: row.delegation }),
    role,
  };
}

function launchContextWithDelegation(context: WindowContext, delegation: string | undefined): WindowContext {
  if (delegation === undefined) return context;
  return {
    ...context,
    delegation,
  };
}

function appLaunchBehavior(value: unknown): ContextLaunchBehavior | undefined {
  if (value === ContextLaunchBehavior.OpenContext) return ContextLaunchBehavior.OpenContext;
  if (value === ContextLaunchBehavior.ToggleSurface) return ContextLaunchBehavior.ToggleSurface;
  return undefined;
}

function appLaunchSurfaceRole(value: unknown): SurfaceRole | undefined {
  if (value === SurfaceRole.DocumentSet) return SurfaceRole.DocumentSet;
  if (value === SurfaceRole.WorkspaceView) return SurfaceRole.WorkspaceView;
  return undefined;
}

function appLaunchContext(value: unknown): WindowContext | Error {
  if (!isRecord(value)) return new Error('App launch context must be an object.');
  if (typeof value.id !== 'string') return new Error('App launch context requires an id.');
  if (typeof value.app !== 'string') return new Error('App launch context requires an app.');
  if (typeof value.url !== 'string') return new Error('App launch context requires a url.');
  if (!isOptionalString(value.delegation)) return new Error('App launch context delegation must be a string.');
  if (!isOptionalString(value.title)) return new Error('App launch context title must be a string.');

  const container = appContainer(value.container);
  if (container === undefined) return new Error('App launch context container is invalid.');

  return {
    app: value.app,
    container,
    ...(value.delegation === undefined ? {} : { delegation: value.delegation }),
    id: value.id,
    ...(value.title === undefined ? {} : { title: value.title }),
    url: value.url,
  };
}

function appContainer(value: unknown): AppContainer | undefined {
  if (!isRecord(value) || !Array.isArray(value.mounts)) return undefined;

  const mounts: ContainerMount[] = [];
  for (const mount of value.mounts) {
    const parsed = containerMount(mount);
    if (parsed === undefined) return undefined;
    mounts.push(parsed);
  }

  return { mounts };
}

function containerMount(value: unknown): ContainerMount | undefined {
  if (!isRecord(value) || typeof value.path !== 'string') return undefined;

  if (value.kind === ContainerMountKind.Automerge) {
    return typeof value.url === 'string'
      ? { kind: ContainerMountKind.Automerge, path: value.path, url: value.url }
      : undefined;
  }

  if (
    value.kind === ContainerMountKind.Runtime
    && isRuntimeMountProvider(value.provider)
    && isOptionalBoolean(value.writable)
  ) {
    return {
      kind: ContainerMountKind.Runtime,
      path: value.path,
      provider: value.provider,
      ...(value.writable === undefined ? {} : { writable: value.writable }),
    };
  }

  return undefined;
}

function isRuntimeMountProvider(value: unknown): value is RuntimeMountProvider {
  return (
    value === RuntimeMountProvider.Device
    || value === RuntimeMountProvider.Memory
    || value === RuntimeMountProvider.Proc
    || value === RuntimeMountProvider.ShellCommands
  );
}
