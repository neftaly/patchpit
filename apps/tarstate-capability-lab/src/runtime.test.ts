import { describe, expect, it } from 'vitest';
import { as, eq, from, join, pipe, project, where } from '../../../packages/tarstate/src/index';
import { badFitResourceKinds, createCapabilityLabRuntime } from './runtime';
import { capabilityLabSchema } from './schema';

const resource = as(capabilityLabSchema.resources, 'resource');
const capability = as(capabilityLabSchema.capabilities, 'capability');
const effectResult = as(capabilityLabSchema.effectResults, 'effectResult');
const event = as(capabilityLabSchema.events, 'event');
const fullscreen = as(capabilityLabSchema.fullscreen, 'fullscreen');

const resourceCapabilities = pipe(
  from(resource),
  join(from(capability), eq(resource.resourceId, capability.resourceId)),
  project({
    resourceId: resource.resourceId,
    resourceKind: resource.kind,
    capabilityKind: capability.kind,
    canIssueIntents: capability.canIssueIntents
  })
);

const mediaResults = pipe(
  from(effectResult),
  where(eq(effectResult.resourceId, 'res-media-camera')),
  project({
    intentId: effectResult.intentId,
    kind: effectResult.kind,
    status: effectResult.status,
    message: effectResult.message,
    valueJson: effectResult.valueJson
  })
);

describe('tarstate capability runtime', () => {
  it('exposes resources and capabilities as rows without app-facing raw handles', async () => {
    const runtime = createCapabilityLabRuntime();
    const result = await runtime.store.query(resourceCapabilities);
    const badFitRows = result.rows.filter((row) => badFitResourceKinds.includes(row.resourceKind));

    expect(Object.keys(runtime.store)).toEqual(['getState', 'subscribe', 'dispatch', 'query']);
    expect(Object.hasOwn(runtime.store, 'rawState')).toBe(false);
    expect(Object.hasOwn(runtime, 'handles')).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(badFitRows.map((row) => row.resourceKind).sort()).toEqual([
      'lock',
      'media-stream',
      'pointer-stream',
      'renderer',
      'socket',
      'worker'
    ]);
    expect(badFitRows.every((row) => row.canIssueIntents || row.capabilityKind === 'pointer.read')).toBe(true);
    expect(JSON.stringify(result.rows)).not.toContain('requestFullscreen');
  });

  it('lets app code dispatch effect intents and observe results as rows', async () => {
    const runtime = createCapabilityLabRuntime();

    const intentId = runtime.store.dispatch({
      resourceId: 'res-media-camera',
      capabilityId: 'cap-media-control',
      kind: 'media.request',
      payload: { constraints: { video: true } }
    });

    expect(runtime.store.getState().rows.effectIntents).toMatchObject([
      {
        intentId,
        resourceId: 'res-media-camera',
        kind: 'media.request',
        status: 'pending'
      }
    ]);

    await runtime.processPendingIntents();

    const results = await runtime.store.query(mediaResults);
    const mediaResource = runtime.store
      .getState()
      .rows.resources.find((row) => row.resourceId === 'res-media-camera');

    expect(mediaResource?.status).toBe('active');
    expect(runtime.store.getState().rows.effectIntents[0]?.status).toBe('handled');
    expect(results.rows).toEqual([
      {
        intentId,
        kind: 'media.request',
        status: 'ok',
        message: 'media stream opened',
        valueJson: '{"tracks":2}'
      }
    ]);
    expect(JSON.stringify(runtime.store.getState().rows)).not.toContain('trackCount');
  });

  it('uses fullscreen through a runtime adapter and only exposes fullscreen rows', async () => {
    let requested = false;
    let exited = false;
    const runtime = createCapabilityLabRuntime({
      document: {
        fullscreenEnabled: true,
        exitFullscreen: () => {
          exited = true;
        }
      },
      elementForResource: (resourceId) =>
        resourceId === 'res-fullscreen-shell'
          ? {
              requestFullscreen: () => {
                requested = true;
              }
            }
          : undefined,
      now: () => 42
    });

    runtime.store.dispatch({
      resourceId: 'res-fullscreen-shell',
      capabilityId: 'cap-fullscreen-control',
      kind: 'fullscreen.enter'
    });
    await runtime.processPendingIntents();

    const fullscreenRows = await runtime.store.query(pipe(from(fullscreen), project({
      available: fullscreen.available,
      active: fullscreen.active,
      requested: fullscreen.requested,
      targetResourceId: fullscreen.targetResourceId
    })));

    expect(requested).toBe(true);
    expect(fullscreenRows.rows).toEqual([
      {
        available: true,
        active: true,
        requested: true,
        targetResourceId: 'res-fullscreen-shell'
      }
    ]);
    expect(JSON.stringify(fullscreenRows.rows)).not.toContain('requestFullscreen');

    runtime.store.dispatch({
      resourceId: 'res-fullscreen-shell',
      capabilityId: 'cap-fullscreen-control',
      kind: 'fullscreen.exit'
    });
    await runtime.processPendingIntents();

    expect(exited).toBe(true);
    expect(runtime.store.getState().rows.fullscreen[0]).toMatchObject({
      active: false,
      requested: false
    });
  });

  it('invokes real fullscreen request synchronously from the direct dispatch path', async () => {
    let requestedBeforeReturn = false;
    let resolveRequest = () => {};
    let fullscreenElement: unknown;
    const targetElement = {};
    const requestPromise = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
    const runtime = createCapabilityLabRuntime({
      fullscreenMode: 'browser',
      document: {
        fullscreenEnabled: true,
        get fullscreenElement() {
          return fullscreenElement;
        },
        exitFullscreen: () => undefined
      },
      elementForResource: (resourceId) =>
        resourceId === 'res-fullscreen-shell'
          ? {
              requestFullscreen: () => {
                requestedBeforeReturn = true;
                fullscreenElement = targetElement;
                return requestPromise;
              }
            }
          : undefined,
      userActivation: () => ({ isActive: true, hasBeenActive: true }),
      now: () => 84
    });

    const intentId = runtime.dispatchAndProcessIntent({
      resourceId: 'res-fullscreen-shell',
      capabilityId: 'cap-fullscreen-control',
      kind: 'fullscreen.enter'
    });

    expect(requestedBeforeReturn).toBe(true);
    expect(runtime.store.getState().rows.effectIntents.find((row) => row.intentId === intentId)).toMatchObject({
      status: 'running'
    });

    resolveRequest();
    const result = await waitForResult(runtime, intentId);

    expect(result).toMatchObject({
      status: 'ok',
      message: 'browser fullscreen requested'
    });
    expect(runtime.store.getState().rows.fullscreen[0]).toMatchObject({
      mode: 'browser',
      available: true,
      active: true,
      activationRequired: true,
      activationActive: true,
      lastOutcome: 'active'
    });
  });

  it('records unsupported real fullscreen API as result and diagnostic rows', async () => {
    let requestCount = 0;
    const runtime = createCapabilityLabRuntime({
      fullscreenMode: 'browser',
      document: {
        fullscreenEnabled: false
      },
      elementForResource: () => ({
        requestFullscreen: () => {
          requestCount += 1;
        }
      })
    });

    runtime.store.dispatch({
      resourceId: 'res-fullscreen-shell',
      capabilityId: 'cap-fullscreen-control',
      kind: 'fullscreen.enter'
    });
    await expect(runtime.processPendingIntents()).resolves.toBeUndefined();

    const resultRow = runtime.store.getState().rows.effectResults[0];
    const diagnosticRow = runtime.store.getState().rows.diagnostics.find((row) => row.scope === 'browser.fullscreen');

    expect(requestCount).toBe(0);
    expect(resultRow).toMatchObject({
      resourceId: 'res-fullscreen-shell',
      kind: 'fullscreen.enter',
      status: 'unsupported',
      message: 'document fullscreen is unavailable'
    });
    expect(diagnosticRow).toMatchObject({
      severity: 'warning',
      resourceId: 'res-fullscreen-shell',
      message: 'document fullscreen is unavailable'
    });
    expect(runtime.store.getState().rows.fullscreen[0]).toMatchObject({
      mode: 'browser',
      available: false,
      active: false,
      lastOutcome: 'unsupported'
    });
  });

  it('records real fullscreen denial outside activation without rejecting into UI code', async () => {
    const runtime = createCapabilityLabRuntime({
      fullscreenMode: 'browser',
      document: {
        fullscreenEnabled: true
      },
      elementForResource: () => ({
        requestFullscreen: () => Promise.reject(namedError('NotAllowedError', 'user activation is required'))
      }),
      userActivation: () => ({ isActive: false, hasBeenActive: false })
    });

    runtime.store.dispatch({
      resourceId: 'res-fullscreen-shell',
      capabilityId: 'cap-fullscreen-control',
      kind: 'fullscreen.enter'
    });
    await expect(runtime.processPendingIntents()).resolves.toBeUndefined();

    const resultRow = runtime.store.getState().rows.effectResults[0];
    const diagnosticRow = runtime.store.getState().rows.diagnostics.find((row) => row.scope === 'browser.fullscreen');

    expect(resultRow).toMatchObject({
      status: 'denied',
      message: 'fullscreen request rejected: user activation is required'
    });
    expect(resultRow?.valueJson).toContain('"activationRequired":true');
    expect(resultRow?.valueJson).toContain('"activationActive":false');
    expect(resultRow?.valueJson).toContain('"errorName":"NotAllowedError"');
    expect(diagnosticRow).toMatchObject({
      severity: 'warning',
      message: 'fullscreen request rejected: user activation is required'
    });
    expect(runtime.store.getState().rows.fullscreen[0]).toMatchObject({
      active: false,
      activationRequired: true,
      activationActive: false,
      lastOutcome: 'denied',
      lastErrorName: 'NotAllowedError'
    });
  });

  it('records real fullscreen exit failures as rows while keeping the active handle', async () => {
    let fullscreenElement: unknown;
    const targetElement = {};
    const runtime = createCapabilityLabRuntime({
      fullscreenMode: 'browser',
      document: {
        fullscreenEnabled: true,
        get fullscreenElement() {
          return fullscreenElement;
        },
        exitFullscreen: () => Promise.reject(namedError('InvalidStateError', 'not ready to exit'))
      },
      elementForResource: () => ({
        requestFullscreen: () => {
          fullscreenElement = targetElement;
        }
      }),
      userActivation: () => ({ isActive: true, hasBeenActive: true })
    });

    runtime.store.dispatch({
      resourceId: 'res-fullscreen-shell',
      capabilityId: 'cap-fullscreen-control',
      kind: 'fullscreen.enter'
    });
    await runtime.processPendingIntents();

    runtime.store.dispatch({
      resourceId: 'res-fullscreen-shell',
      capabilityId: 'cap-fullscreen-control',
      kind: 'fullscreen.exit'
    });
    await expect(runtime.processPendingIntents()).resolves.toBeUndefined();

    const resultRow = runtime.store.getState().rows.effectResults.at(-1);
    const diagnosticRow = runtime.store.getState().rows.diagnostics.find((row) => row.scope === 'browser.fullscreen');

    expect(resultRow).toMatchObject({
      kind: 'fullscreen.exit',
      status: 'error',
      message: 'fullscreen exit rejected: not ready to exit'
    });
    expect(diagnosticRow).toMatchObject({
      severity: 'error',
      resourceId: 'res-fullscreen-shell',
      message: 'fullscreen exit rejected: not ready to exit'
    });
    expect(runtime.store.getState().rows.fullscreen[0]).toMatchObject({
      active: true,
      lastOutcome: 'failed',
      lastErrorName: 'InvalidStateError'
    });
  });

  it('coalesces high-rate pointer samples into event rows', async () => {
    const runtime = createCapabilityLabRuntime();
    const samples = Array.from({ length: 64 }, (_, index) => ({
      sequence: index + 1,
      x: index,
      y: index * 2,
      buttons: index % 2
    }));

    runtime.ingestPointerSamples('res-pointer-stage', samples);

    const events = await runtime.store.query(pipe(
      from(event),
      where(eq(event.kind, 'pointer.coalesced')),
      project({
        resourceId: event.resourceId,
        kind: event.kind,
        sequence: event.sequence,
        payloadJson: event.payloadJson
      })
    ));

    expect(events.rows).toEqual([
      {
        resourceId: 'res-pointer-stage',
        kind: 'pointer.coalesced',
        sequence: 1,
        payloadJson: '{"count":64,"fromSequence":1,"toSequence":64,"x":63,"y":126,"buttons":1}'
      }
    ]);
  });

  it('models fake network backpressure as deterministic event and diagnostic rows', async () => {
    const runtime = createCapabilityLabRuntime();

    runtime.ingestFakeNetworkTrace('res-network-sync', [
      { sequence: 1, action: 'send', messageId: 'sync-1', queueDepth: 1 },
      { sequence: 2, action: 'send', messageId: 'sync-2', queueDepth: 5 },
      { sequence: 3, action: 'drop', messageId: 'sync-2', queueDepth: 5 },
      { sequence: 4, action: 'reorder', messageId: 'sync-1', queueDepth: 3 },
      { sequence: 5, action: 'deliver', messageId: 'sync-1', queueDepth: 0 }
    ]);

    const networkEvent = runtime.store
      .getState()
      .rows.events.find((row) => row.kind === 'network.trace' && row.createdAt !== 0);
    const networkDiagnostic = runtime.store
      .getState()
      .rows.diagnostics.find((row) => row.scope === 'network-sync');

    expect(networkEvent).toMatchObject({
      resourceId: 'res-network-sync',
      kind: 'network.trace',
      sequence: 1,
      payloadJson: '{"sent":2,"delivered":1,"dropped":1,"reordered":1,"maxQueueDepth":5,"fromSequence":1,"toSequence":5}'
    });
    expect(networkDiagnostic).toMatchObject({
      severity: 'warning',
      resourceId: 'res-network-sync',
      message: 'Fake network trace observed 1 drops, 1 reorders, and queue depth 5.'
    });
    expect(JSON.stringify(runtime.store.getState().rows)).not.toContain('WebSocket');
  });

  it('represents browser storage policy as telemetry diagnostics, not guarantees', () => {
    const runtime = createCapabilityLabRuntime();
    const storageResource = runtime.store
      .getState()
      .rows.resources.find((row) => row.resourceId === 'res-storage-cache');
    const storageDiagnostic = runtime.store
      .getState()
      .rows.diagnostics.find((row) => row.scope === 'browser.storage');

    expect(storageResource).toMatchObject({
      kind: 'storage',
      adapter: 'browser.storageEstimate',
      status: 'active'
    });
    expect(storageDiagnostic).toMatchObject({
      severity: 'info',
      resourceId: 'res-storage-cache'
    });
    expect(storageDiagnostic?.message).toContain('telemetry');
    expect(storageDiagnostic?.message).toContain('must not treat them as guarantees');
  });

  it('keeps bad-fit adapter failures in result and diagnostic rows', async () => {
    const runtime = createCapabilityLabRuntime();

    runtime.store.dispatch({
      resourceId: 'res-renderer-main',
      capabilityId: 'cap-renderer-control',
      kind: 'renderer.drawFrame'
    });
    await runtime.processPendingIntents();

    const resultRow = runtime.store.getState().rows.effectResults[0];
    const diagnosticRow = runtime.store.getState().rows.diagnostics.find((row) => row.scope === 'runtime');

    expect(resultRow).toMatchObject({
      resourceId: 'res-renderer-main',
      kind: 'renderer.drawFrame',
      status: 'error',
      message: 'renderer must be created before drawing'
    });
    expect(diagnosticRow).toMatchObject({
      severity: 'error',
      resourceId: 'res-renderer-main',
      message: 'renderer must be created before drawing'
    });
  });
});

async function waitForResult(runtime: ReturnType<typeof createCapabilityLabRuntime>, intentId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = runtime.store.getState().rows.effectResults.find((row) => row.intentId === intentId);

    if (result !== undefined) {
      return result;
    }

    await Promise.resolve();
  }

  throw new Error(`result row not produced for ${intentId}`);
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}
