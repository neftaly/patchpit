import {
  runtimePlatformFeatureLabel,
  type RuntimeHelloAck,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
} from '@patchpit/system/runtime';
import { useEffect, useState } from 'react';
import type { BootstrapRuntimeDiagnostics, BootstrapRuntimeDocumentUrls } from '../runtime/bootstrap-runtime';
import './runtime-diagnostics.css';

export type RuntimeDiagnosticsIssue = {
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
};

export type RuntimeDiagnosticsIssueEntry = {
  readonly id: number;
  readonly issue: RuntimeDiagnosticsIssue;
  readonly observedAt: string;
  readonly source: 'capability' | 'intent' | 'runtime';
};

export type RuntimeDiagnosticsSnapshotInput = {
  readonly runtimeAck: RuntimeHelloAck;
  readonly runtimeDiagnostics: BootstrapRuntimeDiagnostics;
  readonly runtimeResources: RuntimeDiagnosticsResources;
  readonly runtimeIssue: RuntimeDiagnosticsIssue | undefined;
  readonly runtimeIssueHistory: readonly RuntimeDiagnosticsIssueEntry[];
  readonly runtimePlatform: RuntimePlatformReport;
};

export type RuntimeDiagnosticsResources = {
  readonly documentUrls: BootstrapRuntimeDocumentUrls;
  readonly rootUrl: string;
};

export type RuntimeDiagnosticsSnapshot = {
  readonly sections: readonly RuntimeDiagnosticsSection[];
};

type RuntimeDiagnosticsSection = {
  readonly data: unknown;
  readonly id: string;
  readonly kind: RuntimeDiagnosticsSectionKind;
  readonly summary: string;
  readonly title: string;
};

type RuntimeDiagnosticsSectionKind = 'events' | 'intents' | 'issues' | 'projections' | 'runtime';
type RuntimeDiagnosticsFilter = 'all' | 'errors' | 'open';

export function RuntimeDiagnostics({
  snapshot,
}: {
  readonly snapshot: RuntimeDiagnosticsSnapshot;
}) {
  const [exportState, setExportState] = useState<RuntimeDiagnosticsExportState>('idle');
  const [filter, setFilter] = useState<RuntimeDiagnosticsFilter>('all');
  const visibleSections = snapshot.sections.map((section) => ({
    ...section,
    preview: runtimeDiagnosticsSectionPreview(section, filter),
  }));

  useEffect(() => {
    if (exportState === 'idle') return undefined;

    const timeout = window.setTimeout(() => setExportState('idle'), 1600);
    return () => window.clearTimeout(timeout);
  }, [exportState]);

  const exportSnapshot = () => {
    const json = formatRuntimeDiagnosticsJson(snapshot);

    void copyRuntimeDiagnosticsJson(json)
      .then(() => setExportState('copied'))
      .catch(() => {
        downloadRuntimeDiagnosticsJson(json);
        setExportState('downloaded');
      });
  };

  return (
    <section className="runtime-diagnostics surface-content" aria-label="Runtime Diagnostics">
      <header className="runtime-diagnostics-header">
        <div className="runtime-diagnostics-titlebar">
          <h1>Runtime Diagnostics</h1>
          <button
            className="runtime-diagnostics-export-button"
            onClick={exportSnapshot}
            type="button"
          >
            {runtimeDiagnosticsExportLabel(exportState)}
          </button>
        </div>
        <p>Transient runtime health and session events. Inspect exported projections at /srv/projections.</p>
      </header>
      <div className="runtime-diagnostics-toolbar" aria-label="Diagnostics filters">
        {runtimeDiagnosticsFilters.map((candidate) => (
          <button
            aria-pressed={filter === candidate.filter}
            className="runtime-diagnostics-filter"
            key={candidate.filter}
            onClick={() => setFilter(candidate.filter)}
            type="button"
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="runtime-diagnostics-sections">
        {visibleSections.map(({ preview, ...section }) => (
          <details
            className="runtime-diagnostics-section"
            key={section.id}
            open={section.kind === 'events' || section.kind === 'intents' || section.kind === 'projections'}
          >
            <summary>
              <span>{section.title}</span>
              <small>{section.summary}</small>
            </summary>
            {preview}
            <details className="runtime-diagnostics-raw">
              <summary>Raw JSON</summary>
              <pre className="diagnostics-json runtime-diagnostics-json">
                {formatRuntimeDiagnosticsJson(section.data)}
              </pre>
            </details>
          </details>
        ))}
      </div>
    </section>
  );
}

type RuntimeDiagnosticsExportState = 'copied' | 'downloaded' | 'idle';

export function createRuntimeDiagnosticsSnapshot(
  input: RuntimeDiagnosticsSnapshotInput,
): RuntimeDiagnosticsSnapshot {
  return {
    sections: [
      {
        id: 'runtime',
        kind: 'runtime',
        title: 'Runtime',
        summary: runtimeSummary(input),
        data: runtimeDiagnosticsData(input),
      },
      {
        id: 'runtime-issues',
        kind: 'issues',
        title: 'Issues',
        summary: runtimeIssuesSummary(input.runtimeIssue, input.runtimeIssueHistory),
        data: runtimeIssuesData(input.runtimeIssue, input.runtimeIssueHistory),
      },
      {
        id: 'projection-subscriptions',
        kind: 'projections',
        title: 'Projections',
        summary: projectionSubscriptionsSummary(input.runtimeDiagnostics.projectionSubscriptions),
        data: projectionSubscriptionsData(input.runtimeDiagnostics.projectionSubscriptions),
      },
      {
        id: 'session-events',
        kind: 'events',
        title: 'Events',
        summary: sessionEventsSummary(input.runtimeDiagnostics.sessionEvents),
        data: sessionEventsData(input.runtimeDiagnostics.sessionEvents),
      },
      {
        id: 'intent-log',
        kind: 'intents',
        title: 'Intents',
        summary: intentLogSummary(input.runtimeDiagnostics.intentLog),
        data: intentLogData(input.runtimeDiagnostics.intentLog),
      },
    ],
  };
}

function runtimeSummary(input: RuntimeDiagnosticsSnapshotInput): string {
  return [
    'runtime ready',
    input.runtimePlatform.ok ? 'platform ok' : 'platform missing APIs',
  ].join(', ');
}

function runtimeDiagnosticsData(input: RuntimeDiagnosticsSnapshotInput) {
  return {
    connection: {
      stateKind: 'live',
      status: 'ready',
      ack: input.runtimeAck,
    },
    automerge: {
      rootUrl: input.runtimeResources.rootUrl,
      documentUrls: input.runtimeResources.documentUrls,
    },
    platform: platformFeatureData(input.runtimePlatform),
  };
}

function runtimeIssuesSummary(
  runtimeIssue: RuntimeDiagnosticsIssue | undefined,
  history: readonly RuntimeDiagnosticsIssueEntry[],
): string {
  if (runtimeIssue !== undefined) return runtimeIssue.title;
  if (history.length === 0) return 'No session issues recorded';
  const latest = history.at(-1);
  return latest === undefined
    ? `${history.length} session issues`
    : `${history.length} session issues, latest ${latest.issue.title}`;
}

function runtimeIssuesData(
  runtimeIssue: RuntimeDiagnosticsIssue | undefined,
  history: readonly RuntimeDiagnosticsIssueEntry[],
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

function sessionEventsSummary(log: BootstrapRuntimeDiagnostics['sessionEvents']): string {
  if (log.length === 0) return 'No session events recorded';
  const latest = log.at(-1);
  return latest === undefined
    ? `${log.length} session events`
    : `${log.length} session events, latest ${latest.source} ${latest.kind}`;
}

function sessionEventsData(log: BootstrapRuntimeDiagnostics['sessionEvents']) {
  return {
    count: log.length,
    counts: countBy(log, (entry) => entry.source),
    entries: [...log].reverse(),
  };
}

function projectionSubscriptionsSummary(
  log: BootstrapRuntimeDiagnostics['projectionSubscriptions'],
): string {
  if (log.length === 0) return 'No projection subscriptions recorded';
  const active = log.filter((entry) => entry.status === 'active').length;
  const errors = log.filter((entry) => entry.status === 'error').length;
  return `${log.length} subscriptions, ${active} active, ${errors} errors`;
}

function projectionSubscriptionsData(log: BootstrapRuntimeDiagnostics['projectionSubscriptions']) {
  return {
    count: log.length,
    counts: countBy(log, (entry) => entry.status),
    entries: [...log].reverse(),
  };
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
    counts: countBy(log, (entry) => entry.status),
    entries: [...log].reverse(),
  };
}

function runtimeDiagnosticsSectionPreview(
  section: RuntimeDiagnosticsSection,
  filter: RuntimeDiagnosticsFilter,
) {
  if (section.kind === 'events') {
    const data = section.data as ReturnType<typeof sessionEventsData>;
    const entries = data.entries.filter((entry) => {
      if (filter === 'errors') return entry.error !== undefined || entry.status === 'error';
      if (filter === 'open') return entry.status === 'pending';
      return true;
    });
    return (
      <RuntimeDiagnosticsRows
        emptyLabel="No matching session events"
        rows={entries.map((entry) => ({
          detail: [entry.intent, entry.requestId, entry.sessionUrl].filter(Boolean).join(' · '),
          meta: `#${entry.sequence} ${entry.observedAt}`,
          status: entry.status ?? entry.source,
          title: `${entry.source} ${entry.kind}`,
        }))}
      />
    );
  }

  if (section.kind === 'intents') {
    const data = section.data as ReturnType<typeof intentLogData>;
    const entries = data.entries.filter((entry) => {
      if (filter === 'errors') return entry.status === 'rejected' || entry.status === 'thrown';
      if (filter === 'open') return entry.status === 'pending';
      return true;
    });
    return (
      <RuntimeDiagnosticsRows
        emptyLabel="No matching intents"
        rows={entries.map((entry) => ({
          detail: `${entry.request.baseHeadDocs.length} base docs · ${relationCountsSummary(entry.request.relationCounts)}`,
          meta: `#${entry.sequence} ${entry.durationMs ?? 0}ms`,
          status: entry.status,
          title: entry.intent,
        }))}
      />
    );
  }

  if (section.kind === 'projections') {
    const data = section.data as ReturnType<typeof projectionSubscriptionsData>;
    const entries = data.entries.filter((entry) => {
      if (filter === 'errors') return entry.status === 'error' || entry.counters.errors > 0;
      if (filter === 'open') return entry.status === 'active';
      return true;
    });
    return (
      <RuntimeDiagnosticsRows
        emptyLabel="No matching projection subscriptions"
        rows={entries.map((entry) => ({
          detail: [
            entry.schemaId,
            `${entry.counters.snapshots} snapshots`,
            `${entry.counters.patches} patches`,
            `${entry.counters.errors} errors`,
          ].join(' · '),
          meta: entry.lastEventAt ?? entry.openedAt,
          status: entry.status,
          title: entry.projection,
        }))}
      />
    );
  }

  return null;
}

function RuntimeDiagnosticsRows({
  emptyLabel,
  rows,
}: {
  readonly emptyLabel: string;
  readonly rows: readonly RuntimeDiagnosticsRow[];
}) {
  if (rows.length === 0) {
    return <p className="runtime-diagnostics-empty">{emptyLabel}</p>;
  }
  return (
    <ol className="runtime-diagnostics-rows">
      {rows.slice(0, 12).map((row, index) => (
        <li className="runtime-diagnostics-row" key={`${row.title}:${row.meta}:${index}`}>
          <span className={`runtime-diagnostics-status ${runtimeDiagnosticsStatusClass(row.status)}`}>
            {row.status}
          </span>
          <span className="runtime-diagnostics-row-main">
            <strong>{row.title}</strong>
            <small>{row.detail}</small>
          </span>
          <time>{row.meta}</time>
        </li>
      ))}
    </ol>
  );
}

type RuntimeDiagnosticsRow = {
  readonly detail: string;
  readonly meta: string;
  readonly status: string;
  readonly title: string;
};

const runtimeDiagnosticsFilters = [
  { filter: 'all', label: 'All' },
  { filter: 'open', label: 'Open' },
  { filter: 'errors', label: 'Errors' },
] as const satisfies readonly {
  readonly filter: RuntimeDiagnosticsFilter;
  readonly label: string;
}[];

function runtimeDiagnosticsStatusClass(status: string): string {
  if (status === 'active' || status === 'committed') return 'is-ok';
  if (status === 'pending') return 'is-pending';
  if (status === 'error' || status === 'rejected' || status === 'thrown') return 'is-error';
  return 'is-muted';
}

function relationCountsSummary(counts: Readonly<Record<string, number>>): string {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return `${total} relation rows`;
}

function countBy<T>(entries: readonly T[], key: (entry: T) => string): Readonly<Record<string, number>> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const countKey = key(entry);
    counts[countKey] = (counts[countKey] ?? 0) + 1;
    return counts;
  }, {});
}

function formatRuntimeDiagnosticsJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function runtimeDiagnosticsExportLabel(state: RuntimeDiagnosticsExportState): string {
  if (state === 'copied') return 'Copied';
  if (state === 'downloaded') return 'Downloaded';
  return 'Copy JSON';
}

async function copyRuntimeDiagnosticsJson(json: string): Promise<void> {
  if (navigator.clipboard === undefined) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(json);
}

function downloadRuntimeDiagnosticsJson(json: string): void {
  const blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');

  link.download = 'runtime-diagnostics.json';
  link.href = blobUrl;
  link.click();
  URL.revokeObjectURL(blobUrl);
}
