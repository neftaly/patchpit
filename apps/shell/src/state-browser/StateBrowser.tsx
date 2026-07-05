import {
  patchpitSystemSchemaRef,
  patchpitSystemSchemas,
  type FilesystemNode,
  type RuntimeStateDoc,
  type WindowLayoutNode,
  WindowManagerNodeKind,
  type WindowManagerStateDoc,
} from '@patchpit/system';
import {
  runtimePlatformFeatureLabel,
  type RuntimeHelloAck,
  type RuntimePlatformFeature,
  type RuntimePlatformReport,
} from '@patchpit/system/runtime';
import type { FilesystemTreeProjectionState } from '../runtime/use-runtime-projection';
import './state-browser.css';

export type StateBrowserRuntimeIssue = {
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
};

export type StateBrowserSnapshotInput = {
  readonly filesystemProjection: FilesystemTreeProjectionState;
  readonly runtimeAck: RuntimeHelloAck;
  readonly runtimeIssue: StateBrowserRuntimeIssue | undefined;
  readonly runtimePlatform: RuntimePlatformReport;
  readonly runtimeState: RuntimeStateDoc;
  readonly schemaDocuments: Readonly<Record<string, unknown>>;
  readonly windowManagerState: WindowManagerStateDoc;
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
type PatchpitMetadataSummary = Readonly<Record<string, unknown>> & {
  readonly type: string;
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
  const schemaRefs = documentSchemaRefs(input.schemaDocuments);

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
        title: 'Runtime Issues',
        summary: input.runtimeIssue?.title ?? 'No current runtime issue',
        data: runtimeIssueData(input.runtimeIssue),
      },
      {
        id: 'platform-features',
        title: 'Platform And Feature Checks',
        summary: input.runtimePlatform.ok ? 'Required boot APIs available' : 'Required boot APIs missing',
        data: platformFeatureData(input.runtimePlatform),
      },
      {
        id: 'window-manager',
        title: 'Window Manager Summary',
        summary: windowManagerSummaryText(input.windowManagerState),
        data: windowManagerSummary(input.windowManagerState),
      },
      {
        id: 'projection-status',
        title: 'Projection Status',
        summary: input.filesystemProjection.status,
        data: projectionStatusData(input.filesystemProjection),
      },
      {
        id: 'schemas',
        title: 'Schema Catalog And Refs',
        summary: `${patchpitSystemSchemas.length} system schemas, ${schemaRefs.length} observed document refs`,
        data: {
          catalog: systemSchemaCatalogSummary(),
          documentRefs: schemaRefs,
        },
      },
      {
        id: 'policy-capabilities',
        title: 'Policy And Capability Placeholders',
        summary: 'Bootstrap runtime placeholders',
        data: {
          policy: {
            current: 'allowAllRuntimePolicy',
            scope: 'submitIntent admission',
            note: 'The bootstrap runtime currently allows all admitted intents after shape and target validation.',
          },
          capabilities: {
            activeGrants: [],
            openCapability: 'unknown_capability',
            note: 'Capability grants are protocol-shaped but not implemented in the bootstrap runtime.',
          },
        },
      },
    ],
  };
}

function runtimeBootGateData(input: StateBrowserSnapshotInput) {
  return {
    connection: {
      status: 'ready',
      ack: input.runtimeAck,
    },
    stateDocument: {
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

function windowManagerSummaryText(state: WindowManagerStateDoc): string {
  const surfaceCount = Object.keys(state.surfaces).length;
  const contextCount = Object.keys(state.contexts).length;
  return `${surfaceCount} surfaces, ${contextCount} contexts`;
}

function windowManagerSummary(state: WindowManagerStateDoc) {
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

function contextsByApp(state: WindowManagerStateDoc): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const context of Object.values(state.contexts)) counts[context.app] = (counts[context.app] ?? 0) + 1;
  return counts;
}

function contextSummary(state: WindowManagerStateDoc, contextId: string) {
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

function projectionStatusData(projection: FilesystemTreeProjectionState) {
  if (projection.status === 'initializing') return { status: projection.status };
  if (projection.status === 'failed') {
    return {
      status: projection.status,
      failure: projection.failure,
    };
  }
  return {
    status: projection.status,
    rootUrl: projection.root.url,
    nodeCount: countFilesystemNodes(projection.root),
  };
}

function countFilesystemNodes(node: FilesystemNode): number {
  if (node.kind === 'file') return 1;
  return 1 + node.entries.reduce((count, entry) => count + countFilesystemNodes(entry), 0);
}

function systemSchemaCatalogSummary() {
  return patchpitSystemSchemas.map((schema) => {
    const ref = patchpitSystemSchemaRef(schema);
    return {
      id: schema.schemaId,
      ...(schema.description === undefined ? {} : { description: schema.description }),
      ref,
      relations: Object.entries(schema.relations).map(([name, relation]) => ({
        name,
        key: relation.key,
        fieldCount: Object.keys(relation.fields).length,
      })),
    };
  });
}

function documentSchemaRefs(documents: Readonly<Record<string, unknown>>) {
  return Object.entries(documents)
    .map(([url, document]) => documentSchemaRef(url, document))
    .filter(isDefined)
    .sort((left, right) => left.type.localeCompare(right.type) || left.url.localeCompare(right.url));
}

function documentSchemaRef(url: string, document: unknown) {
  const metadata = patchpitMetadata(document);
  if (metadata === undefined) return undefined;

  const inlineSchemaIds = isRecord(metadata.schemas) ? Object.keys(metadata.schemas).sort() : [];
  return {
    url,
    type: metadata.type,
    ...(metadata.schema === undefined ? {} : { schema: metadata.schema }),
    ...(inlineSchemaIds.length === 0 ? {} : { inlineSchemaIds }),
  };
}

function patchpitMetadata(document: unknown): PatchpitMetadataSummary | undefined {
  if (!isRecord(document)) return undefined;
  const metadata = document['@patchpit'];
  if (!isRecord(metadata) || typeof metadata.type !== 'string') return undefined;
  return metadata as PatchpitMetadataSummary;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function formatStateBrowserJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
