import type { EffectIntentRow, EffectResultStatus, FullscreenRow, ResourceKind } from './schema';
import { demoRows } from './demoData';
import {
  createCapabilityLabStore,
  type CapabilityIntentInput,
  type CapabilityLabRows,
  type CapabilityLabStore,
  type StoreController
} from './store';

export type PointerSample = {
  readonly sequence: number;
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
};

export type FakeNetworkStep = {
  readonly sequence: number;
  readonly action: 'send' | 'deliver' | 'drop' | 'reorder';
  readonly messageId: string;
  readonly queueDepth: number;
};

export type FullscreenDocumentAdapter = {
  readonly fullscreenEnabled?: boolean;
  readonly fullscreenElement?: unknown;
  readonly exitFullscreen?: () => Promise<void> | void;
};

export type FullscreenElementAdapter = {
  readonly requestFullscreen?: () => Promise<void> | void;
};

export type FullscreenMode = 'simulated' | 'browser';

export type UserActivationSnapshot = {
  readonly isActive?: boolean;
  readonly hasBeenActive?: boolean;
};

export type RuntimeEnvironment = {
  readonly document?: FullscreenDocumentAdapter;
  readonly elementForResource?: (resourceId: string) => FullscreenElementAdapter | undefined;
  readonly fullscreenMode?: FullscreenMode;
  readonly userActivation?: () => UserActivationSnapshot | undefined;
  readonly now?: () => number;
};

export type CapabilityLabRuntime = {
  readonly store: CapabilityLabStore;
  readonly dispatchAndProcessIntent: (intent: CapabilityIntentInput) => string;
  readonly processPendingIntents: () => Promise<void>;
  readonly ingestPointerSamples: (resourceId: string, samples: readonly PointerSample[]) => void;
  readonly ingestFakeNetworkTrace: (resourceId: string, steps: readonly FakeNetworkStep[]) => void;
  readonly syncFullscreenState: (resourceId: string) => void;
  readonly syncViewport: (width: number, height: number, devicePixelRatio: number) => void;
};

type RuntimeHandle =
  | { readonly kind: 'media-stream'; readonly trackCount: number }
  | { readonly kind: 'renderer'; readonly framesDrawn: number }
  | { readonly kind: 'socket'; readonly sentMessages: readonly string[] }
  | { readonly kind: 'worker'; readonly receivedMessages: readonly string[] }
  | { readonly kind: 'lock'; readonly owner: string }
  | { readonly kind: 'fullscreen-target'; readonly requestedAt: number };

type RuntimeDeps = {
  readonly store: CapabilityLabStore;
  readonly controller: StoreController;
  readonly env: RuntimeEnvironment;
};

type IntentOutcome = {
  readonly status: EffectResultStatus;
  readonly message: string;
  readonly value?: unknown;
};

type FullscreenRuntimeStatus = {
  readonly requested: boolean;
  readonly lastOutcome: NonNullable<FullscreenRow['lastOutcome']>;
  readonly lastErrorName: string;
};

export function createCapabilityLabRuntime(env: RuntimeEnvironment = {}): CapabilityLabRuntime {
  const { store, controller } = createCapabilityLabStore(withResearchDemoRows(demoRows));
  const runtime = createRuntimeEngine({ store, controller, env });

  return {
    store,
    dispatchAndProcessIntent: runtime.dispatchAndProcessIntent,
    processPendingIntents: runtime.processPendingIntents,
    ingestPointerSamples: runtime.ingestPointerSamples,
    ingestFakeNetworkTrace: runtime.ingestFakeNetworkTrace,
    syncFullscreenState: runtime.syncFullscreenState,
    syncViewport: (width, height, devicePixelRatio) => {
      controller.setViewport({
        viewportId: 'viewport-main',
        width,
        height,
        devicePixelRatio
      });
    }
  };
}

function withResearchDemoRows(rows: CapabilityLabRows): CapabilityLabRows {
  return {
    ...rows,
    resources: [
      ...rows.resources,
      {
        resourceId: 'res-storage-cache',
        kind: 'storage',
        adapter: 'browser.storageEstimate',
        label: 'Browser storage policy',
        status: 'active'
      },
      {
        resourceId: 'res-network-sync',
        kind: 'network-link',
        adapter: 'runtime.fakeNetwork',
        label: 'Fake sync network',
        status: 'active'
      }
    ],
    capabilities: [
      ...rows.capabilities,
      {
        capabilityId: 'cap-storage-telemetry',
        resourceId: 'res-storage-cache',
        kind: 'storage.telemetry',
        canIssueIntents: false,
        canReadRows: true,
        description: 'Quota, eviction, and persistence are diagnostics and telemetry, not guarantees.'
      },
      {
        capabilityId: 'cap-network-trace',
        resourceId: 'res-network-sync',
        kind: 'network.trace',
        canIssueIntents: false,
        canReadRows: true,
        description: 'Sync transport behavior is modeled as deterministic trace rows for drops, reorder, and backpressure.'
      }
    ],
    diagnostics: [
      ...rows.diagnostics,
      {
        diagnosticId: 'diag-storage-policy',
        scope: 'browser.storage',
        severity: 'info',
        message: 'Storage quota, eviction, and persistence are observed as browser policy telemetry; the app must not treat them as guarantees.',
        resourceId: 'res-storage-cache',
        createdAt: 0
      }
    ],
    events: [
      ...rows.events,
      {
        eventId: 'event-network-bootstrap',
        resourceId: 'res-network-sync',
        kind: 'network.trace',
        sequence: 1,
        payloadJson: '{"sent":4,"delivered":3,"dropped":1,"reordered":1,"maxQueueDepth":3,"policy":"fake deterministic trace"}',
        createdAt: 0
      }
    ]
  };
}

function createRuntimeEngine(deps: RuntimeDeps): Omit<CapabilityLabRuntime, 'store' | 'syncViewport'> {
  const handles = new Map<string, RuntimeHandle>();
  let coalescedPointerSequence = 1;
  let networkTraceSequence = 1;

  syncFullscreenRows('res-fullscreen-shell', handles, deps, {
    requested: false,
    lastOutcome: 'none',
    lastErrorName: ''
  });

  const processIntentById = async (intentId: string): Promise<void> => {
    const intent = deps.store.getState().rows.effectIntents.find((row) => row.intentId === intentId);

    if (intent?.status !== 'pending') {
      return;
    }

    await processIntent(intent);
  };

  const processIntent = async (intent: EffectIntentRow): Promise<void> => {
    deps.controller.markIntent(intent.intentId, 'running');
    const outcome = await safelyHandleIntent(intent, handles, deps.env);
    deps.controller.appendResult({
      intentId: intent.intentId,
      resourceId: intent.resourceId,
      kind: intent.kind,
      status: outcome.status,
      message: outcome.message,
      valueJson: stringifyValue(outcome.value)
    });
    deps.controller.markIntent(intent.intentId, outcome.status === 'ok' ? 'handled' : 'failed');
    applyOutcomeToRows(intent, outcome, handles, deps);
  };

  return {
    dispatchAndProcessIntent: (input) => {
      const intentId = deps.store.dispatch(input);
      void processIntentById(intentId);
      return intentId;
    },
    processPendingIntents: async () => {
      const pendingIntents = deps.store.getState().rows.effectIntents.filter((intent) => intent.status === 'pending');

      for (const intent of pendingIntents) {
        await processIntentById(intent.intentId);
      }
    },
    ingestPointerSamples: (resourceId, samples) => {
      if (samples.length === 0) {
        return;
      }

      const latest = samples[samples.length - 1];
      if (latest === undefined) {
        return;
      }

      const first = samples[0];
      if (first === undefined) {
        return;
      }

      deps.controller.appendEvent({
        resourceId,
        kind: 'pointer.coalesced',
        sequence: coalescedPointerSequence,
        payloadJson: stringifyValue({
          count: samples.length,
          fromSequence: first.sequence,
          toSequence: latest.sequence,
          x: latest.x,
          y: latest.y,
          buttons: latest.buttons
        })
      });
      coalescedPointerSequence += 1;
    },
    ingestFakeNetworkTrace: (resourceId, steps) => {
      if (steps.length === 0) {
        return;
      }

      const summary = summarizeNetworkTrace(steps);
      deps.controller.appendEvent({
        resourceId,
        kind: 'network.trace',
        sequence: networkTraceSequence,
        payloadJson: stringifyValue(summary)
      });
      networkTraceSequence += 1;

      if (summary.dropped > 0 || summary.reordered > 0 || summary.maxQueueDepth > 4) {
        deps.controller.appendDiagnostic({
          scope: 'network-sync',
          severity: summary.maxQueueDepth > 4 ? 'warning' : 'info',
          message: `Fake network trace observed ${summary.dropped} drops, ${summary.reordered} reorders, and queue depth ${summary.maxQueueDepth}.`,
          resourceId
        });
      }
    },
    syncFullscreenState: (resourceId) => {
      if (fullscreenMode(deps.env) === 'browser' && deps.env.document?.fullscreenElement == null) {
        handles.delete(resourceId);
      }

      syncFullscreenRows(resourceId, handles, deps, {
        requested: false,
        lastOutcome: isFullscreenActive(resourceId, handles, deps.env) ? 'active' : 'none',
        lastErrorName: ''
      });
    }
  };
}

function summarizeNetworkTrace(steps: readonly FakeNetworkStep[]): {
  readonly sent: number;
  readonly delivered: number;
  readonly dropped: number;
  readonly reordered: number;
  readonly maxQueueDepth: number;
  readonly fromSequence: number;
  readonly toSequence: number;
} {
  let sent = 0;
  let delivered = 0;
  let dropped = 0;
  let reordered = 0;
  let maxQueueDepth = 0;
  let fromSequence = steps[0]?.sequence ?? 0;
  let toSequence = fromSequence;

  for (const step of steps) {
    fromSequence = Math.min(fromSequence, step.sequence);
    toSequence = Math.max(toSequence, step.sequence);
    maxQueueDepth = Math.max(maxQueueDepth, step.queueDepth);

    if (step.action === 'send') {
      sent += 1;
    } else if (step.action === 'deliver') {
      delivered += 1;
    } else if (step.action === 'drop') {
      dropped += 1;
    } else if (step.action === 'reorder') {
      reordered += 1;
    }
  }

  return { sent, delivered, dropped, reordered, maxQueueDepth, fromSequence, toSequence };
}

async function handleIntent(
  intent: EffectIntentRow,
  handles: Map<string, RuntimeHandle>,
  env: RuntimeEnvironment
): Promise<IntentOutcome> {
  const payload = parsePayload(intent.payloadJson);

  switch (intent.kind) {
    case 'media.request':
      handles.set(intent.resourceId, { kind: 'media-stream', trackCount: 2 });
      return { status: 'ok', message: 'media stream opened', value: { tracks: 2 } };
    case 'media.stop':
      handles.delete(intent.resourceId);
      return { status: 'ok', message: 'media stream stopped' };
    case 'renderer.create':
      handles.set(intent.resourceId, { kind: 'renderer', framesDrawn: 0 });
      return { status: 'ok', message: 'renderer created', value: { backend: 'simulated-webgl' } };
    case 'renderer.drawFrame':
      return drawFrame(intent.resourceId, handles);
    case 'renderer.dispose':
      handles.delete(intent.resourceId);
      return { status: 'ok', message: 'renderer disposed' };
    case 'socket.open':
      handles.set(intent.resourceId, { kind: 'socket', sentMessages: [] });
      return { status: 'ok', message: 'socket opened' };
    case 'socket.send':
      return sendSocketMessage(intent.resourceId, payload, handles);
    case 'socket.close':
      handles.delete(intent.resourceId);
      return { status: 'ok', message: 'socket closed' };
    case 'worker.spawn':
      handles.set(intent.resourceId, { kind: 'worker', receivedMessages: [] });
      return { status: 'ok', message: 'worker spawned' };
    case 'worker.postMessage':
      return postWorkerMessage(intent.resourceId, payload, handles);
    case 'worker.terminate':
      handles.delete(intent.resourceId);
      return { status: 'ok', message: 'worker terminated' };
    case 'lock.request':
      return requestLock(intent.resourceId, payload, handles);
    case 'lock.release':
      handles.delete(intent.resourceId);
      return { status: 'ok', message: 'lock released' };
    case 'fullscreen.enter':
      return enterFullscreen(intent.resourceId, handles, env);
    case 'fullscreen.exit':
      return exitFullscreen(intent.resourceId, handles, env);
    default:
      return { status: 'unsupported', message: `unsupported intent kind: ${intent.kind}` };
  }
}

async function safelyHandleIntent(
  intent: EffectIntentRow,
  handles: Map<string, RuntimeHandle>,
  env: RuntimeEnvironment
): Promise<IntentOutcome> {
  try {
    return await handleIntent(intent, handles, env);
  } catch (error) {
    return {
      status: 'error',
      message: `runtime adapter failed: ${errorMessage(error)}`,
      value: { errorName: errorName(error) }
    };
  }
}

function applyOutcomeToRows(
  intent: EffectIntentRow,
  outcome: IntentOutcome,
  handles: Map<string, RuntimeHandle>,
  deps: RuntimeDeps
): void {
  if (intent.kind.startsWith('fullscreen.')) {
    applyFullscreenOutcome(intent, outcome, handles, deps);
  }

  if (outcome.status !== 'ok') {
    deps.controller.appendDiagnostic({
      scope: intent.kind.startsWith('fullscreen.') ? 'browser.fullscreen' : 'runtime',
      severity: outcome.status === 'error' ? 'error' : 'warning',
      message: outcome.message,
      resourceId: intent.resourceId
    });
    return;
  }

  const handle = handles.get(intent.resourceId);
  const status = handle === undefined ? 'closed' : 'active';

  deps.controller.updateResourceStatus(intent.resourceId, status);
}

function applyFullscreenOutcome(
  intent: EffectIntentRow,
  outcome: IntentOutcome,
  handles: Map<string, RuntimeHandle>,
  deps: RuntimeDeps
): void {
  const detail = fullscreenDetail(outcome.value);

  syncFullscreenRows(intent.resourceId, handles, deps, {
    requested: intent.kind === 'fullscreen.enter',
    lastOutcome: fullscreenOutcome(intent.kind, outcome.status),
    lastErrorName: detail.errorName
  });
}

function syncFullscreenRows(
  resourceId: string,
  handles: Map<string, RuntimeHandle>,
  deps: RuntimeDeps,
  status: FullscreenRuntimeStatus
): void {
  deps.controller.setFullscreen({
    fullscreenId: 'fullscreen-shell',
    targetResourceId: resourceId,
    available: fullscreenAvailable(deps.env),
    active: isFullscreenActive(resourceId, handles, deps.env),
    requested: status.requested,
    mode: fullscreenMode(deps.env),
    activationRequired: fullscreenMode(deps.env) === 'browser',
    activationActive: activationActive(deps.env),
    lastOutcome: status.lastOutcome,
    lastErrorName: status.lastErrorName
  });
}

function fullscreenOutcome(
  intentKind: string,
  resultStatus: EffectResultStatus
): FullscreenRuntimeStatus['lastOutcome'] {
  if (resultStatus === 'unsupported') {
    return 'unsupported';
  }

  if (resultStatus === 'denied') {
    return 'denied';
  }

  if (resultStatus === 'error') {
    return 'failed';
  }

  return intentKind === 'fullscreen.exit' ? 'exited' : 'active';
}

function fullscreenDetail(value: unknown): { readonly errorName: string } {
  if (typeof value !== 'object' || value === null || !('errorName' in value)) {
    return { errorName: '' };
  }

  const errorNameValue = (value as Record<string, unknown>).errorName;
  return { errorName: typeof errorNameValue === 'string' ? errorNameValue : '' };
}

function drawFrame(resourceId: string, handles: Map<string, RuntimeHandle>): IntentOutcome {
  const handle = handles.get(resourceId);

  if (handle?.kind !== 'renderer') {
    return { status: 'error', message: 'renderer must be created before drawing' };
  }

  const nextFrameCount = handle.framesDrawn + 1;
  handles.set(resourceId, { kind: 'renderer', framesDrawn: nextFrameCount });
  return { status: 'ok', message: 'frame drawn', value: { framesDrawn: nextFrameCount } };
}

function sendSocketMessage(
  resourceId: string,
  payload: unknown,
  handles: Map<string, RuntimeHandle>
): IntentOutcome {
  const handle = handles.get(resourceId);

  if (handle?.kind !== 'socket') {
    return { status: 'error', message: 'socket must be opened before send' };
  }

  const message = stringPayloadField(payload, 'message');
  handles.set(resourceId, { kind: 'socket', sentMessages: [...handle.sentMessages, message] });
  return { status: 'ok', message: 'socket message sent', value: { sent: handle.sentMessages.length + 1 } };
}

function postWorkerMessage(
  resourceId: string,
  payload: unknown,
  handles: Map<string, RuntimeHandle>
): IntentOutcome {
  const handle = handles.get(resourceId);

  if (handle?.kind !== 'worker') {
    return { status: 'error', message: 'worker must be spawned before postMessage' };
  }

  const message = stringPayloadField(payload, 'message');
  handles.set(resourceId, { kind: 'worker', receivedMessages: [...handle.receivedMessages, message] });
  return { status: 'ok', message: 'worker message posted', value: { received: handle.receivedMessages.length + 1 } };
}

function requestLock(resourceId: string, payload: unknown, handles: Map<string, RuntimeHandle>): IntentOutcome {
  const existing = handles.get(resourceId);

  if (existing?.kind === 'lock') {
    return { status: 'error', message: `lock already held by ${existing.owner}` };
  }

  const owner = stringPayloadField(payload, 'owner');
  handles.set(resourceId, { kind: 'lock', owner });
  return { status: 'ok', message: 'lock acquired', value: { owner } };
}

async function enterFullscreen(
  resourceId: string,
  handles: Map<string, RuntimeHandle>,
  env: RuntimeEnvironment
): Promise<IntentOutcome> {
  const mode = fullscreenMode(env);
  const element = env.elementForResource?.(resourceId);
  const detail = fullscreenValue(env);

  if (mode === 'browser') {
    if (env.document?.fullscreenEnabled !== true) {
      return { status: 'unsupported', message: 'document fullscreen is unavailable', value: detail };
    }

    if (element?.requestFullscreen === undefined) {
      return {
        status: 'unsupported',
        message: 'fullscreen request API is unavailable for this target',
        value: detail
      };
    }
  }

  try {
    await element?.requestFullscreen?.();
  } catch (error) {
    return rejectedFullscreenOutcome('fullscreen request rejected', error, env);
  }

  handles.set(resourceId, { kind: 'fullscreen-target', requestedAt: env.now?.() ?? Date.now() });
  return { status: 'ok', message: mode === 'browser' ? 'browser fullscreen requested' : 'simulated fullscreen requested', value: detail };
}

async function exitFullscreen(
  resourceId: string,
  handles: Map<string, RuntimeHandle>,
  env: RuntimeEnvironment
): Promise<IntentOutcome> {
  const mode = fullscreenMode(env);
  const detail = fullscreenValue(env);

  if (mode === 'browser' && env.document?.exitFullscreen === undefined) {
    return { status: 'unsupported', message: 'document fullscreen exit is unavailable', value: detail };
  }

  try {
    await env.document?.exitFullscreen?.();
  } catch (error) {
    return rejectedFullscreenOutcome('fullscreen exit rejected', error, env);
  }

  handles.delete(resourceId);
  return { status: 'ok', message: mode === 'browser' ? 'browser fullscreen exited' : 'simulated fullscreen exited', value: detail };
}

function fullscreenMode(env: RuntimeEnvironment): FullscreenMode {
  return env.fullscreenMode ?? 'simulated';
}

function fullscreenAvailable(env: RuntimeEnvironment): boolean {
  if (fullscreenMode(env) === 'simulated') {
    return true;
  }

  return env.document?.fullscreenEnabled === true;
}

function isFullscreenActive(
  resourceId: string,
  handles: Map<string, RuntimeHandle>,
  env: RuntimeEnvironment
): boolean {
  if (fullscreenMode(env) === 'browser') {
    return env.document?.fullscreenElement != null;
  }

  return handles.get(resourceId)?.kind === 'fullscreen-target';
}

function activationActive(env: RuntimeEnvironment): boolean {
  return env.userActivation?.()?.isActive === true;
}

function fullscreenValue(env: RuntimeEnvironment, error?: unknown): Record<string, unknown> {
  const activation = env.userActivation?.();

  return {
    mode: fullscreenMode(env),
    available: fullscreenAvailable(env),
    activationRequired: fullscreenMode(env) === 'browser',
    activationActive: activation?.isActive === true,
    activationHasBeenActive: activation?.hasBeenActive === true,
    errorName: error === undefined ? '' : errorName(error)
  };
}

function rejectedFullscreenOutcome(action: string, error: unknown, env: RuntimeEnvironment): IntentOutcome {
  const name = errorName(error);
  const status: EffectResultStatus = fullscreenDeniedErrorNames.has(name) ? 'denied' : 'error';

  return {
    status,
    message: `${action}: ${errorMessage(error)}`,
    value: fullscreenValue(env, error)
  };
}

const fullscreenDeniedErrorNames = new Set(['NotAllowedError', 'SecurityError']);

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const value = (error as Record<string, unknown>).name;
    return typeof value === 'string' ? value : 'Error';
  }

  return 'Error';
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = (error as Record<string, unknown>).message;
    return typeof value === 'string' ? value : String(error);
  }

  return String(error);
}

function parsePayload(payloadJson: string): unknown {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return {};
  }
}

function stringifyValue(input: unknown): string {
  return input === undefined ? '{}' : JSON.stringify(input);
}

function stringPayloadField(payload: unknown, field: string): string {
  if (typeof payload === 'object' && payload !== null && field in payload) {
    const value = (payload as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  return '';
}

export const badFitResourceKinds: readonly ResourceKind[] = [
  'media-stream',
  'renderer',
  'socket',
  'worker',
  'lock',
  'pointer-stream'
];
