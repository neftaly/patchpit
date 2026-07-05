import type { DocHandle } from '@automerge/automerge-repo';
import {
  createPatchpitFilesystem,
  serveTerminalFilesystemCapability,
} from '@patchpit/terminal/filesystem';
import {
  appLaunchIntentBoundary,
  ContainerMountKind,
  PatchpitType,
  removeSystemAppResource,
  RuntimeMountProvider,
  SurfaceRole,
  terminalContainer,
  windowIntentBoundary,
  type AppManifestDoc,
  type AppContainer,
  type ContainerMount,
  type FilesystemResource,
  type SeedFilesystem,
  type TerminalStateDoc,
  type WindowContext,
  type WindowManagerStateDoc,
} from '@patchpit/system';
import {
  appLaunchIntent,
  automergeHeadSetForHandle,
  runtimeError,
  runtimeIntentRequestRow,
  terminalFilesystemCapability,
  terminalFilesystemProtocol,
  terminalFilesystemVerbs,
  windowCloseContextIntent,
  type AppLaunchIntentRow,
  type CapabilityRequest,
  type CapabilityPort,
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
  type TerminalFilesystemCapabilityGrant,
  type TerminalFilesystemVerb,
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
import { allowAllRuntimePolicy, type RuntimePolicy } from './policy';

export type BootstrapRuntimeOptions = {
  readonly createTerminalState?: () => DocHandle<TerminalStateDoc>;
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
  readonly slot: string;
};

type AppLaunchCommit = {
  readonly context: WindowContext;
  readonly terminalStateHandle?: DocHandle<TerminalStateDoc>;
};

type AppLaunchCommitOptions = {
  readonly createTerminalState?: BootstrapRuntimeOptions['createTerminalState'];
  readonly managedAppStateHandles: Map<string, DocHandle<TerminalStateDoc>>;
};

type ManagedAppStateCloseTarget = {
  readonly contextId: string;
  readonly handle: DocHandle<TerminalStateDoc>;
  readonly key: string;
};

const defaultAppLaunchSlot = 'default';
let nextCapabilityId = 1;

export function createBootstrapRuntimeClient({
  createTerminalState,
  policy = allowAllRuntimePolicy,
  seed,
  workspaceId,
}: BootstrapRuntimeOptions): BootstrapRuntimeClient {
  const diagnostics = createBootstrapRuntimeDiagnosticsStore();
  const subscribeProjection = createBootstrapProjectionSubscriber({ diagnostics, seed, workspaceId });
  const managedAppStateHandles = new Map<string, DocHandle<TerminalStateDoc>>();

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
          createTerminalState,
          managedAppStateHandles,
          seed,
        });
        if (appLaunchResult !== undefined) return appLaunchResult;

        const routeResult = submitBootstrapRouteIntent(seed, request);
        if (routeResult !== undefined) return routeResult;

        const filePickerResult = submitBootstrapFilePickerIntent(seed, request);
        if (filePickerResult !== undefined) return filePickerResult;

        const managedCloseTarget = managedAppStateCloseTarget(seed, request, managedAppStateHandles);
        const windowResult = submitBootstrapWindowIntent(seed, request);
        if (windowResult !== undefined) {
          return closeManagedAppState(seed, managedAppStateHandles, managedCloseTarget, windowResult);
        }

        return rejected(runtimeError('unknown_intent', `Unknown intent: ${request.intent}`));
      });
    },

    async openCapability(request) {
      return openBootstrapCapability(seed, request);
    },
  };
}

function openBootstrapCapability(
  seed: SeedFilesystem,
  request: CapabilityRequest,
): CapabilityPort {
  if (request.capability !== terminalFilesystemCapability) {
    throw runtimeError('unknown_capability', `Unknown capability: ${request.capability}`);
  }

  const verbs = terminalFilesystemGrantVerbs(request.verbs);
  if (verbs.length === 0) {
    throw runtimeError(
      'bad_request',
      `${terminalFilesystemCapability} request did not include any supported verbs.`,
    );
  }

  const filesystem = createPatchpitFilesystem({
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  });
  const rootUrls = terminalFilesystemRootUrls(terminalContainer(seed.rootUrl));
  const initialPathsByRoot = verbs.includes('list')
    ? terminalFilesystemInitialPathsByRoot(filesystem, rootUrls)
    : {};
  const grant: TerminalFilesystemCapabilityGrant = {
    capability: terminalFilesystemCapability,
    capabilityId: `terminal-filesystem:${nextCapabilityId++}`,
    endpoint: {
      protocol: terminalFilesystemProtocol,
      rootUrl: seed.rootUrl,
      rootUrls,
      initialPaths: initialPathsByRoot[seed.rootUrl] ?? [],
      initialPathsByRoot,
    },
    verbs,
  };
  const { port1, port2 } = new MessageChannel();
  const closeServer = serveTerminalFilesystemCapability({ filesystem, grant, port: port1 });
  let closed = false;

  return {
    close() {
      if (closed) return;
      closed = true;
      closeServer();
      port2.close();
    },
    grant,
    port: port2,
  };
}

function terminalFilesystemRootUrls(container: AppContainer): readonly string[] {
  return [...new Set(container.mounts.flatMap((mount) => (
    mount.kind === ContainerMountKind.Automerge ? [mount.url] : []
  )))].sort();
}

function terminalFilesystemInitialPathsByRoot(
  filesystem: ReturnType<typeof createPatchpitFilesystem>,
  rootUrls: readonly string[],
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(rootUrls.map((rootUrl) => [
    rootUrl,
    filesystem.openRoot(rootUrl).getAllPaths(),
  ]));
}

function terminalFilesystemGrantVerbs(
  requested: readonly string[] | undefined,
): readonly TerminalFilesystemVerb[] {
  if (requested === undefined) return terminalFilesystemVerbs;
  return terminalFilesystemVerbs.filter((verb) => requested.includes(verb));
}

type BootstrapAppLaunchIntentOptions = {
  readonly createTerminalState?: BootstrapRuntimeOptions['createTerminalState'];
  readonly managedAppStateHandles: Map<string, DocHandle<TerminalStateDoc>>;
  readonly seed: SeedFilesystem;
};

function submitBootstrapAppLaunchIntent(
  request: IntentRequest,
  options: BootstrapAppLaunchIntentOptions,
): IntentResult | undefined {
  const appLaunch = appLaunchIntentName(request.intent);
  if (appLaunch === undefined) return undefined;

  const launch = appLaunchIntentRequest(request);
  if (isRuntimeError(launch)) return rejected(launch);

  const validationError = validateAppLaunchIntent(options.seed, request, launch);
  if (validationError !== undefined) return appLaunchAdmissionFailure(options.seed, validationError);

  const commit = appLaunchCommit(options.seed.rootUrl, launch, {
    createTerminalState: options.createTerminalState,
    managedAppStateHandles: options.managedAppStateHandles,
  });
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
    return rejected(appLaunchCommitError(launch, error));
  }

  const committedError = validateAppLaunchCommitted(options.seed.windowManagerHandle.doc(), commit.context);
  if (committedError !== undefined) return rejected(committedError);

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
  rootUrl: string,
  launch: AppLaunchRequest,
  options: AppLaunchCommitOptions,
): AppLaunchCommit | RuntimeError {
  if (launch.context !== undefined) return { context: launch.context };
  if (launch.app !== 'terminal') {
    return runtimeError('missing_handler', `No managed app.launch state handler is registered for ${launch.app}.`);
  }

  const terminalStateHandle = terminalStateForLaunch(launch, options);
  if ('code' in terminalStateHandle) return terminalStateHandle;

  return {
    context: terminalContext(terminalStateHandle.url, rootUrl),
    terminalStateHandle,
  };
}

function terminalStateForLaunch(
  launch: AppLaunchRequest,
  options: AppLaunchCommitOptions,
): DocHandle<TerminalStateDoc> | RuntimeError {
  const key = appLaunchStateKey(launch);
  const existing = options.managedAppStateHandles.get(key);
  if (existing !== undefined) return existing;

  if (options.createTerminalState === undefined) {
    return runtimeError('missing_handler', 'No terminal app.launch state handler is registered.');
  }

  try {
    const handle = options.createTerminalState();
    const doc = handle.doc();
    if (doc['@patchpit'].type !== PatchpitType.TerminalState) {
      const actualType = String(doc['@patchpit'].type);
      return runtimeError(
        'commit_error',
        `Terminal app.launch state handler returned ${actualType}.`,
        `expected ${PatchpitType.TerminalState}`,
      );
    }
    options.managedAppStateHandles.set(key, handle);
    return handle;
  } catch (error) {
    return appLaunchCommitError(launch, error);
  }
}

function appLaunchStateKey(launch: AppLaunchRequest): string {
  return JSON.stringify([launch.app, launch.slot]);
}

function managedAppStateCloseTarget(
  seed: SeedFilesystem,
  request: IntentRequest,
  managedAppStateHandles: ReadonlyMap<string, DocHandle<TerminalStateDoc>>,
): ManagedAppStateCloseTarget | undefined {
  if (request.intent !== windowCloseContextIntent) return undefined;

  const row = runtimeIntentRequestRow<WindowIntentRow>(request, windowIntentBoundary);
  if (isRuntimeError(row) || typeof row.contextId !== 'string') return undefined;

  const context = seed.windowManagerHandle.doc().contexts[row.contextId];
  if (context?.app !== 'terminal') return undefined;

  for (const [key, handle] of managedAppStateHandles) {
    if (handle.url === context.url) return { contextId: context.id, handle, key };
  }

  return undefined;
}

function closeManagedAppState(
  seed: SeedFilesystem,
  managedAppStateHandles: Map<string, DocHandle<TerminalStateDoc>>,
  target: ManagedAppStateCloseTarget | undefined,
  result: IntentResult,
): IntentResult {
  if (target === undefined || result.status !== 'committed') return result;
  if (seed.windowManagerHandle.doc().contexts[target.contextId] !== undefined) return result;
  if (managedAppStateHandles.get(target.key)?.url !== target.handle.url) return result;

  managedAppStateHandles.delete(target.key);
  const removed = removeSystemAppResource(seed, target.handle.url);
  if (!removed) return result;

  return {
    ...result,
    heads: mergeHeadSets(
      result.heads,
      automergeHeadSetForHandle(seed.systemAppsHandle),
      automergeHeadSetForHandle(seed.indexHandle),
    ),
  };
}

function appLaunchCommitHeads(seed: SeedFilesystem, commit: AppLaunchCommit): AutomergeHeadSet {
  return mergeHeadSets(
    automergeHeadSetForHandle(seed.windowManagerHandle),
    ...(commit.terminalStateHandle === undefined
      ? []
      : [
          automergeHeadSetForHandle(commit.terminalStateHandle),
          automergeHeadSetForHandle(seed.systemAppsHandle),
          automergeHeadSetForHandle(seed.indexHandle),
        ]),
  );
}

function mergeHeadSets(...headSets: readonly AutomergeHeadSet[]): AutomergeHeadSet {
  return Object.assign({}, ...headSets);
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
    `app.launch failed while committing ${launch.app} slot ${launch.slot}.`,
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

function validateAppLaunchIntent(
  seed: SeedFilesystem,
  request: IntentRequest,
  launch: AppLaunchRequest,
): RuntimeError | undefined {
  const handlerError = validateAppLaunchHandler(seed, launch);
  if (handlerError !== undefined) return handlerError;

  const staleBaseError = validateAppLaunchBaseHeads(seed, request);
  if (staleBaseError !== undefined) return staleBaseError;

  const state = seed.windowManagerHandle.doc();
  const targetError = validateAppLaunchTarget(seed, state, launch);
  if (targetError !== undefined) return targetError;

  if (launch.context !== undefined && surfaceWithContext(state, launch.context.id) !== undefined) return undefined;
  if (targetLaunchSurface(state, launch.role) !== undefined) return undefined;
  if (launch.role === SurfaceRole.DocumentSet) return undefined;
  return runtimeError('conflict', `No ${launch.role} surface can accept app.launch.`);
}

function validateAppLaunchHandler(
  seed: SeedFilesystem,
  launch: AppLaunchRequest,
): RuntimeError | undefined {
  const manifest = appManifestForApp(seed, launch.app);
  if (manifest === undefined) {
    return runtimeError('missing_handler', `No installed app.launch handler was found for ${launch.app}.`);
  }

  const surface = manifest.surfaces?.find((spec) => spec.role === launch.role);
  if (surface === undefined) {
    return runtimeError('missing_handler', `App ${launch.app} has no ${launch.role} launch surface.`);
  }

  if (launch.context === undefined && surface.state === undefined) {
    return runtimeError('missing_handler', `App ${launch.app} has no persisted launch state for ${launch.role}.`);
  }

  if (
    launch.app === 'terminal'
    && launch.context === undefined
    && surface.state?.type !== PatchpitType.TerminalState
  ) {
    return runtimeError(
      'missing_handler',
      `Terminal app.launch state type ${surface.state?.type ?? '<missing>'} is unsupported.`,
      `expected ${PatchpitType.TerminalState}`,
    );
  }

  return undefined;
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

function appLaunchIntentName(intent: IntentRequest['intent']): typeof appLaunchIntent | undefined {
  return intent === appLaunchIntent ? intent : undefined;
}

function appLaunchIntentRequest(request: IntentRequest): AppLaunchRequest | RuntimeError {
  const row = runtimeIntentRequestRow<AppLaunchIntentRow>(request, appLaunchIntentBoundary);
  if (isRuntimeError(row)) return row;
  const behavior = appLaunchBehavior(row.behavior);
  if (behavior === undefined) return badRequest('App launch request behavior is invalid.');

  const role = appLaunchSurfaceRole(row.role);
  if (role === undefined) return badRequest('App launch request role is invalid.');

  const slot = appLaunchSlot(row.slot);
  if (slot instanceof Error) return badRequest(slot);

  if (row.app === 'terminal') {
    if (row.context !== undefined) return badRequest('Terminal app launch creates its context at commit time.');
    if (behavior !== ContextLaunchBehavior.OpenContext) return badRequest('Terminal app launch behavior is invalid.');
    if (role !== SurfaceRole.DocumentSet) return badRequest('Terminal app launch role is invalid.');
    return {
      id: row.id,
      app: row.app,
      behavior,
      role,
      slot,
    };
  }

  const context = appLaunchContext(row.context);
  if (context instanceof Error) return badRequest(context);
  if (context.app !== row.app) return badRequest('App launch context app must match the request app.');

  return {
    id: row.id,
    app: row.app,
    behavior,
    context,
    role,
    slot,
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

function appLaunchSlot(value: unknown): string | Error {
  if (value === undefined) return defaultAppLaunchSlot;
  if (typeof value === 'string' && value.trim() !== '') return value;
  return new Error('App launch request slot must be a non-empty string.');
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

function terminalContext(url: string, rootUrl: string): WindowContext {
  return {
    app: 'terminal',
    container: terminalContainer(rootUrl),
    id: `terminal:${url}`,
    url,
  };
}

function isRuntimeMountProvider(value: unknown): value is RuntimeMountProvider {
  return (
    value === RuntimeMountProvider.Device
    || value === RuntimeMountProvider.Memory
    || value === RuntimeMountProvider.Proc
    || value === RuntimeMountProvider.ShellCommands
  );
}
