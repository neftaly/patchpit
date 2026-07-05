import type { DocHandle } from '@automerge/automerge-repo';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { fileIcons } from '@patchpit/file-picker';
import {
  createTerminalStateResource,
  createSeedFilesystem,
  recordRuntimeBootGateAck,
  resolveTheme,
  themeStyle,
  type TerminalStateDoc,
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
import { createBootstrapRuntimeClient } from './runtime/bootstrap-runtime';
import { patchpitRuntimeBuildId } from './runtime/build-id';
import runtimeSharedWorkerUrl from './runtime/shared-worker.ts?sharedworker&url';
import { submitFilePickerIntent, type FilePickerSelectUrlInput } from './runtime/file-picker-intents';
import { submitAppLaunchIntent, type AppLaunchIntentInput } from './runtime/launch-intents';
import { submitRouteIntent, type RouteIntentInput, type RouteIntentName } from './runtime/route-intents';
import { createStateBrowserSnapshot } from './state-browser/StateBrowser';
import { useFilesystemTreeProjection } from './runtime/use-runtime-projection';
import { submitWindowIntent, type WindowIntentInput, type WindowIntentName } from './runtime/window-intents';
import { WindowManager } from './window-manager/WindowManager';
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
  const [terminalHandles, setTerminalHandles] = useState<readonly DocHandle<TerminalStateDoc>[]>([]);
  const [runtime] = useState(() => createBootstrapRuntimeClient({
    createTerminalState: () => {
      const handle = createTerminalStateResource(seed, `terminal-${nextTerminalId.current}`);
      nextTerminalId.current += 1;
      setTerminalHandles((handles) => [...handles, handle]);
      return handle;
    },
    seed,
    workspaceId: 'default',
  }));
  const appearance = useAutomergeDoc(seed.appearanceHandle);
  const darkTheme = useAutomergeDoc(seed.darkThemeHandle);
  const fileTypes = useAutomergeDoc(seed.fileTypesHandle);
  const iconRules = useMemo(() => fileIcons(fileTypes), [fileTypes]);
  const lightTheme = useAutomergeDoc(seed.lightThemeHandle);
  const [runtimeFault, setRuntimeFault] = useState<RuntimePanelFailure>();
  const filePickerState = useAutomergeDoc(seed.filePickerStateHandle);
  const terminalState = useAutomergeDoc(seed.terminalStateHandle);
  const terminalStates = useAutomergeDocs(terminalHandles);
  const runtimeState = useAutomergeDoc(seed.runtimeStateHandle);
  const windowManagerState = useAutomergeDoc(seed.windowManagerHandle);
  const prefersDark = usePrefersDark();
  const theme = resolveTheme(appearance, lightTheme, darkTheme, prefersDark);

  useEffect(() => {
    recordRuntimeBootGateAck(seed, { ack: runtimeConnection.ack, platform: runtimePlatform });
  }, [runtimeConnection.ack, runtimePlatform, seed]);

  const liveDocuments = {
    [seed.appearanceHandle.url]: appearance,
    [seed.darkThemeHandle.url]: darkTheme,
    [seed.fileTypesHandle.url]: fileTypes,
    [seed.filePickerStateHandle.url]: filePickerState,
    [seed.lightThemeHandle.url]: lightTheme,
    [seed.runtimeStateHandle.url]: runtimeState,
    [seed.terminalStateHandle.url]: terminalState,
    [seed.windowManagerHandle.url]: windowManagerState,
    ...terminalStates,
  };
  const filesystemProjection = useFilesystemTreeProjection(runtime, seed.rootUrl);
  const stateBrowserSnapshot = createStateBrowserSnapshot({
    filesystemProjection,
    runtimeAck: runtimeConnection.ack,
    runtimeIssue: runtimeFault,
    runtimePlatform,
    runtimeState,
    schemaDocuments: liveDocuments,
    windowManagerState,
  });
  const reportIntentResult = (result: IntentResult): IntentResult => {
    if (result.status === 'committed') setRuntimeFault(undefined);
    else setRuntimeFault(failureFromIntentResult(result));
    return result;
  };
  const routeUrl = (intent: RouteIntentName, input: RouteIntentInput) => {
    void submitRouteIntent(runtime, intent, input).then(reportIntentResult).catch(reportRuntimeError);
  };
  const windowIntent = (intent: WindowIntentName, input: WindowIntentInput) => {
    return submitWindowIntent(runtime, intent, input).then(reportIntentResult);
  };
  const reportRuntimeError = (error: unknown) => {
    setRuntimeFault(failureFromUnknownError('Runtime request failed', 'Runtime request failed.', error));
  };
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
      routeUrl(routeOpenIntent, { rootUrl: seed.rootUrl, target, title, url });
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
      routeUrl(routeOpenIntent, { rootUrl: seed.rootUrl, sourceSurfaceId, title, url });
    },
    previewUrl: (url: string, title: string) => {
      routeUrl(routePreviewIntent, { rootUrl: seed.rootUrl, sourceSurfaceId, title, url });
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
  const filePickers = {
    [seed.filePickerStateHandle.url]: {
      actions: filePickerActions,
      fileIcons: iconRules,
      state: filePickerState,
    },
  };
  const terminalRuntimeOptions = {
    documentHandles: seed.documentHandles,
    indexHandle: seed.indexHandle,
    repo: seed.repo,
    rootUrl: seed.rootUrl,
  };
  const terminals = Object.fromEntries(terminalHandles.map((handle) => [
    handle.url,
    {
      runtimeOptions: terminalRuntimeOptions,
      state: terminalStates[handle.url] ?? handle.doc(),
      stateHandle: handle,
    },
  ]));
  const launchers = launcherItems({
    focusedAppId: focusedAppId(windowManagerState),
    filePickerStateHandle: seed.filePickerStateHandle,
    launchApp,
    rootUrl: seed.rootUrl,
    runtimeStateHandle: seed.runtimeStateHandle,
  });
  return (
    <main className="standalone-app shell-app" style={themeStyle(theme)}>
      {runtimeFault === undefined ? null : <RuntimeIssueBanner failure={runtimeFault} />}
      {filesystemProjection.status === 'initializing' ? (
        <RuntimeStatusPanel
          title="Projection initializing"
          message="Waiting for the filesystem.tree snapshot from the runtime."
        />
      ) : filesystemProjection.status === 'failed' ? (
        <RuntimeStatusPanel
          title={filesystemProjection.failure.title}
          message={filesystemProjection.failure.message}
          details={filesystemProjection.failure.details}
        />
      ) : (
        <>
          <WindowManager
            actions={windowManagerActions}
            filePickers={filePickers}
            filesystemRoot={filesystemProjection.root}
            liveDocuments={liveDocuments}
            state={windowManagerState}
            stateBrowser={stateBrowserSnapshot}
            terminals={terminals}
            theme={theme}
          />
          <LauncherBar items={launchers} onResetSession={onResetSession} />
        </>
      )}
    </main>
  );
}

function useAutomergeDoc<T>(handle: DocHandle<T>): T {
  return useSyncExternalStore(
    (update) => {
      handle.on('change', update);
      return () => handle.off('change', update);
    },
    () => handle.doc(),
  );
}

function useAutomergeDocs<T>(handles: readonly DocHandle<T>[]): Readonly<Record<string, T>> {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const update = () => setVersion((current) => current + 1);
    for (const handle of handles) handle.on('change', update);
    return () => {
      for (const handle of handles) handle.off('change', update);
    };
  }, [handles]);

  return Object.fromEntries(handles.map((handle) => [handle.url, handle.doc()]));
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
        {details.length === 0 ? null : (
          <details>
            <summary>Details</summary>
            <ul>
              {details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function RuntimeIssueBanner({ failure }: { readonly failure: RuntimePanelFailure }) {
  return (
    <aside className="runtime-issue-banner" role="alert">
      <strong>{failure.title}</strong>
      <span>{failure.message}</span>
      {failure.details.length === 0 ? null : (
        <details>
          <summary>Details</summary>
          <ul>
            {failure.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        </details>
      )}
    </aside>
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
  if (error.code === 'unsupported_platform') return 'Unsupported runtime platform';
  if (error.code === 'unsupported_protocol') return 'Runtime protocol unsupported';
  if (error.code === 'unknown_projection') return 'Projection unavailable';
  if (error.code === 'schema_mismatch') return 'Runtime schema mismatch';
  if (error.code === 'unsupported_basis') return 'Projection basis unavailable';
  if (error.code === 'policy_denied') return 'Request denied by policy';
  if (error.code === 'policy_quarantined') return 'Request quarantined by policy';
  if (error.code === 'unknown_intent') return 'Intent unavailable';
  if (error.code === 'unknown_capability') return 'Capability unavailable';
  if (error.code === 'missing_handler') return 'Runtime handler unavailable';
  if (error.code === 'stale_target') return 'Runtime target changed';
  if (error.code === 'commit_error') return 'Runtime commit failed';
  if (error.code === 'conflict') return 'Runtime request conflict';
  if (error.code === 'not_found') return 'Runtime target not found';
  if (error.code === 'bad_request') return 'Runtime request invalid';
  if (error.code === 'internal_error') return 'Runtime internal error';
  return fallbackTitle;
}

function runtimeUnavailableTitle(reason: RuntimeError['reason']): string {
  if (reason === 'shared-worker-api-unavailable') return 'SharedWorker unsupported';
  if (reason === 'shared-worker-create-failed') return 'SharedWorker boot gate start failed';
  if (reason === 'stale-build') return 'Runtime build mismatch';
  if (reason === 'handshake-timeout') return 'Runtime boot gate timed out';
  if (
    reason === 'handshake-error'
    || reason === 'handshake-message-error'
    || reason === 'handshake-mismatch'
    || reason === 'handshake-protocol-error'
  ) {
    return 'Runtime boot gate handshake failed';
  }
  if (reason === 'worker-connect-error') return 'Runtime boot gate connection failed';
  return 'Runtime unavailable';
}

function detailFromUnknown(value: unknown): readonly string[] {
  if (value === undefined || value instanceof Error) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return [String(value)];
  }
  try {
    const json = JSON.stringify(value);
    return json === undefined ? [] : [json];
  } catch {
    return [Object.prototype.toString.call(value)];
  }
}

function metadataDetails(metadata: RuntimeError['metadata']): readonly string[] {
  if (metadata === undefined) return [];
  return Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
}

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
