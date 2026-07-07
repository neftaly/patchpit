import {
  appLaunchIntentBoundary,
  ContainerMountKind,
  PatchpitType,
  RuntimeMountProvider,
  rootContainer,
  SurfaceRole,
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
  type IntentRequest,
  type IntentResult,
  type AutomergeHeadSet,
  type RuntimeClient,
  type RuntimeError,
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
import { automergeHeadSetForHandle } from './automerge-heads';
import {
  createBootstrapRuntimeDiagnosticsStore,
  submitIntentWithDiagnostics,
  type BootstrapRuntimeDiagnosticsStore,
} from './bootstrap-runtime-diagnostics';
import {
  createBootstrapRuntimeResourceStore,
  type BootstrapRuntimeResourceStore,
} from './bootstrap-runtime-resources';
import { allowAllRuntimePolicy, type RuntimePolicy } from './policy';

export type {
  BootstrapIntentLogEntry,
  BootstrapProjectionDiagnostics,
  BootstrapRuntimeDiagnostics,
  BootstrapRuntimeDiagnosticsStore,
  BootstrapSessionEvent,
  BootstrapSessionEventInput,
  BootstrapSessionEventSource,
} from './bootstrap-runtime-diagnostics';
export type {
  BootstrapRuntimeDocumentUrls,
  BootstrapRuntimeResourceStore,
} from './bootstrap-runtime-resources';

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

type CoreLaunchSpec = {
  readonly entryPath?: string;
  readonly id: string;
  readonly role: SurfaceRole;
  readonly stateUrl?: (seed: SeedFilesystem) => string;
  readonly title: string;
};

const coreLaunchSpecs: readonly CoreLaunchSpec[] = [
  {
    id: 'file-picker',
    role: SurfaceRole.WorkspaceView,
    stateUrl: (seed) => seed.filePickerStateHandle.url,
    title: 'File Picker',
  },
  {
    entryPath: '/home/apps/viewer/index.html',
    id: 'viewer',
    role: SurfaceRole.DocumentSet,
    title: 'Viewer',
  },
  {
    entryPath: '/home/apps/hello-world/index.html',
    id: 'hello-world',
    role: SurfaceRole.DocumentSet,
    title: 'Hello World',
  },
];

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

function appLaunchCommit(launch: AppLaunchRequest): AppLaunchCommit | RuntimeError {
  if (launch.context !== undefined) return { context: launchContextWithDelegation(launch.context, launch.delegation) };

  return runtimeError(
    'missing_handler',
    `No app instance state handler is registered for ${launch.app} ${launch.role}.`,
  );
}

function resolveAppLaunchContext(seed: SeedFilesystem, launch: AppLaunchRequest): AppLaunchRequest | RuntimeError {
  if (launch.context !== undefined) return launch;

  const spec = coreLaunchSpecs.find((candidate) => candidate.id === launch.app);
  if (spec === undefined) return runtimeError('missing_handler', `No core app.launch handler was found for ${launch.app}.`);

  if (spec.role !== launch.role) return runtimeError('missing_handler', `App ${launch.app} has no ${launch.role} launch surface.`);

  if (spec.stateUrl !== undefined) {
    const stateUrl = spec.stateUrl(seed);
    const existing = existingLaunchContext(seed, launch.app, stateUrl);
    return {
      ...launch,
      context: existing ?? {
        app: launch.app,
        container: rootContainer(seed.rootUrl),
        ...(launch.delegation === undefined ? {} : { delegation: launch.delegation }),
        id: launch.app,
        title: spec.title,
        url: stateUrl,
      },
    };
  }

  const entryUrl = spec.entryPath === undefined ? undefined : filesystemEntryUrl(seed, spec.entryPath);
  if (entryUrl === undefined) {
    return runtimeError('missing_handler', `App ${launch.app} entry ${spec.entryPath ?? '<state>'} is not installed.`);
  }

  return {
    ...launch,
    context: {
      app: launch.app,
      container: rootContainer(seed.rootUrl),
      ...(launch.delegation === undefined ? {} : { delegation: launch.delegation }),
      id: `${launch.app}:${entryUrl}`,
      title: spec.title,
      url: entryUrl,
    },
  };
}

function existingLaunchContext(
  seed: SeedFilesystem,
  app: string,
  url: string,
): WindowContext | undefined {
  return Object.values(seed.windowManagerHandle.doc().contexts).find((context) => {
    return context.app === app && context.url === url;
  });
}

function filesystemEntryUrl(seed: SeedFilesystem, path: string): string | undefined {
  const root = seed.documentHandles[seed.rootUrl]?.doc();
  if (!isFolderDoc(root)) return undefined;
  const parts = path.split('/').filter((part) => part !== '');
  let current: FilesystemResource | undefined = root;
  let currentUrl: string | undefined = seed.rootUrl;
  for (const part of parts) {
    if (!isFolderDoc(current)) return undefined;
    const entry: FolderDoc['docs'][number] | undefined = current.docs.find((candidate) => candidate.name === part);
    if (entry === undefined) return undefined;
    currentUrl = entry.url;
    current = seed.documentHandles[entry.url]?.doc();
  }
  return currentUrl;
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
