import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import {
  createSeedFilesystem,
  nodePath,
  recordRuntimeBootGateAck,
  resolveTheme,
  themeStyle,
  type AppearanceDoc,
  type FilePickerStateDoc,
  type FileTypesDoc,
  type FileType,
  type FilesystemNode,
  type ThemeDoc,
} from '@patchpit/system';
import {
  connectRuntimeBootGate,
  probeRuntimePlatform,
  routeOpenIntent,
  RuntimeBootGateConnectError,
  runtimePlatformFeatureLabel,
  windowCloseContextIntent,
  windowFocusIntent,
  windowMoveTabIntent,
  windowPinPreviewIntent,
  windowResizeSplitIntent,
  type AppliedPolicyEffects,
  type IntentResult,
  type RuntimeBootGateConnection,
  type RuntimeBootGateFactoryOptions,
  type RuntimePlatformReport,
  type RuntimeError,
} from '@patchpit/system/runtime';
import { LauncherBar } from './launcher/LauncherBar';
import { launcherItems } from './launcher/launch-router';
import {
  installedAppsFromFilesystem,
  type InstalledApp,
} from './app-host/installed-apps';
import { SandboxedFilesystemApp, type SandboxFilePickerHostScope } from './app-host/SandboxedFilesystemApp';
import { createBootstrapRuntimeClient, type BootstrapSessionEventInput } from './runtime/bootstrap-runtime';
import { patchpitRuntimeBuildId } from './runtime/build-id';
import { parseHashLaunchConfig } from './runtime/launch-from-hash';
import { detailFromUnknown, metadataDetails } from './runtime/runtime-error-details';
import runtimeSharedWorkerUrl from './runtime/shared-worker.ts?sharedworker&url';
import { submitAppLaunchIntent, type AppLaunchIntentInput } from './runtime/launch-intents';
import { submitRouteIntent, type RouteIntentInput, type RouteIntentName } from './runtime/route-intents';
import { type RuntimeDiagnosticsIssueEntry } from './runtime-diagnostics/RuntimeDiagnostics';
import { RuntimeDiagnosticsSurface } from './runtime-diagnostics/RuntimeDiagnosticsSurface';
import { useRuntimeDocument } from './runtime/use-automerge-doc';
import { useFilesystemTreeProjection, useWorkspaceProjection } from './runtime/use-runtime-projection';
import { submitWindowIntent, type WindowIntentInput, type WindowIntentName } from './runtime/window-intents';
import {
  WindowManager,
  type WindowManagerAppHost,
  type WindowManagerDroppedUrl,
} from './window-manager/WindowManager';
import {
  focusedAppId,
  type ContextDropTarget,
  type SplitPath,
} from './window-manager/window-manager-state';

export function App() {
  const [runtimePlatform] = useState(probeRuntimePlatform);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const runtimeBoot = useRuntimeBootGate(runtimePlatform);

  if (runtimeBoot.status === 'unsupported') {
    return <RuntimeUnavailable platform={runtimePlatform} failure={runtimeBoot.failure} />;
  }
  if (runtimeBoot.status === 'failed') {
    return <RuntimeUnavailable platform={runtimePlatform} failure={runtimeBoot.failure} />;
  }
  if (runtimeBoot.status === 'connecting') {
    return <RuntimeBooting platform={runtimePlatform} />;
  }

  return (
    <ShellApp
      key={sessionEpoch}
      onResetSession={() => setSessionEpoch((epoch) => epoch + 1)}
      runtimeConnection={runtimeBoot.connection}
      runtimePlatform={runtimePlatform}
    />
  );
}

function ShellApp({
  onResetSession,
  runtimeConnection,
  runtimePlatform,
}: {
  readonly onResetSession: () => void;
  readonly runtimeConnection: RuntimeBootGateConnection;
  readonly runtimePlatform: RuntimePlatformReport;
}) {
  const [seed] = useState(createSeedFilesystem);
  const [runtime] = useState(() => createBootstrapRuntimeClient({
    seed,
    workspaceId: 'default',
  }));
  const { documentUrls, rootUrl } = runtime.resources;
  const appearance = useRuntimeDocument<AppearanceDoc>(runtime.resources, documentUrls.appearance);
  const darkTheme = useRuntimeDocument<ThemeDoc>(runtime.resources, documentUrls.darkTheme);
  const fileTypes = useRuntimeDocument<FileTypesDoc>(runtime.resources, documentUrls.fileTypes);
  const filePickerTypes = useMemo(() => normalizedFileTypes(fileTypes), [fileTypes]);
  const lightTheme = useRuntimeDocument<ThemeDoc>(runtime.resources, documentUrls.lightTheme);
  const [runtimeFault, setRuntimeFault] = useState<RuntimePanelFailure>();
  const launchHash = useLocationHash();
  const processedLaunchHash = useRef<string | undefined>(undefined);
  const nextRuntimeIssueId = useRef(1);
  const [runtimeIssueHistory, setRuntimeIssueHistory] = useState<readonly RuntimeDiagnosticsIssueEntry[]>([]);
  const filePickerState = useRuntimeDocument<FilePickerStateDoc>(runtime.resources, documentUrls.filePickerState);
  const prefersDark = usePrefersDark();
  const theme = resolveTheme(appearance, lightTheme, darkTheme, prefersDark);

  useEffect(() => {
    recordRuntimeBootGateAck(seed, { ack: runtimeConnection.ack, platform: runtimePlatform });
  }, [runtimeConnection.ack, runtimePlatform, seed]);

  const filesystemProjection = useFilesystemTreeProjection(runtime, rootUrl);
  const workspaceProjection = useWorkspaceProjection(runtime);
  const installedApps = useMemo(() => (
    filesystemProjection.status === 'ready'
      ? installedAppsFromFilesystem({
          getDocument: (url) => runtime.resources.getDocument(url),
          root: filesystemProjection.root,
        })
      : []
  ), [filesystemProjection, runtime.resources]);
  const recordRuntimeIssue = (source: RuntimeDiagnosticsIssueEntry['source'], issue: RuntimePanelFailure) => {
    const entry: RuntimeDiagnosticsIssueEntry = {
      id: nextRuntimeIssueId.current++,
      issue,
      observedAt: new Date().toISOString(),
      source,
    };
    setRuntimeIssueHistory((history) => appendRuntimeIssueHistory(history, entry));
  };
  const reportIntentResult = (result: IntentResult): IntentResult => {
    if (result.status === 'committed') setRuntimeFault(undefined);
    else {
      const failure = failureFromIntentResult(result);
      setRuntimeFault(failure);
      recordRuntimeIssue('intent', failure);
    }
    return result;
  };
  const routeUrl = (intent: RouteIntentName, input: RouteIntentInput) => {
    void submitRouteIntent(runtime, intent, input).then(reportIntentResult).catch(reportRuntimeError);
  };
  const windowIntent = (intent: WindowIntentName, input: WindowIntentInput) => {
    return submitWindowIntent(runtime, intent, input).then(reportIntentResult);
  };
  const reportRuntimeError = (error: unknown) => {
    const failure = failureFromUnknownError('Runtime request failed', 'Runtime request failed.', error);
    setRuntimeFault(failure);
    recordRuntimeIssue('runtime', failure);
  };
  const launchApp = (input: AppLaunchIntentInput) => {
    void submitAppLaunchIntent(runtime, input).then(reportIntentResult).catch(reportRuntimeError);
  };
  useEffect(() => {
    const parsed = parseHashLaunchConfig(launchHash);
    if (parsed.status === 'empty') {
      processedLaunchHash.current = undefined;
      return;
    }
    if (processedLaunchHash.current === launchHash) return;

    if (parsed.status === 'invalid') {
      const failure = hashLaunchFailure(parsed.message, parsed.details);
      processedLaunchHash.current = launchHash;
      setRuntimeFault(failure);
      recordRuntimeIssue('runtime', failure);
      return;
    }

    if (filesystemProjection.status !== 'ready' || workspaceProjection.status !== 'ready') return;

    const target = resolveHashLaunchTarget({
      filesystemRoot: filesystemProjection.root,
      getDocument: (url) => runtime.resources.getDocument(url),
      src: parsed.src,
    });
    if (target.status === 'invalid') {
      const failure = hashLaunchFailure(target.message, target.details);
      processedLaunchHash.current = launchHash;
      setRuntimeFault(failure);
      recordRuntimeIssue('runtime', failure);
      return;
    }

    processedLaunchHash.current = launchHash;
    routeUrl(routeOpenIntent, { rootUrl, title: target.title, url: target.url });
  }, [filesystemProjection, launchHash, rootUrl, runtime.resources, workspaceProjection]);
  const windowManagerActions = {
    focusContext: (surfaceId: string, contextId: string) => {
      void windowIntent(windowFocusIntent, { contextId, surfaceId }).catch(reportRuntimeError);
    },
    closeContext: (surfaceId: string, contextId: string) => {
      void windowIntent(windowCloseContextIntent, { contextId, surfaceId }).catch(reportRuntimeError);
    },
    dropContext: (sourceSurfaceId: string, contextId: string, target: ContextDropTarget) => {
      void windowIntent(windowMoveTabIntent, { contextId, sourceSurfaceId, target }).catch(reportRuntimeError);
    },
    dropUrl: (url: string, title: string, target: ContextDropTarget) => {
      routeUrl(routeOpenIntent, { rootUrl, target, title, url });
    },
    pinContext: (surfaceId: string, contextId: string) => {
      void windowIntent(windowPinPreviewIntent, { contextId, surfaceId }).catch(reportRuntimeError);
    },
    resizeSplit: (path: SplitPath, ratio: number) => {
      return windowIntent(windowResizeSplitIntent, { path, ratio })
        .then((result) => result.status === 'committed')
        .catch((error: unknown) => {
          reportRuntimeError(error);
          return false;
        });
    },
  };
  const launchers = launcherItems({
    focusedAppId: workspaceProjection.status === 'ready'
      ? focusedAppId(workspaceProjection.workspace)
      : undefined,
    installedApps,
    launchApp,
  });
  return (
    <main className="standalone-app shell-app" style={themeStyle(theme)}>
      {runtimeFault === undefined ? null : <RuntimeIssueBanner failure={runtimeFault} />}
      {filesystemProjection.status === 'initializing' ? (
        <RuntimeStatusPanel
          title="Filesystem projection initializing"
          message="Waiting for the filesystem.tree snapshot from the runtime."
        />
      ) : filesystemProjection.status === 'failed' ? (
        <RuntimeStatusPanel
          title={filesystemProjection.failure.title}
          message={filesystemProjection.failure.message}
          details={filesystemProjection.failure.details}
        />
      ) : workspaceProjection.status === 'initializing' ? (
        <RuntimeStatusPanel
          title="Workspace projection initializing"
          message="Waiting for the workspace.layout snapshot from the runtime."
        />
      ) : workspaceProjection.status === 'failed' ? (
        <RuntimeStatusPanel
          title={workspaceProjection.failure.title}
          message={workspaceProjection.failure.message}
          details={workspaceProjection.failure.details}
        />
      ) : (
        <>
          <WindowManager
            actions={windowManagerActions}
            appHost={shellAppHost({
              filePicker: {
                fileTypes: filePickerTypes,
                rootUrl,
                runtime,
                state: filePickerState,
              },
              filesystemRoot: filesystemProjection.root,
              installedApps,
              recordSessionEvent: (event) => runtime.diagnostics.recordSessionEvent({
                ...event,
                source: 'sandbox',
              }),
            })}
            workspace={workspaceProjection.workspace}
          />
          {runtimeDiagnosticsEnabled() ? (
            <div className="runtime-diagnostics-dev-overlay">
              <RuntimeDiagnosticsSurface
                runtimeAck={runtimeConnection.ack}
                runtime={runtime}
                runtimeIssue={runtimeFault}
                runtimeIssueHistory={runtimeIssueHistory}
                runtimePlatform={runtimePlatform}
              />
            </div>
          ) : null}
          <LauncherBar items={launchers} onResetSession={onResetSession} />
        </>
      )}
    </main>
  );
}

function shellAppHost({
  filePicker,
  filesystemRoot,
  installedApps,
  recordSessionEvent,
}: {
  readonly filePicker: {
    readonly fileTypes: SandboxFilePickerHostScope['fileTypes'];
    readonly rootUrl: string;
    readonly runtime: SandboxFilePickerHostScope['runtime'];
    readonly state: FilePickerStateDoc;
  };
  readonly filesystemRoot: FilesystemNode;
  readonly installedApps: readonly InstalledApp[];
  readonly recordSessionEvent: (event: Omit<BootstrapSessionEventInput, 'source'>) => void;
}): WindowManagerAppHost {
  const appsById = new Map(installedApps.map((app) => [app.manifest.id, app]));
  return {
    acceptsDroppedUrl(event) {
      return event.dataTransfer.types.includes(filePickerDragType);
    },

    contextLabel(context) {
      return nodePath(filesystemRoot, context.url) ?? context.title ?? appsById.get(context.app)?.manifest.name;
    },

    contextTooltip(context) {
      return contextLaunchUrl(filesystemRoot, appsById.get(context.app), context);
    },

    droppedUrl(event) {
      return filePickerDroppedUrl(event);
    },

    renderSurface({ context, surfaceId }) {
      if (context === undefined) return <SurfaceNotice message="No active app session." />;
      const installedApp = appsById.get(context.app);
      if (installedApp === undefined) {
        return (
          <SurfaceNotice
            message={`No installed app manifest was found for ${context.app}.`}
            role="alert"
            title="App not installed"
          />
        );
      }

      return (
        <SandboxedFilesystemApp
          app={installedApp}
          context={context}
          filePicker={{
            fileTypes: filePicker.fileTypes,
            rootUrl: filePicker.rootUrl,
            runtime: filePicker.runtime,
            state: filePicker.state,
          }}
          filesystemRoot={filesystemRoot}
          onSessionEvent={(event) => recordSessionEvent({ ...event, surfaceId })}
          surfaceId={surfaceId}
        />
      );
    },
  };
}

function contextLaunchUrl(
  filesystemRoot: FilesystemNode,
  app: InstalledApp | undefined,
  context: { readonly url: string },
): string | undefined {
  const entryPath = app?.entry === undefined ? undefined : nodePath(filesystemRoot, app.entry.url);
  if (entryPath === undefined) return undefined;
  const src = nodePath(filesystemRoot, context.url) ?? context.url;
  return `${entryPath}#${JSON.stringify({ src })}`;
}

function SurfaceNotice({
  message,
  role = 'status',
  title,
}: {
  readonly message: string;
  readonly role?: 'alert' | 'status';
  readonly title?: string;
}) {
  return (
    <section className="window-manager-empty-state" role={role}>
      {title === undefined ? message : (
        <>
          <strong>{title}</strong>
          <span>{message}</span>
        </>
      )}
    </section>
  );
}

function filePickerDroppedUrl(event: DragEvent): WindowManagerDroppedUrl | undefined {
  const data = dragDataFromEvent(event, filePickerDragType);
  return isDraggedFilePickerUrl(data) ? data : undefined;
}

function resolveHashLaunchTarget({
  filesystemRoot,
  getDocument,
  src,
}: {
  readonly filesystemRoot: FilesystemNode;
  readonly getDocument: (url: string) => unknown;
  readonly src: string;
}): HashLaunchTarget {
  if (isAutomergeUrl(src)) {
    if (getDocument(src) === undefined) {
      return invalidHashLaunchTarget(`Hash launch src ${src} is not an existing Automerge document.`);
    }
    return {
      status: 'resolved',
      title: nodePath(filesystemRoot, src) ?? src,
      url: src,
    };
  }

  if (!src.startsWith('/')) {
    return invalidHashLaunchTarget('Hash launch src must be an Automerge URL or an absolute filesystem path.');
  }

  const node = filesystemNodeAtPath(filesystemRoot, src);
  if (node === undefined) return invalidHashLaunchTarget(`Hash launch path ${src} was not found.`);

  return {
    status: 'resolved',
    title: src,
    url: node.url,
  };
}

function filesystemNodeAtPath(root: FilesystemNode, path: string): FilesystemNode | undefined {
  if (path === '/') return root;
  const parts = path.split('/').filter((part) => part !== '');
  if (parts.some((part) => part === '.' || part === '..')) return undefined;

  let current: FilesystemNode | undefined = root;
  for (const part of parts) {
    if (current?.kind !== 'folder') return undefined;
    current = current.entries.find((entry) => entry.name === part);
  }
  return current;
}

function isAutomergeUrl(value: string): boolean {
  return value.startsWith('automerge:');
}

type HashLaunchTarget =
  | { readonly status: 'invalid'; readonly message: string; readonly details: readonly string[] }
  | { readonly status: 'resolved'; readonly title: string; readonly url: string };

function invalidHashLaunchTarget(message: string): HashLaunchTarget {
  return {
    status: 'invalid',
    message,
    details: ['source: location.hash'],
  };
}

function hashLaunchFailure(message: string, details: readonly string[]): RuntimePanelFailure {
  return {
    title: 'Hash launch failed',
    message,
    details,
  };
}

function useLocationHash(): string {
  return useSyncExternalStore(
    (update) => {
      window.addEventListener('hashchange', update);
      return () => window.removeEventListener('hashchange', update);
    },
    () => window.location.hash,
  );
}

function runtimeDiagnosticsEnabled(): boolean {
  return new URLSearchParams(window.location.search).has('runtimeDiagnostics');
}

function dragDataFromEvent(event: DragEvent, type: string): unknown {
  const serializedDragData = event.dataTransfer.getData(type);
  if (serializedDragData === '') return undefined;
  try {
    return JSON.parse(serializedDragData);
  } catch {
    return undefined;
  }
}

function isDraggedFilePickerUrl(data: unknown): data is DraggedFilePickerUrl {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Partial<Record<keyof DraggedFilePickerUrl, unknown>>;
  return typeof candidate.title === 'string' && typeof candidate.url === 'string';
}

function normalizedFileTypes(doc: FileTypesDoc): readonly Pick<FileType, 'emoji' | 'match'>[] {
  return Array.isArray(doc.fileTypes)
    ? doc.fileTypes.filter(isFileType).map((fileType) => ({ emoji: fileType.emoji, match: fileType.match }))
    : [];
}

function isFileType(value: unknown): value is FileType {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Partial<FileType>).emoji === 'string'
    && typeof (value as Partial<FileType>).match === 'string'
  );
}

const filePickerDragType = 'application/x.patchpit-file';

type DraggedFilePickerUrl = {
  readonly title: string;
  readonly url: string;
};

const runtimeIssueHistoryLimit = 50;

function appendRuntimeIssueHistory(
  history: readonly RuntimeDiagnosticsIssueEntry[],
  entry: RuntimeDiagnosticsIssueEntry,
): readonly RuntimeDiagnosticsIssueEntry[] {
  const next = [...history, entry];
  return next.length > runtimeIssueHistoryLimit ? next.slice(next.length - runtimeIssueHistoryLimit) : next;
}

type RuntimeBootState =
  | { readonly status: 'connecting' }
  | { readonly status: 'failed'; readonly failure: RuntimePanelFailure }
  | { readonly status: 'ready'; readonly connection: RuntimeBootGateConnection }
  | { readonly status: 'unsupported'; readonly failure: RuntimePanelFailure };

function useRuntimeBootGate(platform: RuntimePlatformReport): RuntimeBootState {
  const [boot, setBoot] = useState<RuntimeBootState>(() => (
    platform.ok
      ? { status: 'connecting' }
      : { status: 'unsupported', failure: unsupportedRuntimePlatformFailure(platform) }
  ));

  useEffect(() => {
    if (!platform.ok) return;

    let closed = false;
    let connection: RuntimeBootGateConnection | undefined;
    void connectRuntimeBootGate({
      buildId: patchpitRuntimeBuildId,
      clientId: `shell:${crypto.randomUUID()}`,
      clientKind: 'tab',
      createWorker: createRuntimeBootGateWorker,
      workspaceId: 'default',
    }).then((nextConnection) => {
      if (closed) {
        nextConnection.close();
        return;
      }
      connection = nextConnection;
      setBoot({ status: 'ready', connection: nextConnection });
    }).catch((error: unknown) => {
      if (!closed) setBoot({ status: 'failed', failure: runtimeBootFailure(error) });
    });

    import.meta.hot?.dispose(() => {
      connection?.close('dev-reload');
    });

    return () => {
      closed = true;
      connection?.close();
    };
  }, [platform]);

  return boot;
}

function RuntimeBooting({ platform }: { readonly platform: RuntimePlatformReport }) {
  return (
    <main className="standalone-app shell-app">
      <RuntimeStatusPanel
        title="Runtime boot gate initializing"
        message="Connecting to the SharedWorker boot gate."
        details={platformDetails(platform)}
      />
    </main>
  );
}

function RuntimeUnavailable({
  failure,
  platform,
}: {
  readonly failure: RuntimePanelFailure;
  readonly platform: RuntimePlatformReport;
}) {
  return (
    <main className="standalone-app shell-app">
      <RuntimeStatusPanel
        title={failure.title}
        message={failure.message}
        details={uniqueDetails([...failure.details, ...platformDetails(platform)])}
      />
    </main>
  );
}

type RuntimePanelFailure = {
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
};

function RuntimeStatusPanel({
  details = [],
  message,
  title,
}: {
  readonly details?: readonly string[];
  readonly message: string;
  readonly title: string;
}) {
  return (
    <section className="runtime-status-panel" aria-live="polite">
      <div className="runtime-status-content">
        <h1>{title}</h1>
        <p>{message}</p>
        <RuntimeDetails details={details} />
      </div>
    </section>
  );
}

function RuntimeIssueBanner({ failure }: { readonly failure: RuntimePanelFailure }) {
  return (
    <aside className="runtime-issue-banner" role="alert">
      <strong>{failure.title}</strong>
      <span>{failure.message}</span>
      <RuntimeDetails details={failure.details} />
    </aside>
  );
}

function RuntimeDetails({ details }: { readonly details: readonly string[] }) {
  return details.length === 0 ? null : (
    <details>
      <summary>Details</summary>
      <ul>
        {details.map((detail) => <li key={detail}>{detail}</li>)}
      </ul>
    </details>
  );
}

function createRuntimeBootGateWorker({ attempt, buildId, name }: RuntimeBootGateFactoryOptions): SharedWorker {
  const url = new URL(runtimeSharedWorkerUrl, import.meta.url);
  if (attempt === 'stale-build-retry') {
    url.searchParams.set('patchpit-runtime-retry', buildId);
    url.searchParams.set('patchpit-runtime-retry-at', Date.now().toString(36));
  }

  return new SharedWorker(url, { name, type: 'module' });
}

function runtimeBootFailure(error: unknown): RuntimePanelFailure {
  if (error instanceof RuntimeBootGateConnectError) {
    return failureFromRuntimeError(error.runtimeError, 'Runtime unavailable');
  }
  return failureFromUnknownError('Runtime unavailable', 'Runtime boot gate connection failed.', error);
}

function failureFromIntentResult(result: IntentResult): RuntimePanelFailure {
  if (result.status === 'rejected') return failureFromRuntimeError(result.error, 'Runtime request rejected');
  if (result.status === 'conflict') {
    return result.error === undefined
      ? {
          title: 'Runtime request conflict',
          message: 'Runtime request conflicted with current state.',
          details: ['status: conflict'],
        }
      : failureFromRuntimeError(result.error, 'Runtime request conflict');
  }
  if (result.status === 'queued') {
    return {
      title: 'Runtime admission queued',
      message: 'Runtime admission queued this request; it has not committed yet.',
      details: ['status: queued', `ticket: ${result.ticket}`],
    };
  }
  if (result.status === 'quarantined') {
    return {
      title: 'Request quarantined by policy',
      message: 'Runtime admission quarantined this request.',
      details: ['status: quarantined', `reason: ${result.reason}`],
    };
  }
  return {
    title: 'Runtime request committed',
    message: 'Runtime request completed.',
    details: ['status: committed', ...policyDetails(result.policy)],
  };
}

function failureFromRuntimeError(error: RuntimeError, fallbackTitle = 'Runtime request failed'): RuntimePanelFailure {
  return {
    title: runtimeErrorTitle(error, fallbackTitle),
    message: error.message,
    details: [
      `code: ${error.code}`,
      ...(error.reason === undefined ? [] : [`reason: ${error.reason}`]),
      ...metadataDetails(error.metadata),
    ],
  };
}

function failureFromUnknownError(title: string, fallbackMessage: string, error: unknown): RuntimePanelFailure {
  return {
    title,
    message: error instanceof Error ? error.message : fallbackMessage,
    details: detailFromUnknown(error),
  };
}

function unsupportedRuntimePlatformFailure(platform: RuntimePlatformReport): RuntimePanelFailure {
  const missing = platform.missing.map(runtimePlatformFeatureLabel);
  return {
    title: platform.missing.includes('sharedWorker') ? 'SharedWorker unsupported' : 'Unsupported runtime API',
    message: missing.length === 0
      ? 'The runtime platform probe did not pass.'
      : `The shell cannot boot without ${formatFeatureList(missing)}.`,
    details: platform.missing.map((feature) => `missing required API: ${runtimePlatformFeatureLabel(feature)}`),
  };
}

function runtimeErrorTitle(error: RuntimeError, fallbackTitle: string): string {
  if (error.code === 'runtime_unavailable') return runtimeUnavailableTitle(error.reason);
  return runtimeErrorTitles[error.code] ?? fallbackTitle;
}

function runtimeUnavailableTitle(reason: RuntimeError['reason']): string {
  return reason === undefined ? 'Runtime unavailable' : runtimeUnavailableTitles[reason] ?? 'Runtime unavailable';
}

const runtimeErrorTitles = {
  bad_request: 'Runtime request invalid',
  commit_error: 'Runtime commit failed',
  conflict: 'Runtime request conflict',
  internal_error: 'Runtime internal error',
  missing_handler: 'Runtime handler unavailable',
  not_found: 'Runtime target not found',
  policy_denied: 'Request denied by policy',
  policy_quarantined: 'Request quarantined by policy',
  schema_mismatch: 'Runtime schema mismatch',
  stale_target: 'Runtime target changed',
  unknown_capability: 'Capability unavailable',
  unknown_intent: 'Intent unavailable',
  unknown_projection: 'Projection unavailable',
  unsupported_basis: 'Projection basis unavailable',
  unsupported_platform: 'Unsupported runtime platform',
  unsupported_protocol: 'Runtime protocol unsupported',
} as const satisfies Partial<Record<RuntimeError['code'], string>>;

const runtimeUnavailableTitles: Readonly<Record<string, string>> = {
  'handshake-error': 'Runtime boot gate handshake failed',
  'handshake-message-error': 'Runtime boot gate handshake failed',
  'handshake-mismatch': 'Runtime boot gate handshake failed',
  'handshake-protocol-error': 'Runtime boot gate handshake failed',
  'handshake-timeout': 'Runtime boot gate timed out',
  'shared-worker-api-unavailable': 'SharedWorker unsupported',
  'shared-worker-create-failed': 'SharedWorker boot gate start failed',
  'stale-build': 'Runtime build mismatch',
  'worker-connect-error': 'Runtime boot gate connection failed',
};

function platformDetails(platform: RuntimePlatformReport): readonly string[] {
  return [
    `missing required boot APIs: ${formatFeatureList(platform.missing.map(runtimePlatformFeatureLabel))}`,
    `missing target shared-runtime APIs: ${formatFeatureList(platform.plannedMissing.map(runtimePlatformFeatureLabel))}`,
  ];
}

function policyDetails(policy: AppliedPolicyEffects | undefined): readonly string[] {
  if (policy === undefined) return [];
  return [
    ...(policy.transformed === undefined ? [] : [`policy transformed: ${String(policy.transformed)}`]),
    ...(policy.reason === undefined ? [] : [`policy reason: ${policy.reason}`]),
    ...(policy.obligations === undefined ? [] : [`policy obligations: ${JSON.stringify(policy.obligations)}`]),
  ];
}

function uniqueDetails(details: readonly string[]): readonly string[] {
  return [...new Set(details)];
}

function formatFeatureList(features: readonly string[]): string {
  return features.length === 0 ? 'none' : features.join(', ');
}

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (update) => {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}
