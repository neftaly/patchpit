import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from 'react';
import {
  FilePicker,
  filePickerDragType,
  fileIcons,
  type DraggedFilePickerUrl,
  type FileIcons,
  type FilePickerActions,
} from '@patchpit/file-picker';
import {
  TerminalAppSurface,
  terminalAppContextLabel,
  terminalFilesystemCapabilityProvider,
  terminalAppInstanceStateHandler,
  terminalAppSessions,
  terminalAppStateHandles,
  useTerminalAppRuntime,
  type TerminalAppSession,
} from '@patchpit/terminal';
import { Viewer } from '@patchpit/viewer';
import {
  containerRootUrl,
  createSeedFilesystem,
  createTerminalStateResource,
  findNode,
  nodePath,
  recordRuntimeBootGateAck,
  resolveTheme,
  themeStyle,
  type AppearanceDoc,
  type FilePickerStateDoc,
  type FileTypesDoc,
  type FilesystemNode,
  type RuntimeStateDoc,
  type ThemeDoc,
} from '@patchpit/system';
import {
  connectRuntimeBootGate,
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  probeRuntimePlatform,
  routeOpenIntent,
  routePreviewIntent,
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
import { SandboxedFilesystemApp } from './app-host/SandboxedFilesystemApp';
import { createBootstrapRuntimeClient } from './runtime/bootstrap-runtime';
import { patchpitRuntimeBuildId } from './runtime/build-id';
import { detailFromUnknown, metadataDetails } from './runtime/runtime-error-details';
import runtimeSharedWorkerUrl from './runtime/shared-worker.ts?sharedworker&url';
import { submitFilePickerIntent, type FilePickerSelectUrlInput } from './runtime/file-picker-intents';
import { submitAppLaunchIntent, type AppLaunchIntentInput } from './runtime/launch-intents';
import { submitRouteIntent, type RouteIntentInput, type RouteIntentName } from './runtime/route-intents';
import { type StateBrowserRuntimeIssueEntry } from './state-browser/StateBrowser';
import { StateBrowserSurface } from './state-browser/StateBrowserSurface';
import { useAutomergeDocs, useRuntimeDocument } from './runtime/use-automerge-doc';
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
  const nextTerminalId = useRef(2);
  const [runtime] = useState(() => createBootstrapRuntimeClient({
    appInstanceStateHandlers: [
      terminalAppInstanceStateHandler(() => {
        const handle = createTerminalStateResource(seed, `terminal-${nextTerminalId.current}`);
        nextTerminalId.current += 1;
        return handle;
      }),
    ],
    capabilityProviders: [
      terminalFilesystemCapabilityProvider(seed),
    ],
    seed,
    workspaceId: 'default',
  }));
  const { documentUrls, rootUrl } = runtime.resources;
  const appearance = useRuntimeDocument<AppearanceDoc>(runtime.resources, documentUrls.appearance);
  const darkTheme = useRuntimeDocument<ThemeDoc>(runtime.resources, documentUrls.darkTheme);
  const fileTypes = useRuntimeDocument<FileTypesDoc>(runtime.resources, documentUrls.fileTypes);
  const iconRules = useMemo(() => fileIcons(fileTypes), [fileTypes]);
  const lightTheme = useRuntimeDocument<ThemeDoc>(runtime.resources, documentUrls.lightTheme);
  const [runtimeFault, setRuntimeFault] = useState<RuntimePanelFailure>();
  const nextRuntimeIssueId = useRef(1);
  const [runtimeIssueHistory, setRuntimeIssueHistory] = useState<readonly StateBrowserRuntimeIssueEntry[]>([]);
  const filePickerState = useRuntimeDocument<FilePickerStateDoc>(runtime.resources, documentUrls.filePickerState);
  const runtimeState = useRuntimeDocument<RuntimeStateDoc>(runtime.resources, documentUrls.runtimeState);
  const terminalHandles = useMemo(() => terminalAppStateHandles(seed, runtimeState), [seed, runtimeState]);
  const terminalStates = useAutomergeDocs(terminalHandles);
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
  const recordRuntimeIssue = (source: StateBrowserRuntimeIssueEntry['source'], issue: RuntimePanelFailure) => {
    const entry: StateBrowserRuntimeIssueEntry = {
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
  const terminalRuntime = useTerminalAppRuntime(runtime, (issue) => {
    setRuntimeFault(issue);
    recordRuntimeIssue('capability', issue);
  }, {
    enabled: terminalHandles.length > 0,
  });
  const launchApp = (input: AppLaunchIntentInput) => {
    void submitAppLaunchIntent(runtime, input).then(reportIntentResult).catch(reportRuntimeError);
  };
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
  const filePickerActions = (sourceSurfaceId: string) => ({
    openUrl: (url: string, title: string) => {
      routeUrl(routeOpenIntent, { rootUrl, sourceSurfaceId, title, url });
    },
    previewUrl: (url: string, title: string) => {
      routeUrl(routePreviewIntent, { rootUrl, sourceSurfaceId, title, url });
    },
    selectUrl: (
      url: string,
      options?: FilePickerSelectUrlInput['options'],
    ) => {
      const input = options === undefined ? { url } : { options, url };
      void submitFilePickerIntent(runtime, filePickerSelectUrlIntent, input)
        .then(reportIntentResult)
        .catch(reportRuntimeError);
    },
    toggleFolder: (url: string) => {
      void submitFilePickerIntent(runtime, filePickerToggleFolderIntent, { url })
        .then(reportIntentResult)
        .catch(reportRuntimeError);
    },
  });
  const terminalSessions = terminalAppSessions({
    handles: terminalHandles,
    runtime: terminalRuntime,
    states: terminalStates,
  });
  const launchers = launcherItems({
    focusedAppId: workspaceProjection.status === 'ready'
      ? focusedAppId(workspaceProjection.workspace)
      : undefined,
    filePickerStateUrl: documentUrls.filePickerState,
    installedApps,
    launchApp,
    rootUrl,
    runtimeStateUrl: documentUrls.runtimeState,
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
                actions: filePickerActions,
                fileIcons: iconRules,
                state: filePickerState,
                url: documentUrls.filePickerState,
              },
              filesystemRoot: filesystemProjection.root,
              installedApps,
              stateBrowser: (
                <StateBrowserSurface
                  filesystemProjection={filesystemProjection}
                  runtimeAck={runtimeConnection.ack}
                  runtime={runtime}
                  runtimeIssue={runtimeFault}
                  runtimeIssueHistory={runtimeIssueHistory}
                  runtimePlatform={runtimePlatform}
                  runtimeState={runtimeState}
                  workspaceProjection={workspaceProjection}
                />
              ),
              terminalSessions,
              theme,
            })}
            workspace={workspaceProjection.workspace}
          />
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
  stateBrowser,
  terminalSessions,
  theme,
}: {
  readonly filePicker: {
    readonly actions: (surfaceId: string) => FilePickerActions;
    readonly fileIcons: FileIcons;
    readonly state: FilePickerStateDoc;
    readonly url: string;
  };
  readonly filesystemRoot: FilesystemNode;
  readonly installedApps: readonly InstalledApp[];
  readonly stateBrowser: ReactNode;
  readonly terminalSessions: Readonly<Record<string, TerminalAppSession>>;
  readonly theme: ThemeDoc;
}): WindowManagerAppHost {
  const appsById = new Map(installedApps.map((app) => [app.manifest.id, app]));
  return {
    acceptsDroppedUrl(event) {
      return event.dataTransfer.types.includes(filePickerDragType);
    },

    contextLabel(context) {
      if (context.app === 'terminal') return terminalAppContextLabel(terminalSessions[context.url]);
      if (context.app === 'state-browser') return context.title ?? 'State Browser';
      return nodePath(filesystemRoot, context.url) ?? context.title ?? appsById.get(context.app)?.manifest.name;
    },

    droppedUrl(event) {
      return filePickerDroppedUrl(event);
    },

    renderSurface({ context, surfaceId }) {
      if (context === undefined) return <Viewer filesystemRoot={filesystemRoot} url={undefined} />;
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

      if (context.app === 'file-picker') {
        if (context.url !== filePicker.url) {
          return (
            <SurfaceNotice
              message="The file picker context no longer targets the active file picker state."
              role="alert"
              title="File picker state mismatch"
            />
          );
        }
        const rootUrl = containerRootUrl(context.container) ?? filePicker.state.rootUrl;
        const root = findNode(filesystemRoot, rootUrl);
        return root === null
          ? (
              <SurfaceNotice
                message="The mounted root is no longer available in the filesystem projection."
                role="alert"
                title="File picker root missing"
              />
            )
          : (
              <FilePicker
                actions={filePicker.actions(surfaceId)}
                fileIcons={filePicker.fileIcons}
                root={root}
                state={filePicker.state}
              />
            );
      }

      if (context.app === 'terminal') {
        return (
          <TerminalAppSurface
            context={context}
            sessions={terminalSessions}
            theme={theme}
          />
        );
      }

      if (context.app === 'state-browser') return stateBrowser;

      if (context.app === 'viewer') return <Viewer filesystemRoot={filesystemRoot} url={context.url} />;

      return <SandboxedFilesystemApp app={installedApp} context={context} surfaceId={surfaceId} />;
    },
  };
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

const runtimeIssueHistoryLimit = 50;

function appendRuntimeIssueHistory(
  history: readonly StateBrowserRuntimeIssueEntry[],
  entry: StateBrowserRuntimeIssueEntry,
): readonly StateBrowserRuntimeIssueEntry[] {
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
