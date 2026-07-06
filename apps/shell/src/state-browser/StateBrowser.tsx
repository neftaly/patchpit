import {
  type FilesystemNode,
  type RuntimeStateDoc,
  type WindowLayoutNode,
  WindowManagerNodeKind,
} from '@patchpit/system';
import {
  runtimePlatformFeatureLabel,
  type RuntimeHelloAck,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
} from '@patchpit/system/runtime';
import type { BootstrapRuntimeDiagnostics } from '../runtime/bootstrap-runtime';
import type {
  FilesystemTreeProjectionState,
  WorkspaceProjection,
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
        <h1>State Browser</h1>
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
        id: 'runtime-boot',
        title: 'Runtime Boot Gate',
        summary: input.runtimeState.boot.status,
        data: runtimeBootGateData(input),
      },
      {
        id: 'runtime-issues',
        title: 'Current Runtime Issue',
        summary: input.runtimeIssue?.title ?? 'No current runtime issue',
        data: runtimeIssueData(input.runtimeIssue),
      },
      {
        id: 'runtime-issue-history',
        title: 'Runtime Issue History',
        summary: runtimeIssueHistorySummary(input.runtimeIssueHistory),
        data: runtimeIssueHistoryData(input.runtimeIssueHistory),
      },
      {
        id: 'platform-features',
        title: 'Platform And Feature Checks',
        summary: input.runtimePlatform.ok ? 'Required boot APIs available' : 'Required boot APIs missing',
        data: platformFeatureData(input.runtimePlatform),
      },
      {
        id: 'window-manager',
        title: 'Workspace Layout Summary',
        summary: workspaceSummaryText(input.workspaceProjection),
        data: workspaceSummary(input.workspaceProjection),
      },
      {
        id: 'projection-status',
        title: 'Projection Status And Counters',
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
        id: 'projection-snapshots',
        title: 'Projection Snapshots',
        summary: projectionSnapshotsSummary(input.filesystemProjection, input.workspaceProjection),
        data: projectionSnapshotsData(input.filesystemProjection, input.workspaceProjection),
      },
      {
        id: 'intent-log',
        title: 'Intent Request And Result Log',
        summary: intentLogSummary(input.runtimeDiagnostics.intentLog),
        data: intentLogData(input.runtimeDiagnostics.intentLog),
      },
      {
        id: 'policy-capabilities',
        title: 'Policy And Capability Placeholders',
        summary: 'Bootstrap runtime placeholders',
        data: {
          policy: {
            stateKind: 'live',
            current: 'allowAllRuntimePolicy',
            scope: 'submitIntent admission',
            note: 'The bootstrap runtime currently allows all admitted intents after shape and target validation.',
          },
          capabilities: {
            stateKind: 'live',
            activeGrants: [],
            providerRegistration: 'bootstrap runtime dispatches registered capability providers',
            note: 'Capability grants are opened on demand; persistent grant tracking is not represented yet.',
          },
        },
      },
    ],
  };
}

function runtimeBootGateData(input: StateBrowserSnapshotInput) {
  return {
    connection: {
      stateKind: 'live',
      status: 'ready',
      ack: input.runtimeAck,
    },
    stateDocument: {
      stateKind: 'canonical',
      appInstances: input.runtimeState.appInstances,
      boot: input.runtimeState.boot,
      features: input.runtimeState.features,
      ownership: input.runtimeState.ownership,
      protocol: input.runtimeState.protocol,
      title: input.runtimeState.title,
      workers: input.runtimeState.workers,
    },
  };
}

function runtimeIssueData(runtimeIssue: StateBrowserRuntimeIssue | undefined) {
  return runtimeIssue === undefined
    ? { status: 'none' }
    : {
        status: 'current',
        issue: runtimeIssue,
      };
}

function runtimeIssueHistorySummary(history: readonly StateBrowserRuntimeIssueEntry[]): string {
  if (history.length === 0) return 'No session issues recorded';
  const latest = history.at(-1);
  return latest === undefined
    ? `${history.length} session issues`
    : `${history.length} session issues, latest ${latest.issue.title}`;
}

function runtimeIssueHistoryData(history: readonly StateBrowserRuntimeIssueEntry[]) {
  return {
    count: history.length,
    issues: [...history].reverse(),
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

function workspaceSummaryText(projection: WorkspaceProjectionState): string {
  if (projection.status === 'initializing') return 'Workspace projection initializing';
  if (projection.status === 'failed') return projection.failure.title;
  return windowManagerSummaryText(projection.workspace);
}

function workspaceSummary(projection: WorkspaceProjectionState) {
  if (projection.status === 'initializing') return { status: projection.status };
  if (projection.status === 'failed') return { status: projection.status, failure: projection.failure };
  return {
    status: projection.status,
    schemaHash: projection.workspace.schemaHash,
    storageHeadDocs: Object.keys(projection.workspace.storageHeads ?? {}),
    ...windowManagerSummary(projection.workspace),
  };
}

function windowManagerSummaryText(state: WorkspaceProjection): string {
  const surfaceCount = Object.keys(state.surfaces).length;
  const contextCount = Object.keys(state.contexts).length;
  return `${surfaceCount} surfaces, ${contextCount} contexts`;
}

function windowManagerSummary(state: WorkspaceProjection) {
  return {
    focus: state.focus,
    counts: {
      contexts: Object.keys(state.contexts).length,
      surfaces: Object.keys(state.surfaces).length,
      contextsByApp: contextsByApp(state),
    },
    layout: layoutSummary(state.layout),
    surfaces: Object.values(state.surfaces).map((surface) => ({
      id: surface.id,
      role: surface.role,
      ...(surface.activeContext === undefined ? {} : { activeContext: surface.activeContext }),
      ...(surface.previewContext === undefined ? {} : { previewContext: surface.previewContext }),
      pinnedContextCount: surface.contexts.length,
      pinnedContexts: surface.contexts.map((contextId) => contextSummary(state, contextId)),
    })),
  };
}

function contextsByApp(state: WorkspaceProjection): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const context of Object.values(state.contexts)) counts[context.app] = (counts[context.app] ?? 0) + 1;
  return counts;
}

function contextSummary(state: WorkspaceProjection, contextId: string) {
  const context = state.contexts[contextId];
  if (context === undefined) return { id: contextId, missing: true };
  return {
    id: context.id,
    app: context.app,
    ...(context.title === undefined ? {} : { title: context.title }),
    url: context.url,
  };
}

function layoutSummary(node: WindowLayoutNode): unknown {
  if (node.kind === WindowManagerNodeKind.Surface) {
    return {
      kind: node.kind,
      surfaceId: node.surfaceId,
    };
  }

  return {
    kind: node.kind,
    direction: node.direction,
    ratio: node.ratio,
    first: layoutSummary(node.first),
    second: layoutSummary(node.second),
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

function projectionSnapshotsSummary(
  filesystemProjection: FilesystemTreeProjectionState,
  workspaceProjection: WorkspaceProjectionState,
): string {
  return `filesystem ${filesystemProjection.status}, workspace ${workspaceProjection.status}`;
}

function projectionSnapshotsData(
  filesystemProjection: FilesystemTreeProjectionState,
  workspaceProjection: WorkspaceProjectionState,
) {
  return {
    stateKind: 'derived',
    filesystem: filesystemProjectionSnapshotData(filesystemProjection),
    workspace: workspaceProjectionSnapshotData(workspaceProjection),
  };
}

function filesystemProjectionSnapshotData(projection: FilesystemTreeProjectionState) {
  if (projection.status !== 'ready') return unavailableProjectionData(projection);
  return {
    stateKind: 'derived',
    status: projection.status,
    root: projection.root,
  };
}

function workspaceProjectionSnapshotData(projection: WorkspaceProjectionState) {
  if (projection.status !== 'ready') return unavailableProjectionData(projection);
  return {
    stateKind: 'derived',
    status: projection.status,
    workspace: projection.workspace,
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
