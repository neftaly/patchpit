import { type FilesystemNode, type RuntimeStateDoc } from '@patchpit/system';
import {
  runtimePlatformFeatureLabel,
  type RuntimeHelloAck,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
} from '@patchpit/system/runtime';
import type { BootstrapRuntimeDiagnostics } from '../runtime/bootstrap-runtime';
import type {
  FilesystemTreeProjectionState,
  WorkspaceProjectionState,
} from '../runtime/use-runtime-projection';
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

export function StateBrowser({ snapshot }: { readonly snapshot: StateBrowserSnapshot }) {
  return (
    <section className="state-browser surface-content" aria-label="State Browser">
      <header className="state-browser-header">
        <h1>Runtime Diagnostics</h1>
        <p>Temporary developer view for boot, projection health, and runtime events.</p>
      </header>
      <div className="state-browser-sections">
        {snapshot.sections.map((section) => (
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
        summary: projectionStatusSummary(
          input.filesystemProjection,
          input.workspaceProjection,
          projectionCounters,
        ),
        data: projectionStatusData(
          input.filesystemProjection,
          input.workspaceProjection,
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
  projection: FilesystemTreeProjectionState,
  workspaceProjection: WorkspaceProjectionState,
  counters: ProjectionCounters,
): string {
  return [
    `filesystem ${projection.status}`,
    `workspace ${workspaceProjection.status}`,
    `${counters.resets} resets`,
    `${counters.errors} errors`,
  ].join(', ');
}

function projectionStatusData(
  projection: FilesystemTreeProjectionState,
  workspaceProjection: WorkspaceProjectionState,
  diagnostics: BootstrapRuntimeDiagnostics,
  counters: ProjectionCounters,
) {
  return {
    current: {
      stateKind: 'derived',
      filesystem: filesystemProjectionData(projection),
      workspace: workspaceProjectionData(workspaceProjection),
    },
    stateKind: 'live',
    subscriptions: diagnostics.projectionSubscriptions,
    totals: counters,
  };
}

function filesystemProjectionData(projection: FilesystemTreeProjectionState) {
  if (projection.status !== 'ready') return unavailableProjectionData(projection);
  return {
    stateKind: 'derived',
    status: projection.status,
    rootUrl: projection.root.url,
    nodeCount: countFilesystemNodes(projection.root),
  };
}

function workspaceProjectionData(projection: WorkspaceProjectionState) {
  if (projection.status !== 'ready') return unavailableProjectionData(projection);
  return {
    stateKind: 'derived',
    status: projection.status,
    focus: projection.workspace.focus,
    contextCount: Object.keys(projection.workspace.contexts).length,
    surfaceCount: Object.keys(projection.workspace.surfaces).length,
    schemaHash: projection.workspace.schemaHash,
    storageHeadDocs: Object.keys(projection.workspace.storageHeads ?? {}),
  };
}

function unavailableProjectionData(projection: { readonly status: 'initializing' } | { readonly status: 'failed'; readonly failure: unknown }) {
  return projection.status === 'initializing'
    ? { stateKind: 'derived', status: projection.status }
    : { stateKind: 'derived', status: projection.status, failure: projection.failure };
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

function countFilesystemNodes(node: FilesystemNode): number {
  if (node.kind === 'file') return 1;
  return 1 + node.entries.reduce((count, entry) => count + countFilesystemNodes(entry), 0);
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
