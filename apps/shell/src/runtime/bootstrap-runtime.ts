import type { DocHandle } from '@automerge/automerge-repo';
import {
  selectFilePickerUrl,
  toggleFilePickerFolder,
} from '@patchpit/file-picker/state';
import type { FileSelectionOptions } from '@patchpit/file-picker/model';
import {
  appLaunchIntentBoundary,
  filePickerIntentBoundary,
  routeIntentBoundary,
  ContainerMountKind,
  PatchpitType,
  RuntimeMountProvider,
  rootContainer,
  SurfaceRole,
  terminalContainer,
  windowIntentBoundary,
  WindowManagerNodeKind,
  type AppManifestDoc,
  type AppContainer,
  type ContainerMount,
  type FilesystemResource,
  type SeedFilesystem,
  type TerminalStateDoc,
  type WindowContext,
  type WindowLayoutNode,
  type WindowManagerStateDoc,
  type WindowSurface,
} from '@patchpit/system';
import {
  appLaunchIntent,
  automergeHeadSetForHandle,
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  routeOpenIntent,
  routePreviewIntent,
  runtimeError,
  runtimeIntentRequestRow,
  windowCloseContextIntent,
  windowFocusIntent,
  windowMoveTabIntent,
  windowPinPreviewIntent,
  windowResizeSplitIntent,
  type AppLaunchIntentRow,
  type FilePickerIntentRow,
  type IntentName,
  type IntentRequest,
  type IntentResult,
  type Json,
  type AutomergeHeadSet,
  type ProjectionBasis,
  type ProjectionEvent,
  type ProjectionName,
  type ProjectionSubscriptionRequest,
  type RouteIntentRow,
  type RuntimeClient,
  type RuntimeError,
  type WindowIntentRow,
} from '@patchpit/system/runtime';
import {
  closeContext,
  commitWindowManagerState,
  ContextLaunchBehavior,
  dropNewContext,
  dropContext,
  focusContext,
  launchContext,
  openContext,
  pinContext,
  previewContext,
  resizeSplit,
  type ContextDropTarget,
  type SplitPath,
} from '../window-manager/window-manager-state';
import { createBootstrapProjectionSubscriber } from './bootstrap-projections';
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

type FilePickerIntentName =
  | typeof filePickerSelectUrlIntent
  | typeof filePickerToggleFolderIntent;

const defaultAppLaunchSlot = 'default';

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

      const appLaunch = appLaunchIntentName(request.intent);
      if (appLaunch !== undefined) {
        const launch = appLaunchIntentRequest(request);
        if (isRuntimeError(launch)) return rejected(launch);

        const validationError = validateAppLaunchIntent(seed, request, launch);
        if (validationError !== undefined) return appLaunchAdmissionFailure(seed, validationError);

        const commit = appLaunchCommit(seed.rootUrl, launch, {
          createTerminalState,
          managedAppStateHandles,
        });
        if ('code' in commit) return rejected(commit);

        try {
          commitWindowManagerState(seed.windowManagerHandle, (doc) => {
            launchContext(doc, {
              behavior: launch.behavior,
              context: commit.context,
              role: launch.role,
            });
          });
        } catch (error) {
          return rejected(appLaunchCommitError(launch, error));
        }

        const committedError = validateAppLaunchCommitted(seed.windowManagerHandle.doc(), commit.context);
        if (committedError !== undefined) return rejected(committedError);

        return {
          status: 'committed',
          heads: appLaunchCommitHeads(seed, commit),
        };
      }

      const intent = routeIntentName(request.intent);
      if (intent !== undefined) {
        const route = routeIntentRequest(request);
        if (isRuntimeError(route)) return rejected(route);

        const validationError = validateRouteIntent(seed.windowManagerHandle.doc(), intent, route);
        if (validationError !== undefined) return rejected(validationError);

        commitWindowManagerState(seed.windowManagerHandle, (doc) => {
          commitRouteIntent(doc, intent, route, seed.rootUrl);
        });

        return {
          status: 'committed',
          heads: automergeHeadSetForHandle(seed.windowManagerHandle),
        };
      }

      const filePickerIntent = filePickerIntentName(request.intent);
      if (filePickerIntent !== undefined) {
        const filePickerRequest = filePickerIntentRequest(request, filePickerIntent);
        if (isRuntimeError(filePickerRequest)) return rejected(filePickerRequest);

        if (filePickerIntent === filePickerSelectUrlIntent) {
          selectFilePickerUrl(
            seed.filePickerStateHandle,
            filePickerRequest.url,
            filePickerSelectionOptions(filePickerRequest),
          );
        } else {
          toggleFilePickerFolder(seed.filePickerStateHandle, filePickerRequest.url);
        }

        return {
          status: 'committed',
          heads: automergeHeadSetForHandle(seed.filePickerStateHandle),
        };
      }

      const windowIntent = windowIntentName(request.intent);
      if (windowIntent === undefined) {
        return rejected(runtimeError('unknown_intent', `Unknown intent: ${request.intent}`));
      }
      const windowRequest = windowIntentRequest(request, windowIntent);
      if (isRuntimeError(windowRequest)) return rejected(windowRequest);

      const validationError = validateWindowIntent(seed.windowManagerHandle.doc(), windowIntent, windowRequest);
      if (validationError !== undefined) return rejected(validationError);

      commitWindowManagerState(seed.windowManagerHandle, (doc) => {
        commitWindowIntent(doc, windowIntent, windowRequest);
      });

      return {
        status: 'committed',
        heads: automergeHeadSetForHandle(seed.windowManagerHandle),
      };
      });
    },

    async openCapability(request) {
      throw runtimeError('unknown_capability', `Unknown capability: ${request.capability}`);
    },
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

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameHeadSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightHeads = new Set(right);
  return left.every((head) => rightHeads.has(head));
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

function validateRouteIntent(
  state: WindowManagerStateDoc,
  intent: typeof routeOpenIntent | typeof routePreviewIntent,
  route: RouteIntentRow,
): RuntimeError | undefined {
  const target = contextDropTarget(route.target);
  if (target !== undefined) return validateNewContextDropTarget(state, target);
  if (targetDocumentSurface(state, route.sourceSurfaceId) !== undefined) return undefined;
  if (Object.keys(state.surfaces).length > 0) return undefined;
  return runtimeError('conflict', `No document surface can accept ${intent}.`);
}

function commitRouteIntent(
  doc: WindowManagerStateDoc,
  intent: typeof routeOpenIntent | typeof routePreviewIntent,
  route: RouteIntentRow,
  defaultRootUrl: string,
): void {
  const context = viewerContext(route.url, route.title, route.rootUrl ?? defaultRootUrl);
  const target = contextDropTarget(route.target);

  if (target !== undefined) {
    dropNewContext(doc, context, target);
  } else if (intent === routeOpenIntent) {
    openContext(doc, context, route.sourceSurfaceId);
  } else {
    previewContext(doc, context, route.sourceSurfaceId);
  }
}

function routeIntentName(intent: IntentRequest['intent']): typeof routeOpenIntent | typeof routePreviewIntent | undefined {
  return intent === routeOpenIntent || intent === routePreviewIntent ? intent : undefined;
}

function filePickerIntentName(intent: IntentRequest['intent']): FilePickerIntentName | undefined {
  return (
    intent === filePickerSelectUrlIntent
    || intent === filePickerToggleFolderIntent
  )
    ? intent
    : undefined;
}

function appLaunchIntentName(intent: IntentRequest['intent']): typeof appLaunchIntent | undefined {
  return intent === appLaunchIntent ? intent : undefined;
}

function windowIntentName(intent: IntentRequest['intent']):
  | typeof windowCloseContextIntent
  | typeof windowFocusIntent
  | typeof windowMoveTabIntent
  | typeof windowPinPreviewIntent
  | typeof windowResizeSplitIntent
  | undefined {
  return (
    intent === windowCloseContextIntent
    || intent === windowFocusIntent
    || intent === windowMoveTabIntent
    || intent === windowPinPreviewIntent
    || intent === windowResizeSplitIntent
  )
    ? intent
    : undefined;
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

function routeIntentRequest(request: IntentRequest): RouteIntentRow | RuntimeError {
  const row = runtimeIntentRequestRow<RouteIntentRow>(request, routeIntentBoundary);
  if (isRuntimeError(row)) return row;
  if (row.target !== undefined && contextDropTarget(row.target) === undefined) {
    return badRequest('Route request target is invalid.');
  }

  return {
    id: row.id,
    url: row.url,
    ...(row.rootUrl === undefined ? {} : { rootUrl: row.rootUrl }),
    ...(row.sourceSurfaceId === undefined ? {} : { sourceSurfaceId: row.sourceSurfaceId }),
    ...(row.target === undefined ? {} : { target: row.target }),
    ...(row.title === undefined ? {} : { title: row.title }),
  };
}

function filePickerIntentRequest(
  request: IntentRequest,
  intent: FilePickerIntentName,
): FilePickerIntentRow | RuntimeError {
  const row = runtimeIntentRequestRow<FilePickerIntentRow>(request, filePickerIntentBoundary);
  if (isRuntimeError(row)) return row;
  if (row.range !== undefined && !isStringArray(row.range)) {
    return badRequest('File picker request range must be an array of strings.');
  }
  if (
    intent === filePickerToggleFolderIntent
    && (row.range !== undefined || row.toggle !== undefined)
  ) {
    return badRequest(`${filePickerToggleFolderIntent} only accepts id and url.`);
  }

  return {
    id: row.id,
    url: row.url,
    ...(row.range === undefined ? {} : { range: row.range }),
    ...(row.toggle === undefined ? {} : { toggle: row.toggle }),
  };
}

function filePickerSelectionOptions(row: FilePickerIntentRow): FileSelectionOptions | undefined {
  if (row.range === undefined && row.toggle === undefined) return undefined;
  return {
    ...(row.range === undefined ? {} : { range: row.range }),
    ...(row.toggle === undefined ? {} : { toggle: row.toggle }),
  };
}

function windowIntentRequest(
  request: IntentRequest,
  intent:
    | typeof windowCloseContextIntent
    | typeof windowFocusIntent
    | typeof windowMoveTabIntent
    | typeof windowPinPreviewIntent
    | typeof windowResizeSplitIntent,
): WindowIntentRow | RuntimeError {
  const row = runtimeIntentRequestRow<WindowIntentRow>(request, windowIntentBoundary);
  if (isRuntimeError(row)) return row;
  if (row.path !== undefined && !isSplitPath(row.path)) return badRequest('Window request path is invalid.');
  if (row.target !== undefined && contextDropTarget(row.target) === undefined) {
    return badRequest('Window request target is invalid.');
  }
  const fieldError = windowIntentFieldError(intent, row);
  if (fieldError !== undefined) return badRequest(fieldError);

  return {
    id: row.id,
    ...(row.contextId === undefined ? {} : { contextId: row.contextId }),
    ...(row.path === undefined ? {} : { path: row.path }),
    ...(row.ratio === undefined ? {} : { ratio: row.ratio }),
    ...(row.sourceSurfaceId === undefined ? {} : { sourceSurfaceId: row.sourceSurfaceId }),
    ...(row.surfaceId === undefined ? {} : { surfaceId: row.surfaceId }),
    ...(row.target === undefined ? {} : { target: row.target }),
  };
}

function windowIntentFieldError(
  intent:
    | typeof windowCloseContextIntent
    | typeof windowFocusIntent
    | typeof windowMoveTabIntent
    | typeof windowPinPreviewIntent
    | typeof windowResizeSplitIntent,
  row: WindowIntentRow,
): string | undefined {
  if (
    (intent === windowCloseContextIntent || intent === windowFocusIntent || intent === windowPinPreviewIntent)
    && (typeof row.surfaceId !== 'string' || typeof row.contextId !== 'string')
  ) {
    return `${intent} requires surfaceId and contextId.`;
  }
  if (
    intent === windowMoveTabIntent
    && (
      typeof row.sourceSurfaceId !== 'string'
      || typeof row.contextId !== 'string'
      || row.target === undefined
    )
  ) {
    return `${intent} requires sourceSurfaceId, contextId, and target.`;
  }
  if (intent === windowResizeSplitIntent && (row.path === undefined || typeof row.ratio !== 'number')) {
    return `${intent} requires path and ratio.`;
  }
  return undefined;
}

function validateWindowIntent(
  state: WindowManagerStateDoc,
  intent:
    | typeof windowCloseContextIntent
    | typeof windowFocusIntent
    | typeof windowMoveTabIntent
    | typeof windowPinPreviewIntent
    | typeof windowResizeSplitIntent,
  request: WindowIntentRow,
): RuntimeError | undefined {
  if (
    (intent === windowFocusIntent || intent === windowCloseContextIntent)
    && request.surfaceId !== undefined
    && request.contextId !== undefined
  ) {
    return validateSurfaceContext(state, request.surfaceId, request.contextId);
  }

  if (
    intent === windowPinPreviewIntent
    && request.surfaceId !== undefined
    && request.contextId !== undefined
  ) {
    return validatePreviewContext(state, request.surfaceId, request.contextId);
  }

  if (
    intent === windowMoveTabIntent
    && request.sourceSurfaceId !== undefined
    && request.contextId !== undefined
    && request.target !== undefined
  ) {
    const target = contextDropTarget(request.target);
    return target === undefined
      ? runtimeError('bad_request', 'Window request target is invalid.')
      : validateMovedContextDropTarget(state, request.sourceSurfaceId, request.contextId, target);
  }

  if (intent === windowResizeSplitIntent && request.path !== undefined && request.ratio !== undefined) {
    return validateResizeSplit(state, request.path as SplitPath);
  }

  return undefined;
}

function commitWindowIntent(
  doc: WindowManagerStateDoc,
  intent:
    | typeof windowCloseContextIntent
    | typeof windowFocusIntent
    | typeof windowMoveTabIntent
    | typeof windowPinPreviewIntent
    | typeof windowResizeSplitIntent,
  request: WindowIntentRow,
): void {
  if (intent === windowFocusIntent && request.surfaceId !== undefined && request.contextId !== undefined) {
    focusContext(doc, request.surfaceId, request.contextId);
  } else if (intent === windowCloseContextIntent && request.surfaceId !== undefined && request.contextId !== undefined) {
    closeContext(doc, request.surfaceId, request.contextId);
  } else if (intent === windowPinPreviewIntent && request.surfaceId !== undefined && request.contextId !== undefined) {
    pinContext(doc, request.surfaceId, request.contextId);
  } else if (
    intent === windowMoveTabIntent
    && request.sourceSurfaceId !== undefined
    && request.contextId !== undefined
    && request.target !== undefined
  ) {
    const target = contextDropTarget(request.target);
    if (target !== undefined) dropContext(doc, request.sourceSurfaceId, request.contextId, target);
  } else if (intent === windowResizeSplitIntent && request.path !== undefined && request.ratio !== undefined) {
    resizeSplit(doc, request.path as SplitPath, request.ratio);
  }
}

function validateNewContextDropTarget(
  state: WindowManagerStateDoc,
  target: ContextDropTarget,
): RuntimeError | undefined {
  if (target.area === 'tabs') return validateTabDropTarget(state, target);
  return validateContentDropTarget(state, target);
}

function validateMovedContextDropTarget(
  state: WindowManagerStateDoc,
  sourceSurfaceId: string,
  contextId: string,
  target: ContextDropTarget,
): RuntimeError | undefined {
  const source = state.surfaces[sourceSurfaceId];
  if (source === undefined) return surfaceNotFound(sourceSurfaceId);
  if (!surfaceHasContext(source, contextId)) return contextNotFoundOnSurface(contextId, sourceSurfaceId);

  if (target.area === 'tabs') {
    if (target.contextId === contextId) {
      return runtimeError('conflict', `Context ${contextId} cannot be moved relative to itself.`);
    }
    return validateTabDropTarget(state, target);
  }

  const targetError = validateContentDropTarget(state, target);
  if (targetError !== undefined) return targetError;
  if (target.zone === 'center' && sourceSurfaceId === target.surfaceId) {
    return runtimeError('conflict', `Context ${contextId} is already on surface ${target.surfaceId}.`);
  }

  return undefined;
}

function validateTabDropTarget(
  state: WindowManagerStateDoc,
  target: Extract<ContextDropTarget, { area: 'tabs' }>,
): RuntimeError | undefined {
  const surface = state.surfaces[target.surfaceId];
  if (surface === undefined) return surfaceNotFound(target.surfaceId);
  if (surface.role !== SurfaceRole.DocumentSet) {
    return runtimeError('conflict', `Surface ${target.surfaceId} cannot accept document contexts.`);
  }
  if (target.contextId !== undefined && !surfaceHasContext(surface, target.contextId)) {
    return contextNotFoundOnSurface(target.contextId, target.surfaceId);
  }
  return undefined;
}

function validateContentDropTarget(
  state: WindowManagerStateDoc,
  target: Extract<ContextDropTarget, { area: 'content' }>,
): RuntimeError | undefined {
  const surface = state.surfaces[target.surfaceId];
  if (surface === undefined) return surfaceNotFound(target.surfaceId);
  if (surface.role !== SurfaceRole.DocumentSet) {
    return runtimeError('conflict', `Surface ${target.surfaceId} cannot accept document contexts.`);
  }

  const node = nodeAtPath(state.layout, target.path);
  if (node === undefined) return runtimeError('not_found', `Split path ${formatSplitPath(target.path)} was not found.`);
  if (node.kind !== WindowManagerNodeKind.Surface || node.surfaceId !== target.surfaceId) {
    return runtimeError('conflict', `Split path ${formatSplitPath(target.path)} no longer targets surface ${target.surfaceId}.`);
  }

  return undefined;
}

function validateSurfaceContext(
  state: WindowManagerStateDoc,
  surfaceId: string,
  contextId: string,
): RuntimeError | undefined {
  const surface = state.surfaces[surfaceId];
  if (surface === undefined) return surfaceNotFound(surfaceId);
  return surfaceHasContext(surface, contextId) ? undefined : contextNotFoundOnSurface(contextId, surfaceId);
}

function validatePreviewContext(
  state: WindowManagerStateDoc,
  surfaceId: string,
  contextId: string,
): RuntimeError | undefined {
  const surface = state.surfaces[surfaceId];
  if (surface === undefined) return surfaceNotFound(surfaceId);
  if (surface.previewContext === contextId) return undefined;
  if (surfaceHasContext(surface, contextId)) {
    return runtimeError('conflict', `Context ${contextId} is not a preview on surface ${surfaceId}.`);
  }
  return contextNotFoundOnSurface(contextId, surfaceId);
}

function validateResizeSplit(
  state: WindowManagerStateDoc,
  path: SplitPath,
): RuntimeError | undefined {
  const node = nodeAtPath(state.layout, path);
  if (node === undefined) return runtimeError('not_found', `Split path ${formatSplitPath(path)} was not found.`);
  if (node.kind !== WindowManagerNodeKind.Split) {
    return runtimeError('conflict', `Split path ${formatSplitPath(path)} is not a split.`);
  }
  return undefined;
}

function targetDocumentSurface(
  state: WindowManagerStateDoc,
  sourceSurfaceId: string | undefined,
): WindowSurface | undefined {
  const focused = state.surfaces[state.focus];
  if (state.focus !== sourceSurfaceId && focused?.role === SurfaceRole.DocumentSet) return focused;
  return Object.values(state.surfaces).find((surface) => (
    surface.id !== sourceSurfaceId && surface.role === SurfaceRole.DocumentSet
  ));
}

function targetLaunchSurface(
  state: WindowManagerStateDoc,
  role: SurfaceRole,
): WindowSurface | undefined {
  const focused = state.surfaces[state.focus];
  return focused?.role === role
    ? focused
    : Object.values(state.surfaces).find((surface) => surface.role === role);
}

function surfaceWithContext(
  state: WindowManagerStateDoc,
  contextId: string,
): WindowSurface | undefined {
  return Object.values(state.surfaces).find((surface) => surfaceHasContext(surface, contextId));
}

function surfaceHasContext(surface: WindowSurface, contextId: string): boolean {
  return surface.previewContext === contextId || surface.contexts.includes(contextId);
}

function nodeAtPath(root: WindowLayoutNode, path: SplitPath): WindowLayoutNode | undefined {
  let node = root;
  for (const side of path) {
    if (node.kind === WindowManagerNodeKind.Surface) return undefined;
    node = node[side];
  }
  return node;
}

function surfaceNotFound(surfaceId: string): RuntimeError {
  return runtimeError('not_found', `Surface ${surfaceId} was not found.`);
}

function contextNotFoundOnSurface(contextId: string, surfaceId: string): RuntimeError {
  return runtimeError('not_found', `Context ${contextId} was not found on surface ${surfaceId}.`);
}

function formatSplitPath(path: SplitPath): string {
  return path.length === 0 ? '<root>' : path.join('.');
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

function contextDropTarget(target: Json | undefined): ContextDropTarget | undefined {
  if (!isRecord(target) || typeof target.area !== 'string' || typeof target.surfaceId !== 'string') {
    return undefined;
  }

  if (target.area === 'tabs') {
    if (target.contextId !== undefined && typeof target.contextId !== 'string') return undefined;
    if (
      target.placement !== undefined
      && target.placement !== 'before'
      && target.placement !== 'after'
    ) {
      return undefined;
    }

    return {
      area: 'tabs',
      surfaceId: target.surfaceId,
      ...(typeof target.contextId === 'string' ? { contextId: target.contextId } : {}),
      ...(target.placement === 'before' || target.placement === 'after' ? { placement: target.placement } : {}),
    };
  }

  if (
    target.area === 'content'
    && (target.zone === 'center' || target.zone === 'left' || target.zone === 'right' || target.zone === 'top' || target.zone === 'bottom')
    && isSplitPath(target.path)
  ) {
    return {
      area: 'content',
      path: target.path,
      surfaceId: target.surfaceId,
      zone: target.zone,
    };
  }

  return undefined;
}

function viewerContext(url: string, title: string | undefined, rootUrl: string): WindowContext {
  return {
    app: 'viewer',
    container: rootContainer(rootUrl),
    id: `viewer:${url}`,
    ...(title === undefined ? {} : { title }),
    url,
  };
}

function terminalContext(url: string, rootUrl: string): WindowContext {
  return {
    app: 'terminal',
    container: terminalContainer(rootUrl),
    id: `terminal:${url}`,
    url,
  };
}

function rejected(error: RuntimeError): IntentResult {
  return { status: 'rejected', error };
}

function badRequest(error: Error | string): RuntimeError {
  return runtimeError('bad_request', typeof error === 'string' ? error : error.message);
}

function isRuntimeError(value: unknown): value is RuntimeError {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRuntimeMountProvider(value: unknown): value is RuntimeMountProvider {
  return (
    value === RuntimeMountProvider.Device
    || value === RuntimeMountProvider.Memory
    || value === RuntimeMountProvider.Proc
    || value === RuntimeMountProvider.ShellCommands
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, Json | undefined>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSplitPath(value: unknown): value is readonly ('first' | 'second')[] {
  return Array.isArray(value) && value.every((item) => item === 'first' || item === 'second');
}
