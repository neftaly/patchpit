import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FilesystemNode } from '@patchpit/system';
import { createSandboxPackageLoadPlan, type SandboxFilesystemAppEntry } from './sandbox-package-loader';
import {
  createSandboxAppServiceBridge,
  sandboxAppProtocol,
  sandboxFrameMessage,
  type SandboxAppProtocol,
  type SandboxFilePickerServiceScope,
  type SandboxAppReportedError,
  type SandboxAppServiceRequest,
  type SandboxAppServiceCapabilities,
  type SandboxHostToFrameMessage,
  type SandboxAppSession,
} from './sandbox-service-bridge';
import './sandbox-app-host.css';

export { sandboxAppProtocol };
export type { SandboxAppProtocol, SandboxAppReportedError, SandboxAppSession };

export type SandboxAppHostProps = {
  readonly appId: string;
  readonly entry: SandboxFilesystemAppEntry | undefined;
  readonly filePicker?: SandboxFilePickerServiceScope | undefined;
  readonly onSessionEvent?: ((event: SandboxAppHostSessionEvent) => void) | undefined;
  readonly resourceRoot?: FilesystemNode | undefined;
  readonly session: SandboxAppSession;
  readonly title?: string;
};

export type SandboxAppHostSessionEvent = {
  readonly appId: string;
  readonly contextId: string;
  readonly data?: unknown;
  readonly error?: string;
  readonly kind: string;
  readonly requestId?: string;
  readonly service?: SandboxAppServiceRequest['service'];
  readonly sessionUrl: string;
  readonly status?: string;
};

type SandboxStatus =
  | { readonly kind: 'starting' }
  | { readonly kind: 'running' }
  | {
      readonly kind: 'error';
      readonly diagnosticsRecorded: boolean;
      readonly error: SandboxAppReportedError;
    };

export function SandboxAppHost({
  appId,
  entry,
  filePicker,
  onSessionEvent,
  resourceRoot,
  session,
  title = `${appId} sandbox`,
}: SandboxAppHostProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loadPlan = useMemo(() => (
    entry === undefined ? undefined : createSandboxPackageLoadPlan(entry)
  ), [entry]);
  const serviceBridge = useMemo(() => (
    createSandboxAppServiceBridge({ appId, filePicker, resourceRoot, session })
  ), [appId, filePicker, resourceRoot, session.app, session.delegation, session.id, session.url]);
  const serviceCapabilities = useMemo(() => serviceBridge.capabilities, [
    serviceBridge.capabilities.act,
    serviceBridge.capabilities.open,
    serviceBridge.capabilities.view,
  ]);
  const onSessionEventRef = useRef(onSessionEvent);
  const srcDoc = useMemo(() => (
    loadPlan === undefined || loadPlan.kind === 'error'
      ? undefined
      : sandboxSrcDoc({
          appId,
          capabilities: serviceCapabilities,
          loadPlan,
          protocol: sandboxAppProtocol,
          session,
        })
  ), [appId, loadPlan, serviceCapabilities, session.app, session.delegation, session.id, session.url]);
  const [status, setStatus] = useState<SandboxStatus>({ kind: 'starting' });

  useEffect(() => {
    onSessionEventRef.current = onSessionEvent;
  }, [onSessionEvent]);

  const recordSessionEvent = useCallback((event: SandboxAppHostSessionEvent): boolean => {
    const recorder = onSessionEventRef.current;
    if (recorder === undefined) return false;
    recorder(event);
    return true;
  }, []);

  useEffect(() => {
    if (loadPlan !== undefined && loadPlan.kind !== 'error') {
      setStatus({ kind: 'starting' });
      recordSessionEvent({
        appId,
        contextId: session.id,
        data: { entryKind: loadPlan.kind },
        kind: 'sandbox.host.starting',
        sessionUrl: session.url,
        status: 'starting',
      });
    }
  }, [appId, loadPlan, recordSessionEvent, session.id, session.url, srcDoc]);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const frameWindow = frameRef.current?.contentWindow;
      if (frameWindow === undefined || frameWindow === null || event.source !== frameWindow) return;

      const message = sandboxFrameMessage(event.data);
      if (message === undefined) return;

      if (message.type === 'running') {
        setStatus((current) => (current.kind === 'error' ? current : { kind: 'running' }));
        recordSessionEvent({
          appId,
          contextId: session.id,
          kind: 'sandbox.frame.running',
          sessionUrl: session.url,
          status: 'running',
        });
      } else if (message.type === 'error') {
        const diagnosticsRecorded = recordSessionEvent({
          appId,
          contextId: session.id,
          data: message.error.stack === undefined ? undefined : { hasStack: true },
          error: message.error.message,
          kind: 'sandbox.frame.error',
          sessionUrl: session.url,
          status: 'error',
        });
        setStatus({ kind: 'error', diagnosticsRecorded, error: message.error });
      } else {
        recordSessionEvent({
          appId,
          contextId: session.id,
          data: sandboxServiceRequestDiagnostics(message),
          kind: 'sandbox.service.request',
          requestId: message.id,
          service: message.service,
          sessionUrl: session.url,
        });
        void Promise.resolve(serviceBridge.respond(message)).then((response) => {
          frameWindow.postMessage(response, '*');
          recordSessionEvent({
            appId,
            contextId: session.id,
            data: sandboxServiceResponseDiagnostics(response),
            kind: 'sandbox.service.response',
            requestId: message.id,
            service: message.service,
            sessionUrl: session.url,
            status: response.ok ? 'ok' : response.error.code,
          });
        }).catch((error: unknown) => {
          const reportedError = sandboxServiceBridgeError(error);
          try {
            frameWindow.postMessage(sandboxServiceBridgeFailure(message, reportedError), '*');
          } catch {
            // The frame may have navigated before the failure response could be delivered.
          }
          const diagnosticsRecorded = recordSessionEvent({
            appId,
            contextId: session.id,
            data: sandboxServiceRequestDiagnostics(message),
            error: reportedError.message,
            kind: 'sandbox.service.thrown',
            requestId: message.id,
            service: message.service,
            sessionUrl: session.url,
            status: 'thrown',
          });
          setStatus({ kind: 'error', diagnosticsRecorded, error: reportedError });
        });
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [appId, recordSessionEvent, serviceBridge, session.id, session.url]);

  if (entry === undefined || loadPlan === undefined) {
    return (
      <SandboxNotice
        message="The app bundle entry is not available in the filesystem."
        title="App entry missing"
      />
    );
  }

  if (loadPlan.kind === 'error') {
    return (
      <SandboxNotice
        message={loadPlan.error}
        role="alert"
        title="App entry unsupported"
      />
    );
  }

  if (srcDoc === undefined) {
    return (
      <SandboxNotice
        message="The app bundle entry could not be prepared for the sandbox."
        role="alert"
        title="App entry failed"
      />
    );
  }

  return (
    <section className="sandbox-app-host" aria-label={title}>
      <iframe
        className="sandbox-app-frame"
        ref={frameRef}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        title={title}
      />
      {status.kind === 'running' ? null : (
        <SandboxStatusOverlay status={status} />
      )}
    </section>
  );
}

function sandboxServiceRequestDiagnostics(request: SandboxAppServiceRequest): unknown {
  return {
    payload: sandboxPayloadDiagnostics(request.payload),
    service: request.service,
  };
}

function sandboxServiceResponseDiagnostics(response: SandboxHostToFrameMessage): unknown {
  if (!response.ok) {
    return {
      ok: false,
      errorCode: response.error.code,
      message: response.error.message,
    };
  }

  return {
    ok: true,
    result: sandboxPayloadDiagnostics(response.result),
  };
}

function sandboxPayloadDiagnostics(payload: unknown): unknown {
  if (typeof payload === 'string') return { value: payload };
  if (!isRecord(payload)) return payload === undefined ? undefined : { type: typeof payload };

  const view = stringField(payload, 'view') ?? stringField(payload, 'name');
  const action = stringField(payload, 'action') ?? stringField(payload, 'intent') ?? stringField(payload, 'name');
  const url = stringField(payload, 'url');
  const title = stringField(payload, 'title');
  const resource = isRecord(payload.resource) ? payload.resource : undefined;
  const state = isRecord(payload.state) ? payload.state : undefined;

  return {
    ...(view === undefined ? {} : { view }),
    ...(action === undefined ? {} : { action }),
    ...(url === undefined ? {} : { url }),
    ...(title === undefined ? {} : { title }),
    ...(resource === undefined ? {} : { resource: {
      kind: stringField(resource, 'kind'),
      name: stringField(resource, 'name'),
      url: stringField(resource, 'url'),
    } }),
    ...(state === undefined ? {} : { state: {
      activeUrl: stringField(state, 'activeUrl'),
      rootUrl: stringField(state, 'rootUrl'),
    } }),
  };
}

function stringField(record: Readonly<Record<string, unknown>>, field: string): string | undefined {
  return typeof record[field] === 'string' ? record[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function SandboxStatusOverlay({ status }: { readonly status: Exclude<SandboxStatus, { readonly kind: 'running' }> }) {
  if (status.kind === 'starting') {
    return <SandboxNotice message="Starting sandboxed app." title="Loading" />;
  }

  return (
    <SandboxNotice
      annotation={status.diagnosticsRecorded
        ? 'Recorded in session diagnostics.'
        : undefined}
      details={status.error.stack}
      message={status.error.message}
      role="alert"
      title="Sandbox app error"
    />
  );
}

function SandboxNotice({
  annotation,
  details,
  message,
  role = 'status',
  title,
}: {
  readonly annotation?: string | undefined;
  readonly details?: string | undefined;
  readonly message: string;
  readonly role?: 'alert' | 'status';
  readonly title: string;
}) {
  return (
    <section className="sandbox-app-notice" role={role}>
      <strong>{title}</strong>
      <span>{message}</span>
      {annotation === undefined ? null : <small>{annotation}</small>}
      {details === undefined ? null : <code>{details}</code>}
    </section>
  );
}

function sandboxServiceBridgeFailure(
  request: SandboxAppServiceRequest,
  error: SandboxAppReportedError,
): SandboxHostToFrameMessage {
  return {
    error: {
      code: 'bad_request',
      message: error.message,
    },
    id: request.id,
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  };
}

function sandboxServiceBridgeError(error: unknown): SandboxAppReportedError {
  return {
    message: `Sandbox service bridge failed: ${error instanceof Error ? error.message : String(error)}`,
    ...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {}),
  };
}

function sandboxSrcDoc({
  appId,
  capabilities,
  loadPlan,
  protocol,
  session,
}: {
  readonly appId: string;
  readonly capabilities: SandboxAppServiceCapabilities;
  readonly loadPlan: Exclude<ReturnType<typeof createSandboxPackageLoadPlan>, { readonly kind: 'error' }>;
  readonly protocol: SandboxAppProtocol;
  readonly session: SandboxAppSession;
}): string {
  const bridgeScript = sandboxBridgeScript({ appId, capabilities, protocol, session });

  if (loadPlan.kind === 'html') {
    return injectSandboxHead(loadPlan.html, [
      sandboxCspMeta(appId),
      `<script>${bridgeScript}</script>`,
      `<script>${htmlReadyScript()}</script>`,
    ]);
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  ${sandboxCspMeta(appId)}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html,
    body,
    #patchpit-root {
      width: 100%;
      height: 100%;
      margin: 0;
    }

    body {
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="patchpit-root"></div>
  <script>${bridgeScript}</script>
  <script type="module">
    try {
      const appModule = await import(${scriptJson(loadPlan.entryModuleUrl)});
      const app = appModule.default ?? appModule.main ?? window.patchpitApp;
      if (typeof app !== 'function') {
        throw new Error('App entry must export a default function or main(env).');
      }

      Promise.resolve(app(window.patchpit)).catch(window.patchpitReportError);
      window.patchpitMarkRunning();
    } catch (error) {
      window.patchpitReportError(error);
    }
  </script>
</body>
</html>`;
}

function sandboxBridgeScript({
  appId,
  capabilities,
  protocol,
  session,
}: {
  readonly appId: string;
  readonly capabilities: SandboxAppServiceCapabilities;
  readonly protocol: SandboxAppProtocol;
  readonly session: SandboxAppSession;
}): string {
  const config = scriptJson({ appId, capabilities: { services: capabilities }, protocol, session });

  return `
    (() => {
      const config = ${config};
      const pending = new Map();
      let nextRequestId = 1;

      function post(message) {
        window.parent.postMessage({ protocol: config.protocol, ...message }, '*');
      }

      function reportError(error) {
        post({
          type: 'error',
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }

      function serviceError(error) {
        const serviceError = new Error(error.message);
        serviceError.name = error.code === 'missing_scope'
          ? 'MissingPatchpitServiceScope'
          : 'PatchpitServiceError';
        serviceError.code = error.code;
        return serviceError;
      }

      function requestService(service, payload) {
        const id = String(nextRequestId++);
        post({ id, payload, service, type: 'serviceRequest' });
        return new Promise((resolve, reject) => {
          pending.set(id, { reject, resolve });
        });
      }

      function blockedNetworkApi(name) {
        return () => Promise.reject(new TypeError(name + ' is blocked in Patchpit sandbox apps. Use host services instead.'));
      }

      Object.defineProperty(window, 'fetch', { value: blockedNetworkApi('fetch') });
      Object.defineProperty(window, 'XMLHttpRequest', {
        value: function XMLHttpRequest() {
          throw new TypeError('XMLHttpRequest is blocked in Patchpit sandbox apps. Use host services instead.');
        },
      });
      Object.defineProperty(window, 'EventSource', {
        value: function EventSource() {
          throw new TypeError('EventSource is blocked in Patchpit sandbox apps. Use host services instead.');
        },
      });
      Object.defineProperty(window, 'WebSocket', {
        value: function WebSocket() {
          throw new TypeError('WebSocket is blocked in Patchpit sandbox apps. Use host services instead.');
        },
      });

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (message?.protocol !== config.protocol || message.type !== 'serviceResponse') return;

        const request = pending.get(message.id);
        if (request === undefined) return;
        pending.delete(message.id);

        if (message.ok === true) request.resolve(message.result);
        else request.reject(serviceError(message.error));
      });

      window.addEventListener('error', (event) => {
        reportError(event.error ?? event.message);
      });

      window.addEventListener('unhandledrejection', (event) => {
        reportError(event.reason);
      });

      const serviceCapabilities = Object.freeze({
        act: config.capabilities.services.act === true,
        open: config.capabilities.services.open === true,
        view: config.capabilities.services.view === true,
      });

      const env = Object.freeze({
        protocol: config.protocol,
        appId: config.appId,
        session: Object.freeze(config.session),
        capabilities: Object.freeze({
          services: serviceCapabilities,
        }),
        services: Object.freeze({
          act: (request) => requestService('act', request),
          open: (request) => requestService('open', request),
          view: (request) => requestService('view', request),
        }),
      });

      Object.defineProperty(window, 'patchpit', { value: env });
      Object.defineProperty(window, 'patchpitEnv', { value: env });
      Object.defineProperty(window, 'patchpitMarkRunning', { value: () => post({ type: 'running' }) });
      Object.defineProperty(window, 'patchpitReportError', { value: reportError });
    })();
  `;
}

function sandboxCspMeta(appId: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="${sandboxCspContent(appId)}">`;
}

function injectSandboxHead(html: string, headEntries: readonly string[]): string {
  const injected = headEntries.join('');
  const htmlWithoutExistingCsp = html.replaceAll(cspMetaPattern, '');
  if (/<head\b[^>]*>/i.test(htmlWithoutExistingCsp)) {
    return htmlWithoutExistingCsp.replace(/<head\b[^>]*>/i, (tag) => `${tag}${injected}`);
  }
  if (/<html\b[^>]*>/i.test(htmlWithoutExistingCsp)) {
    return htmlWithoutExistingCsp.replace(/<html\b[^>]*>/i, (tag) => `${tag}<head>${injected}</head>`);
  }
  const doctype = htmlWithoutExistingCsp.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? '';
  const body = htmlWithoutExistingCsp.slice(doctype.length);
  return `${doctype}<html><head>${injected}</head><body>${body}</body></html>`;
}

function htmlReadyScript(): string {
  return `
    (() => {
      function markRunning() {
        window.patchpitMarkRunning();
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', markRunning, { once: true });
      } else {
        markRunning();
      }
    })();
  `;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C');
}

function sandboxCspContent(appId: string): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "font-src data:",
    "form-action 'none'",
    "frame-src 'none'",
    appId === 'viewer' ? 'img-src data: https:' : 'img-src data:',
    "media-src data:",
    "object-src 'none'",
    "script-src 'unsafe-inline' data:",
    "style-src 'unsafe-inline' data:",
    "worker-src 'none'",
  ].join('; ');
}

const cspMetaPattern = /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"content-security-policy"|'content-security-policy'|content-security-policy\b))[^>]*>/gi;
