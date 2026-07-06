import {
  runtimePlatformFeatureLabel,
  type RuntimeHelloAck,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
} from '@patchpit/system/runtime';
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
  readonly summary: string;
  readonly title: string;
};

export function RuntimeDiagnostics({
  snapshot,
}: {
  readonly snapshot: RuntimeDiagnosticsSnapshot;
}) {
  return (
    <section className="runtime-diagnostics surface-content" aria-label="Runtime Diagnostics">
      <header className="runtime-diagnostics-header">
        <h1>Runtime Diagnostics</h1>
        <p>Transient runtime health and session events. Inspect exported projections at /srv/projections.</p>
      </header>
      <div className="runtime-diagnostics-sections">
        {snapshot.sections.map((section) => (
          <details className="runtime-diagnostics-section" key={section.id}>
            <summary>
              <span>{section.title}</span>
              <small>{section.summary}</small>
            </summary>
            <pre className="diagnostics-json runtime-diagnostics-json">
              {formatRuntimeDiagnosticsJson(section.data)}
            </pre>
          </details>
        ))}
      </div>
    </section>
  );
}

export function createRuntimeDiagnosticsSnapshot(
  input: RuntimeDiagnosticsSnapshotInput,
): RuntimeDiagnosticsSnapshot {
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
        id: 'intent-log',
        title: 'Events',
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

function formatRuntimeDiagnosticsJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
