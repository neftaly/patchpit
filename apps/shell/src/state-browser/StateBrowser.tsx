import { useState } from 'react';
import { type RuntimeStateDoc } from '@patchpit/system';
import {
  type ProjectionName,
  type ProjectionSnapshot,
  type RuntimeClient,
  runtimePlatformFeatureLabel,
  type RuntimeHelloAck,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
  type RuntimeProjectionCatalogRow,
} from '@patchpit/system/runtime';
import { relationRows, relationSetNames } from '@patchpit/system/runtime/relations';
import type { BootstrapRuntimeDiagnostics } from '../runtime/bootstrap-runtime';
import type {
  FilesystemTreeProjectionState,
  RuntimeProjectionCatalogState,
  RuntimeProjectionSnapshotState,
  WorkspaceProjectionState,
} from '../runtime/use-runtime-projection';
import { useRuntimeProjectionSnapshot } from '../runtime/use-runtime-projection';
import './state-browser.css';

export type StateBrowserRuntimeIssue = {
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
};

export type StateBrowserRuntimeIssueEntry = {
  readonly id: number;
  readonly issue: StateBrowserRuntimeIssue;
  readonly observedAt: string;
  readonly source: 'capability' | 'intent' | 'runtime';
};

export type StateBrowserSnapshotInput = {
  readonly filesystemProjection: FilesystemTreeProjectionState;
  readonly runtimeAck: RuntimeHelloAck;
  readonly runtimeDiagnostics: BootstrapRuntimeDiagnostics;
  readonly runtimeIssue: StateBrowserRuntimeIssue | undefined;
  readonly runtimeIssueHistory: readonly StateBrowserRuntimeIssueEntry[];
  readonly runtimePlatform: RuntimePlatformReport;
  readonly runtimeProjectionCatalog: RuntimeProjectionCatalogState;
  readonly runtimeState: RuntimeStateDoc;
  readonly workspaceProjection: WorkspaceProjectionState;
};

export type StateBrowserSnapshot = {
  readonly sections: readonly StateBrowserSection[];
};

type StateBrowserSection = {
  readonly data: unknown;
  readonly id: string;
  readonly summary: string;
  readonly title: string;
};

export function StateBrowser({
  projectionCatalog,
  runtime,
  snapshot,
}: {
  readonly projectionCatalog: RuntimeProjectionCatalogState;
  readonly runtime: RuntimeClient;
  readonly snapshot: StateBrowserSnapshot;
}) {
  return (
    <section className="state-browser surface-content" aria-label="Runtime Diagnostics">
      <header className="state-browser-header">
        <h1>Runtime Diagnostics</h1>
        <p>Projection catalog, runtime health, and session events.</p>
      </header>
      <div className="state-browser-sections">
        {snapshot.sections.map((section) => section.id === 'projection-status'
          ? (
              <ProjectionInspectorSection
                key={section.id}
                projectionCatalog={projectionCatalog}
                runtime={runtime}
                section={section}
              />
            )
          : (
              <details className="state-browser-section" key={section.id}>
                <summary>
                  <span>{section.title}</span>
                  <small>{section.summary}</small>
                </summary>
                <pre className="diagnostics-json state-browser-json">
                  {formatStateBrowserJson(section.data)}
                </pre>
              </details>
            ))}
      </div>
    </section>
  );
}

export function createStateBrowserSnapshot(input: StateBrowserSnapshotInput): StateBrowserSnapshot {
  const projectionCounters = totalProjectionCounters(input.runtimeDiagnostics);

  return {
    sections: [
      {
        id: 'runtime',
        title: 'Runtime',
        summary: runtimeSummary(input),
        data: runtimeDiagnosticsData(input),
      },
      {
        id: 'runtime-issues',
        title: 'Issues',
        summary: runtimeIssuesSummary(input.runtimeIssue, input.runtimeIssueHistory),
        data: runtimeIssuesData(input.runtimeIssue, input.runtimeIssueHistory),
      },
      {
        id: 'projection-status',
        title: 'Projections',
        summary: projectionStatusSummary(input.runtimeProjectionCatalog, projectionCounters),
        data: projectionStatusData(
          input.runtimeProjectionCatalog,
          input.runtimeDiagnostics,
          projectionCounters,
        ),
      },
      {
        id: 'intent-log',
        title: 'Events',
        summary: intentLogSummary(input.runtimeDiagnostics.intentLog),
        data: intentLogData(input.runtimeDiagnostics.intentLog),
      },
    ],
  };
}

function runtimeSummary(input: StateBrowserSnapshotInput): string {
  return [
    `boot ${input.runtimeState.boot.status}`,
    input.runtimePlatform.ok ? 'platform ok' : 'platform missing APIs',
  ].join(', ');
}

function runtimeDiagnosticsData(input: StateBrowserSnapshotInput) {
  return {
    connection: {
      stateKind: 'live',
      status: 'ready',
      ack: input.runtimeAck,
    },
    runtimeState: {
      stateKind: 'canonical',
      boot: input.runtimeState.boot,
      features: input.runtimeState.features,
      protocol: input.runtimeState.protocol,
      title: input.runtimeState.title,
      workers: input.runtimeState.workers,
    },
    platform: platformFeatureData(input.runtimePlatform),
  };
}

function runtimeIssuesSummary(
  runtimeIssue: StateBrowserRuntimeIssue | undefined,
  history: readonly StateBrowserRuntimeIssueEntry[],
): string {
  if (runtimeIssue !== undefined) return runtimeIssue.title;
  if (history.length === 0) return 'No session issues recorded';
  const latest = history.at(-1);
  return latest === undefined
    ? `${history.length} session issues`
    : `${history.length} session issues, latest ${latest.issue.title}`;
}

function runtimeIssuesData(
  runtimeIssue: StateBrowserRuntimeIssue | undefined,
  history: readonly StateBrowserRuntimeIssueEntry[],
) {
  return {
    current: runtimeIssue === undefined
      ? { status: 'none' }
      : {
          status: 'current',
          issue: runtimeIssue,
        },
    count: history.length,
    recent: [...history].reverse(),
  };
}

function platformFeatureData(platform: RuntimePlatformReport) {
  return {
    ok: platform.ok,
    missing: platform.missing.map(platformFeatureSummary),
    plannedMissing: platform.plannedMissing.map(platformFeatureSummary),
    features: Object.entries(platform.features).map(([feature, available]) => ({
      available,
      feature,
      label: runtimePlatformFeatureLabel(feature as RuntimePlatformFeature),
    })),
  };
}

function platformFeatureSummary(feature: RuntimePlatformFeature) {
  return {
    feature,
    label: runtimePlatformFeatureLabel(feature),
  };
}

function projectionStatusSummary(
  catalog: RuntimeProjectionCatalogState,
  counters: ProjectionCounters,
): string {
  const catalogSummary = catalog.status === 'ready'
    ? `${catalog.rows.length} catalog rows`
    : `catalog ${catalog.status}`;
  return [
    catalogSummary,
    `${counters.resets} resets`,
    `${counters.errors} errors`,
  ].join(', ');
}

function projectionStatusData(
  catalog: RuntimeProjectionCatalogState,
  diagnostics: BootstrapRuntimeDiagnostics,
  counters: ProjectionCounters,
) {
  return {
    catalog: projectionCatalogData(catalog),
    stateKind: 'live',
    subscriptions: diagnostics.projectionSubscriptions,
    totals: counters,
  };
}

function projectionCatalogData(catalog: RuntimeProjectionCatalogState) {
  if (catalog.status !== 'ready') return catalog;
  return {
    status: catalog.status,
    rows: catalog.rows.map((row) => ({
      basisKinds: row.basisKinds,
      description: row.description,
      name: row.name,
      owner: row.owner,
      schemaHash: row.schemaHash,
      schemaId: row.schemaId,
      schemaUrl: row.schemaUrl,
    })),
    snapshot: projectionSnapshotData(catalog.snapshot),
  };
}

type ProjectionCounters = ReturnType<typeof totalProjectionCounters>;

function totalProjectionCounters(diagnostics: BootstrapRuntimeDiagnostics) {
  return diagnostics.projectionSubscriptions.reduce(
    (totals, subscription) => ({
      errors: totals.errors + subscription.counters.errors,
      patches: totals.patches + subscription.counters.patches,
      resets: totals.resets + subscription.counters.resets,
      snapshots: totals.snapshots + subscription.counters.snapshots,
    }),
    {
      errors: 0,
      patches: 0,
      resets: 0,
      snapshots: 0,
    },
  );
}

function intentLogSummary(log: BootstrapRuntimeDiagnostics['intentLog']): string {
  if (log.length === 0) return 'No session intents recorded';
  const latest = log.at(-1);
  return latest === undefined
    ? `${log.length} session intents`
    : `${log.length} session intents, latest ${latest.intent} ${latest.status}`;
}

function intentLogData(log: BootstrapRuntimeDiagnostics['intentLog']) {
  return {
    count: log.length,
    entries: [...log].reverse(),
  };
}

function formatStateBrowserJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function ProjectionInspectorSection({
  projectionCatalog,
  runtime,
  section,
}: {
  readonly projectionCatalog: RuntimeProjectionCatalogState;
  readonly runtime: RuntimeClient;
  readonly section: StateBrowserSection;
}) {
  const rows = projectionCatalog.status === 'ready' ? projectionCatalog.rows : [];
  const [selectedName, setSelectedName] = useState<ProjectionName | undefined>(undefined);
  const selectedRow = rows.find((row) => row.name === selectedName) ?? rows[0];
  const selectedSnapshot = useRuntimeProjectionSnapshot(
    runtime,
    selectedRow === undefined
      ? undefined
      : { projection: selectedRow.name, schemaId: selectedRow.schemaId },
  );

  return (
    <details className="state-browser-section projection-inspector" open>
      <summary>
        <span>{section.title}</span>
        <small>{section.summary}</small>
      </summary>
      <div className="projection-inspector-body">
        {projectionCatalog.status === 'failed'
          ? <ProjectionFailure failure={projectionCatalog.failure} />
          : null}
        {projectionCatalog.status === 'initializing'
          ? <p className="projection-empty">Loading projection catalog.</p>
          : null}
        {projectionCatalog.status === 'ready'
          ? (
              <>
                <div className="projection-list" role="list" aria-label="Projection catalog">
                  {rows.map((row) => (
                    <button
                      aria-pressed={row.name === selectedRow?.name}
                      className="projection-row"
                      key={row.name}
                      onClick={() => setSelectedName(row.name)}
                      type="button"
                    >
                      <span className="projection-row-name">{row.name}</span>
                      <span className="projection-row-schema">{row.schemaId}</span>
                      <span className="projection-row-meta">
                        {row.schemaHash} / {row.basisKinds.join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
                <ProjectionDetail row={selectedRow} snapshotState={selectedSnapshot} />
              </>
            )
          : null}
        <details className="projection-json">
          <summary>Raw diagnostics JSON</summary>
          <pre className="diagnostics-json state-browser-json">
            {formatStateBrowserJson(section.data)}
          </pre>
        </details>
      </div>
    </details>
  );
}

function ProjectionDetail({
  row,
  snapshotState,
}: {
  readonly row: RuntimeProjectionCatalogRow | undefined;
  readonly snapshotState: RuntimeProjectionSnapshotState;
}) {
  if (row === undefined) return <p className="projection-empty">No projections advertised.</p>;

  return (
    <section className="projection-detail" aria-label={`${row.name} projection details`}>
      <header>
        <h2>{row.name}</h2>
        <p>{row.description ?? 'No description advertised.'}</p>
      </header>
      <dl className="projection-metadata">
        <div>
          <dt>Schema</dt>
          <dd>{row.schemaId}</dd>
        </div>
        <div>
          <dt>Hash</dt>
          <dd>{row.schemaHash}</dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>{row.basisKinds.join(', ')}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{row.owner ?? 'runtime'}</dd>
        </div>
        {row.schemaUrl === undefined
          ? null
          : (
              <div>
                <dt>Schema URL</dt>
                <dd>{row.schemaUrl}</dd>
              </div>
            )}
      </dl>
      <ProjectionSnapshotSummary snapshotState={snapshotState} />
    </section>
  );
}

function ProjectionSnapshotSummary({
  snapshotState,
}: {
  readonly snapshotState: RuntimeProjectionSnapshotState;
}) {
  if (snapshotState.status === 'initializing') {
    return <p className="projection-empty">Loading selected projection snapshot.</p>;
  }
  if (snapshotState.status === 'failed') return <ProjectionFailure failure={snapshotState.failure} />;

  const relationSummaries = relationSetNames(snapshotState.snapshot.relations).map((name) => ({
    name,
    rows: relationRows<unknown>(snapshotState.snapshot.relations, name).length,
  }));

  return (
    <>
      <div className="projection-counts" aria-label="Relation row counts">
        {relationSummaries.map((relation) => (
          <span key={relation.name}>
            <strong>{relation.rows}</strong>
            {relation.name}
          </span>
        ))}
      </div>
      <details className="projection-json">
        <summary>Selected snapshot JSON</summary>
        <pre className="diagnostics-json state-browser-json">
          {formatStateBrowserJson(projectionSnapshotData(snapshotState.snapshot))}
        </pre>
      </details>
    </>
  );
}

function ProjectionFailure({ failure }: { readonly failure: unknown }) {
  return (
    <pre className="diagnostics-json state-browser-json projection-failure">
      {formatStateBrowserJson(failure)}
    </pre>
  );
}

function projectionSnapshotData(snapshot: ProjectionSnapshot) {
  return {
    basis: snapshot.basis,
    lensPath: snapshot.lensPath,
    projection: snapshot.projection,
    relationRowCounts: Object.fromEntries(
      relationSetNames(snapshot.relations).map((name) => [
        name,
        relationRows<unknown>(snapshot.relations, name).length,
      ]),
    ),
    schema: snapshot.schema,
    schemaHash: snapshot.schemaHash,
    schemaId: snapshot.schemaId,
    storageHeads: snapshot.storageHeads,
    subscriptionId: snapshot.subscriptionId,
  };
}
