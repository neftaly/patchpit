import { useEffect, useMemo, useRef, useState } from 'react';
import { createCapabilityLabRuntime, type PointerSample, type UserActivationSnapshot } from './runtime';
import {
  createCapabilityLabProbe,
  type CapabilityLabRows,
  type CapabilityLabSnapshot
} from './store';

const fullscreenResourceId = 'res-fullscreen-shell';
const pointerResourceId = 'res-pointer-stage';
const networkResourceId = 'res-network-sync';

function App() {
  const fullscreenTargetRef = useRef<HTMLElement | null>(null);
  const runtime = useMemo(() => createCapabilityLabRuntime({
    ...(typeof document === 'undefined' ? {} : { document }),
    fullscreenMode: 'browser',
    elementForResource: (resourceId) =>
      resourceId === fullscreenResourceId
        ? fullscreenTargetRef.current ?? undefined
        : undefined,
    userActivation: readUserActivation,
    now: () => Date.now()
  }), []);
  const [snapshot, setSnapshot] = useState<CapabilityLabSnapshot>(() => runtime.store.getState());
  const [selectedRelation, setSelectedRelation] = useState<keyof CapabilityLabRows>('resources');
  const probe = useMemo(() => createCapabilityLabProbe(snapshot), [snapshot]);

  useEffect(() => runtime.store.subscribe(() => {
    setSnapshot(runtime.store.getState());
  }), [runtime]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const syncFullscreen = () => runtime.syncFullscreenState(fullscreenResourceId);
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('fullscreenerror', syncFullscreen);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('fullscreenerror', syncFullscreen);
    };
  }, [runtime]);

  const dispatchFullscreenIntent = () => {
    runtime.dispatchAndProcessIntent({
      resourceId: fullscreenResourceId,
      capabilityId: 'cap-fullscreen-control',
      kind: probe.fullscreenActive ? 'fullscreen.exit' : 'fullscreen.enter'
    });
  };

  const recordPointerBurst = (sampleCount: number, latestX: number, latestY: number) => {
    runtime.ingestPointerSamples(pointerResourceId, createPointerSamples(sampleCount, latestX, latestY));
  };

  const recordNetworkTrace = () => {
    runtime.ingestFakeNetworkTrace(networkResourceId, [
      { sequence: 1, action: 'send', messageId: 'sync-1', queueDepth: 1 },
      { sequence: 2, action: 'send', messageId: 'sync-2', queueDepth: 3 },
      { sequence: 3, action: 'send', messageId: 'sync-3', queueDepth: 5 },
      { sequence: 4, action: 'drop', messageId: 'sync-2', queueDepth: 5 },
      { sequence: 5, action: 'reorder', messageId: 'sync-3', queueDepth: 4 },
      { sequence: 6, action: 'deliver', messageId: 'sync-1', queueDepth: 2 },
      { sequence: 7, action: 'deliver', messageId: 'sync-3', queueDepth: 0 }
    ]);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Tarstate capability lab</p>
          <h1>Runtime rows over private capability state</h1>
        </div>
        <div className="status-pill">Rows, intents, results, diagnostics</div>
      </header>

      <section className="dashboard-grid" aria-label="Capability demos">
        <article className="panel fullscreen-panel" ref={fullscreenTargetRef} data-testid="fullscreen-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Effect boundary</p>
              <h2>Fullscreen card</h2>
            </div>
            <span className={probe.fullscreenActive ? 'state-chip open' : 'state-chip'}>
              {probe.fullscreenActive ? 'open' : 'closed'}
            </span>
          </div>
          <p className="body-copy">
            The button dispatches a real browser fullscreen intent and observes only rows.
          </p>
          <button
            className="primary-action"
            type="button"
            onClick={dispatchFullscreenIntent}
            data-testid="fullscreen-toggle"
          >
            {probe.fullscreenActive ? 'close fullscreen' : 'open fullscreen'}
          </button>
          <RowsList
            rows={snapshot.rows.fullscreen.flatMap((row) => [
              {
                label: 'api',
                value: probe.fullscreenAvailable ? 'available' : 'unsupported',
                meta: `${row.mode ?? probe.fullscreenMode} / ${row.targetResourceId}`
              },
              {
                label: 'activation',
                value: (row.activationRequired ?? probe.fullscreenActivationRequired) ? 'required' : 'not required',
                meta: (row.activationActive ?? probe.fullscreenActivationActive) ? 'active at probe' : 'inactive or unknown'
              },
              {
                label: row.fullscreenId,
                value: row.active ? 'active' : (row.lastOutcome ?? probe.fullscreenLastOutcome),
                meta: row.lastErrorName ?? 'no browser error'
              }
            ])}
          />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Runtime boundary</p>
              <h2>Opaque resource IDs</h2>
            </div>
          </div>
          <p className="body-copy">
            Handles stay inside adapters. The UI consumes resource rows, effect results, and diagnostics from the store boundary.
          </p>
          <div className="resource-list">
            {probe.resources.map((resource) => (
              <div className="resource-row" key={resource.resourceId}>
                <div>
                  <strong>{resource.label}</strong>
                  <code>{resource.resourceId}</code>
                </div>
                <span>{resource.latestResult?.message ?? resource.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel pointer-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Bounded streams</p>
              <h2>Pointer coalescing</h2>
            </div>
          </div>
          <div
            className="pointer-pad"
            onPointerMove={(event) => {
              if (event.buttons === 1) {
                recordPointerBurst(3, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
              }
            }}
          >
            <span>drag here</span>
          </div>
          <button className="secondary-action" type="button" onClick={() => recordPointerBurst(18, 72, 44)}>
            simulate burst
          </button>
          <RowsList
            rows={probe.recentEvents
              .filter((row) => row.kind === 'pointer.coalesced')
              .map((row) => {
                const payload = parseJson(row.payloadJson);
                return {
                  label: row.eventId,
                  value: `${payload.count ?? 0} samples`,
                  meta: `to ${payload.toSequence ?? row.sequence}`
                };
              })}
          />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sync model</p>
              <h2>Fake network trace</h2>
            </div>
          </div>
          <p className="body-copy">
            Backpressure, drops, and reorder are deterministic event and diagnostic rows.
          </p>
          <button className="secondary-action" type="button" onClick={recordNetworkTrace}>
            simulate trace
          </button>
          <RowsList
            rows={probe.recentEvents
              .filter((row) => row.kind === 'network.trace')
              .map((row) => {
                const payload = parseJson(row.payloadJson);
                return {
                  label: row.eventId,
                  value: `${payload.dropped ?? 0} dropped`,
                  meta: `${payload.reordered ?? 0} reordered / queue ${payload.maxQueueDepth ?? 0}`
                };
              })}
          />
        </article>
      </section>

      <section className="debug-panel" aria-label="Query and debug panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Store boundary</p>
            <h2>Inspectable runtime rows</h2>
          </div>
          <select
            value={selectedRelation}
            onChange={(event) => setSelectedRelation(event.target.value as keyof CapabilityLabRows)}
            aria-label="Selected relation"
            data-testid="relation-select"
          >
            {probe.relationNames.map((relationName) => (
              <option key={relationName} value={relationName}>
                {relationName}
              </option>
            ))}
          </select>
        </div>
        <div className="debug-grid">
          <pre data-testid="relation-json">{JSON.stringify(snapshot.rows[selectedRelation], null, 2)}</pre>
          <div className="diagnostics">
            <h3>Diagnostics</h3>
            {probe.diagnostics.map((row) => (
              <div className="diagnostic-row" key={row.diagnosticId}>
                <span>{row.severity}</span>
                <strong>{row.scope}</strong>
                <p>{row.message}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function createPointerSamples(sampleCount: number, latestX: number, latestY: number): readonly PointerSample[] {
  return Array.from({ length: sampleCount }, (_, index) => ({
    sequence: index + 1,
    x: Math.round(latestX - sampleCount + index + 1),
    y: Math.round(latestY - sampleCount + index + 1),
    buttons: 1
  }));
}

type NavigatorWithUserActivation = Navigator & {
  readonly userActivation?: {
    readonly isActive?: boolean;
    readonly hasBeenActive?: boolean;
  };
};

function readUserActivation(): UserActivationSnapshot | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const activation = (navigator as NavigatorWithUserActivation).userActivation;

  if (activation === undefined) {
    return undefined;
  }

  const snapshot: { isActive?: boolean; hasBeenActive?: boolean } = {};

  if (typeof activation.isActive === 'boolean') {
    snapshot.isActive = activation.isActive;
  }

  if (typeof activation.hasBeenActive === 'boolean') {
    snapshot.hasBeenActive = activation.hasBeenActive;
  }

  return snapshot;
}

function RowsList({ rows }: { readonly rows: readonly { readonly label: string; readonly value: string; readonly meta: string }[] }) {
  return (
    <div className="rows-list">
      {rows.map((row) => (
        <div className="mini-row" key={`${row.label}:${row.value}:${row.meta}`}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          <small>{row.meta}</small>
        </div>
      ))}
    </div>
  );
}

function parseJson(input: string): Record<string, unknown> {
  try {
    const value = JSON.parse(input);
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export { App };
