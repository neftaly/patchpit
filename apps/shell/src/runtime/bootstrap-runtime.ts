import type { DocHandle } from '@automerge/automerge-repo';
import {
  appLaunchIntentBoundary,
  ContainerMountKind,
  PatchpitType,
  removeSystemAppResource,
  RuntimeMountProvider,
  SurfaceRole,
  windowIntentBoundary,
  type AppManifestDoc,
  type AppContainer,
  type ContainerMount,
  type FilesystemResource,
  type RuntimeAppInstanceState,
  type SeedFilesystem,
  type WindowContext,
  type WindowManagerStateDoc,
} from '@patchpit/system';
import {
  appLaunchIntent,
  automergeHeadSetForHandle,
  runtimeError,
  runtimeIntentRequestRow,
  windowCloseContextIntent,
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
  type WindowIntentRow,
} from '@patchpit/system/runtime';
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
import type { AppInstanceStateHandler } from './app-instance-state';
import { allowAllRuntimePolicy, type RuntimePolicy } from './policy';

export type BootstrapRuntimeOptions = {
  readonly appInstanceStateHandlers?: readonly AppInstanceStateHandler[];
  readonly capabilityProviders?: readonly BootstrapCapabilityProvider[];
  readonly policy?: RuntimePolicy;
  readonly seed: SeedFilesystem;
  readonly workspaceId: string;
};

export type BootstrapRuntimeClient = RuntimeClient & {
  readonly diagnostics: BootstrapRuntimeDiagnosticsStore;
};

export type BootstrapRuntimeDiagnosticsStore = {
  getSnapshot(): BootstrapRuntimeDiagnostics;
  subscribe(listener: () => void): () => void;
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
  readonly role: SurfaceRole;
};

type AppLaunchCommit = {
  readonly context: WindowContext;
  readonly appInstanceStateHandle?: DocHandle<FilesystemResource>;
};

type AppLaunchSurface = NonNullable<AppManifestDoc['surfaces']>[number];

export type BootstrapCapabilityProvider = {
  readonly capability: CapabilityName;
  open(request: CapabilityRequest): CapabilityPort;
};

type AppInstanceStateFreshness = {
  readonly preexistingUrls: ReadonlySet<string>;
};

export function createBootstrapRuntimeClient({
  appInstanceStateHandlers = [],
  capabilityProviders = [],
  policy = allowAllRuntimePolicy,
  seed,
  workspaceId,
}: BootstrapRuntimeOptions): BootstrapRuntimeClient {
  const diagnostics = createBootstrapRuntimeDiagnosticsStore();
  const subscribeProjection = createBootstrapProjectionSubscriber({ diagnostics, seed, workspaceId });
  const appInstanceStateHandlersByType = appInstanceStateHandlerMap(appInstanceStateHandlers);
  const capabilityProvidersByName = capabilityProviderMap(capabilityProviders);

  return {
    diagnostics,
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
          appInstanceStateHandlers: appInstanceStateHandlersByType,
          seed,
        });
        if (appLaunchResult !== undefined) return appLaunchResult;

        const routeResult = submitBootstrapRouteIntent(seed, request);
        if (routeResult !== undefined) return routeResult;

        const filePickerResult = submitBootstrapFilePickerIntent(seed, request);
        if (filePickerResult !== undefined) return filePickerResult;

        const instanceCloseTarget = appInstanceStateCloseTarget(seed, request);
        const windowResult = submitBootstrapWindowIntent(seed, request);
        if (windowResult !== undefined) {
          return closeAppInstanceState(seed, instanceCloseTarget, windowResult);
        }

        return rejected(runtimeError('unknown_intent', `Unknown intent: ${request.intent}`));
      });
    },

    async openCapability(request) {
      return openBootstrapCapability(request, capabilityProvidersByName);
    },
  };
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
  readonly appInstanceStateHandlers: ReadonlyMap<string, AppInstanceStateHandler>;
  readonly seed: SeedFilesystem;
};

function submitBootstrapAppLaunchIntent(
  request: IntentRequest,
  options: BootstrapAppLaunchIntentOptions,
): IntentResult | undefined {
  if (request.intent !== appLaunchIntent) return undefined;

  const launch = appLaunchIntentRequest(request);
  if (isRuntimeError(launch)) return rejected(launch);

  const appInstanceStateHandler = prepareAppLaunchIntent(
    options.seed,
    request,
    launch,
    options.appInstanceStateHandlers,
  );
  if (isRuntimeError(appInstanceStateHandler)) {
    return appLaunchAdmissionFailure(options.seed, appInstanceStateHandler);
  }

  const commit = appLaunchCommit(options.seed, launch, appInstanceStateHandler);
  if ('code' in commit) return rejected(commit);

  try {
    commitWindowManagerState(options.seed.windowManagerHandle, (doc) => {
      launchContext(doc, {
        behavior: launch.behavior,
        context: commit.context,
        role: launch.role,
      });
    });
  } catch (error) {
    rollbackAppInstanceState(options.seed, commit.appInstanceStateHandle);
    return rejected(appLaunchCommitError(launch, error));
  }

  const committedError = validateAppLaunchCommitted(options.seed.windowManagerHandle.doc(), commit.context);
  if (committedError !== undefined) {
    rollbackAppInstanceState(options.seed, commit.appInstanceStateHandle);
    return rejected(committedError);
  }

  registerAppInstanceState(options.seed, commit);

  return {
    status: 'committed',
    heads: appLaunchCommitHeads(options.seed, commit),
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
    relationCounts: relationCounts(request.input.relations),
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
    relationCounts: relationCounts(event.snapshot.relations.relations),
    schemaHash: event.snapshot.schemaHash,
    storageHeadDocs: Object.keys(event.snapshot.storageHeads ?? {}).sort(),
  };
}

function relationCounts(relations: Readonly<Record<string, readonly unknown[]>>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(relations)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, rows]) => [name, rows.length]),
  );
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

function appLaunchCommit(
  seed: SeedFilesystem,
  launch: AppLaunchRequest,
  appInstanceStateHandler: AppInstanceStateHandler | undefined,
): AppLaunchCommit | RuntimeError {
  if (launch.context !== undefined) return { context: launch.context };

  const handler = appInstanceStateHandler ?? runtimeError(
    'missing_handler',
    `No app instance state handler is registered for ${launch.app} ${launch.role}.`,
  );
  if (isRuntimeError(handler)) return handler;

  const freshness = appInstanceStateFreshness(seed);
  let stateHandle: DocHandle<FilesystemResource> | undefined;

  try {
    stateHandle = handler.createState();
    const stateError = validateCreatedAppInstanceState(seed, launch, handler, freshness, stateHandle);
    if (stateError !== undefined) {
      rollbackNewAppInstanceStateResources(seed, handler, freshness);
      return stateError;
    }

    const context = handler.createContext({
      app: launch.app,
      rootUrl: seed.rootUrl,
      stateHandle,
    });
    const contextError = validateCreatedAppInstanceContext(launch, stateHandle, context);
    if (contextError !== undefined) {
      rollbackAppInstanceState(seed, stateHandle, freshness);
      rollbackNewAppInstanceStateResources(seed, handler, freshness);
      return contextError;
    }

    return {
      context,
      appInstanceStateHandle: stateHandle,
    };
  } catch (error) {
    rollbackAppInstanceState(seed, stateHandle, freshness);
    rollbackNewAppInstanceStateResources(seed, handler, freshness);
    return appLaunchCommitError(launch, error);
  }
}

function validateCreatedAppInstanceState(
  seed: SeedFilesystem,
  launch: AppLaunchRequest,
  handler: AppInstanceStateHandler,
  freshness: AppInstanceStateFreshness,
  handle: DocHandle<FilesystemResource>,
): RuntimeError | undefined {
  const handleUrl = appInstanceStateHandleUrl(handle);
  if (handleUrl === undefined || !isDocHandle(handle)) {
    rollbackAppInstanceState(seed, handle, freshness);
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned an invalid state doc.`,
    );
  }

  if (freshness.preexistingUrls.has(handleUrl)) {
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned a preexisting state doc.`,
      handleUrl,
    );
  }

  const doc = handle.doc();
  const actualType = doc['@patchpit']?.type;
  if (actualType !== handler.stateType) {
    rollbackAppInstanceState(seed, handle, freshness);
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned ${String(actualType)}.`,
      `expected ${handler.stateType}`,
    );
  }

  if (seed.documentHandles[handle.url] !== handle) {
    rollbackAppInstanceState(seed, handle, freshness);
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned an unregistered state doc.`,
      handle.url,
    );
  }

  const systemAppEntries = seed.systemAppsHandle.doc().docs.filter((entry) => entry.url === handle.url);
  if (systemAppEntries.length !== 1 || systemAppEntries[0]?.type !== handler.stateType) {
    rollbackAppInstanceState(seed, handle, freshness);
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} did not register ${handle.url} under /system/apps.`,
      `expected ${handler.stateType}`,
    );
  }

  if (seed.runtimeStateHandle.doc().appInstances.some((entry) => entry.stateUrl === handle.url)) {
    rollbackAppInstanceState(seed, handle, freshness);
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned an active state doc.`,
      handle.url,
    );
  }

  return undefined;
}

function validateCreatedAppInstanceContext(
  launch: AppLaunchRequest,
  stateHandle: DocHandle<FilesystemResource>,
  context: WindowContext,
): RuntimeError | undefined {
  if (
    !isRecord(context)
    || typeof context.id !== 'string'
    || typeof context.app !== 'string'
    || typeof context.url !== 'string'
  ) {
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned an invalid context.`,
    );
  }

  if (context.app !== launch.app) {
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned context app ${context.app}.`,
    );
  }
  if (context.url !== stateHandle.url) {
    return runtimeError(
      'commit_error',
      `App instance state handler for ${launch.app} returned context url ${context.url}.`,
      `expected ${stateHandle.url}`,
    );
  }
  return undefined;
}

function registerAppInstanceState(seed: SeedFilesystem, commit: AppLaunchCommit): void {
  const stateHandle = commit.appInstanceStateHandle;
  if (stateHandle === undefined) return;
  const stateType = String(stateHandle.doc()['@patchpit'].type);
  const entry: RuntimeAppInstanceState = {
    app: commit.context.app,
    contextId: commit.context.id,
    stateType,
    stateUrl: stateHandle.url,
  };

  seed.runtimeStateHandle.change((doc) => {
    const existingIndex = doc.appInstances.findIndex((candidate) => (
      candidate.contextId === entry.contextId || candidate.stateUrl === entry.stateUrl
    ));
    if (existingIndex === -1) doc.appInstances.push(entry);
    else doc.appInstances[existingIndex] = entry;
  });
}

function appInstanceStateCloseTarget(
  seed: SeedFilesystem,
  request: IntentRequest,
): RuntimeAppInstanceState | undefined {
  if (request.intent !== windowCloseContextIntent) return undefined;

  const row = runtimeIntentRequestRow<WindowIntentRow>(request, windowIntentBoundary);
  if (isRuntimeError(row) || typeof row.contextId !== 'string') return undefined;

  const context = seed.windowManagerHandle.doc().contexts[row.contextId];
  if (context === undefined) return undefined;
  return appInstanceStateForContext(seed, context);
}

function appInstanceStateForContext(
  seed: SeedFilesystem,
  context: WindowContext,
): RuntimeAppInstanceState | undefined {
  return seed.runtimeStateHandle.doc().appInstances.find((entry) => (
    entry.contextId === context.id && entry.stateUrl === context.url
  ));
}

function closeAppInstanceState(
  seed: SeedFilesystem,
  target: RuntimeAppInstanceState | undefined,
  result: IntentResult,
): IntentResult {
  if (target === undefined || result.status !== 'committed') return result;
  if (seed.windowManagerHandle.doc().contexts[target.contextId] !== undefined) return result;

  const removedAppInstance = removeRuntimeAppInstanceState(seed, target);
  const removedSystemResource = removeMatchingSystemAppResource(seed, target);
  if (!removedAppInstance && !removedSystemResource) return result;

  return {
    ...result,
    heads: mergeHeadSets(
      result.heads,
      ...(removedAppInstance ? [automergeHeadSetForHandle(seed.runtimeStateHandle)] : []),
      ...(removedSystemResource
        ? [
            automergeHeadSetForHandle(seed.systemAppsHandle),
            automergeHeadSetForHandle(seed.indexHandle),
          ]
        : []),
    ),
  };
}

function rollbackAppInstanceState(
  seed: SeedFilesystem,
  handle: unknown,
  freshness?: AppInstanceStateFreshness,
): void {
  const url = appInstanceStateHandleUrl(handle);
  if (url === undefined) return;
  if (freshness?.preexistingUrls.has(url)) return;
  removeSystemAppResource(seed, url);
}

function rollbackNewAppInstanceStateResources(
  seed: SeedFilesystem,
  handler: AppInstanceStateHandler,
  freshness: AppInstanceStateFreshness,
): void {
  const urls = seed.systemAppsHandle.doc().docs
    .filter((entry) => entry.type === handler.stateType && !freshness.preexistingUrls.has(entry.url))
    .map((entry) => entry.url);
  for (const url of urls) {
    removeSystemAppResource(seed, url);
  }
}

function appInstanceStateFreshness(seed: SeedFilesystem): AppInstanceStateFreshness {
  return {
    preexistingUrls: new Set([
      ...Object.keys(seed.documentHandles),
      ...seed.runtimeStateHandle.doc().appInstances.map((entry) => entry.stateUrl),
      ...seed.systemAppsHandle.doc().docs.map((entry) => entry.url),
    ]),
  };
}

function appInstanceStateHandleUrl(handle: unknown): string | undefined {
  const candidate = handle as { readonly url?: unknown };
  return isRecord(handle) && typeof candidate.url === 'string' ? candidate.url : undefined;
}

function isDocHandle(handle: unknown): handle is DocHandle<FilesystemResource> {
  const candidate = handle as { readonly doc?: unknown };
  return appInstanceStateHandleUrl(handle) !== undefined && typeof candidate.doc === 'function';
}

function removeMatchingSystemAppResource(
  seed: SeedFilesystem,
  target: RuntimeAppInstanceState,
): boolean {
  const systemAppEntry = seed.systemAppsHandle.doc().docs.find((entry) => (
    entry.url === target.stateUrl && entry.type === target.stateType
  ));
  if (systemAppEntry === undefined) return false;

  const handle = seed.documentHandles[target.stateUrl];
  if (handle !== undefined && handle.doc()['@patchpit'].type !== target.stateType) return false;

  return removeSystemAppResource(seed, target.stateUrl);
}

function removeRuntimeAppInstanceState(
  seed: SeedFilesystem,
  target: RuntimeAppInstanceState,
): boolean {
  let removed = false;
  seed.runtimeStateHandle.change((doc) => {
    const index = doc.appInstances.findIndex((entry) => (
      entry.contextId === target.contextId && entry.stateUrl === target.stateUrl
    ));
    removed = index !== -1;
    if (removed) doc.appInstances.splice(index, 1);
  });
  return removed;
}

function appLaunchCommitHeads(seed: SeedFilesystem, commit: AppLaunchCommit): AutomergeHeadSet {
  return mergeHeadSets(
    automergeHeadSetForHandle(seed.windowManagerHandle),
    ...(commit.appInstanceStateHandle === undefined
      ? []
      : [
          automergeHeadSetForHandle(commit.appInstanceStateHandle),
          automergeHeadSetForHandle(seed.runtimeStateHandle),
          automergeHeadSetForHandle(seed.systemAppsHandle),
          automergeHeadSetForHandle(seed.indexHandle),
        ]),
  );
}

function mergeHeadSets(...headSets: readonly AutomergeHeadSet[]): AutomergeHeadSet {
  return Object.assign({}, ...headSets);
}

function appInstanceStateHandlerMap(
  handlers: readonly AppInstanceStateHandler[],
): ReadonlyMap<string, AppInstanceStateHandler> {
  const handlerMap = new Map<string, AppInstanceStateHandler>();
  for (const handler of handlers) {
    const key = appInstanceStateHandlerKey(handler.app, handler.stateType);
    if (handlerMap.has(key)) {
      throw runtimeError(
        'bad_request',
        `Duplicate app instance state handler for ${handler.app}.`,
        `state type ${handler.stateType}`,
      );
    }
    handlerMap.set(key, handler);
  }
  return handlerMap;
}

function appInstanceStateHandlerKey(app: string, stateType: string): string {
  return `${app}\u0000${stateType}`;
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
  appInstanceStateHandlers: ReadonlyMap<string, AppInstanceStateHandler>,
): AppInstanceStateHandler | RuntimeError | undefined {
  const appInstanceStateHandler = appLaunchStateHandler(seed, launch, appInstanceStateHandlers);
  if (isRuntimeError(appInstanceStateHandler)) return appInstanceStateHandler;

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
  return canLaunch ? appInstanceStateHandler : runtimeError('conflict', `No ${launch.role} surface can accept app.launch.`);
}

function appLaunchStateHandler(
  seed: SeedFilesystem,
  launch: AppLaunchRequest,
  appInstanceStateHandlers: ReadonlyMap<string, AppInstanceStateHandler>,
): AppInstanceStateHandler | RuntimeError | undefined {
  const surface = appLaunchSurface(seed, launch);
  if (isRuntimeError(surface)) return surface;
  if (launch.context !== undefined) return undefined;
  if (surface.state === undefined) {
    return runtimeError('missing_handler', `App ${launch.app} has no persisted launch state for ${launch.role}.`);
  }

  const handler = appInstanceStateHandlers.get(appInstanceStateHandlerKey(launch.app, surface.state.type));
  return handler ?? runtimeError(
    'missing_handler',
    `No app instance state handler is registered for ${launch.app} ${launch.role}.`,
    `state type ${surface.state.type}`,
  );
}

function appLaunchSurface(seed: SeedFilesystem, launch: AppLaunchRequest): AppLaunchSurface | RuntimeError {
  const manifest = appManifestForApp(seed, launch.app);
  if (manifest === undefined) {
    return runtimeError('missing_handler', `No installed app.launch handler was found for ${launch.app}.`);
  }

  const surface = manifest.surfaces?.find((spec) => spec.role === launch.role);
  if (surface === undefined) {
    return runtimeError('missing_handler', `App ${launch.app} has no ${launch.role} launch surface.`);
  }

  return surface;
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
  return Object.values(seed.documentHandles)
    .map((handle) => handle.doc())
    .find((doc): doc is AppManifestDoc => isAppManifestDoc(doc) && doc.id === app);
}

function isAppManifestDoc(doc: FilesystemResource): doc is AppManifestDoc {
  return doc['@patchpit'].type === PatchpitType.AppManifest;
}

function appLaunchIntentRequest(request: IntentRequest): AppLaunchRequest | RuntimeError {
  const row = runtimeIntentRequestRow<AppLaunchIntentRow>(request, appLaunchIntentBoundary);
  if (isRuntimeError(row)) return row;
  const behavior = appLaunchBehavior(row.behavior);
  if (behavior === undefined) return badRequest('App launch request behavior is invalid.');

  const role = appLaunchSurfaceRole(row.role);
  if (role === undefined) return badRequest('App launch request role is invalid.');

  const context = row.context === undefined ? undefined : appLaunchContext(row.context);
  if (context instanceof Error) return badRequest(context);
  if (context !== undefined && context.app !== row.app) {
    return badRequest('App launch context app must match the request app.');
  }
  if (context === undefined && behavior === ContextLaunchBehavior.ToggleSurface) {
    return badRequest('Context-less app.launch cannot use toggle-surface; provide an explicit context.');
  }

  return {
    id: row.id,
    app: row.app,
    behavior,
    ...(context === undefined ? {} : { context }),
    role,
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
  if (!isOptionalString(value.title)) return new Error('App launch context title must be a string.');

  const container = appContainer(value.container);
  if (container === undefined) return new Error('App launch context container is invalid.');

  return {
    app: value.app,
    container,
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
