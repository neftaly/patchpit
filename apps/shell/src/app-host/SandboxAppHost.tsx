import { useEffect, useMemo, useRef, useState } from 'react';
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
  readonly resourceRoot?: FilesystemNode | undefined;
  readonly session: SandboxAppSession;
  readonly title?: string;
};

type SandboxStatus =
  | { readonly kind: 'starting' }
  | { readonly kind: 'running' }
  | { readonly kind: 'error'; readonly error: SandboxAppReportedError };

export function SandboxAppHost({
  appId,
  entry,
  filePicker,
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
    if (loadPlan !== undefined && loadPlan.kind !== 'error') setStatus({ kind: 'starting' });
  }, [loadPlan, srcDoc]);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const frameWindow = frameRef.current?.contentWindow;
      if (frameWindow === undefined || frameWindow === null || event.source !== frameWindow) return;

      const message = sandboxFrameMessage(event.data);
      if (message === undefined) return;

      if (message.type === 'running') {
        setStatus((current) => (current.kind === 'error' ? current : { kind: 'running' }));
      } else if (message.type === 'error') {
        setStatus({ kind: 'error', error: message.error });
      } else {
        void Promise.resolve(serviceBridge.respond(message)).then((response) => {
          frameWindow.postMessage(response, '*');
        }).catch((error: unknown) => {
          const reportedError = sandboxServiceBridgeError(error);
          try {
            frameWindow.postMessage(sandboxServiceBridgeFailure(message, reportedError), '*');
          } catch {
            // The frame may have navigated before the failure response could be delivered.
          }
          setStatus({ kind: 'error', error: reportedError });
        });
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [serviceBridge]);

  if (entry === undefined || loadPlan === undefined) {
    return (
      <SandboxNotice
        message="The app manifest points at an entry that is not available in the filesystem."
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
        message="The app manifest entry could not be prepared for the sandbox."
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

function SandboxStatusOverlay({ status }: { readonly status: Exclude<SandboxStatus, { readonly kind: 'running' }> }) {
  if (status.kind === 'starting') {
    return <SandboxNotice message="Starting sandboxed app." title="Loading" />;
  }

  return (
    <SandboxNotice
      details={status.error.stack}
      message={status.error.message}
      role="alert"
      title="Sandbox app error"
    />
  );
}

function SandboxNotice({
  details,
  message,
  role = 'status',
  title,
}: {
  readonly details?: string | undefined;
  readonly message: string;
  readonly role?: 'alert' | 'status';
  readonly title: string;
}) {
  return (
    <section className="sandbox-app-notice" role={role}>
      <strong>{title}</strong>
      <span>{message}</span>
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
    return injectSandboxBridge(loadPlan.html, bridgeScript, htmlReadyScript());
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
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

function injectSandboxBridge(html: string, bridgeScript: string, readyScript: string): string {
  const scripts = `<script>${bridgeScript}</script><script>${readyScript}</script>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (tag) => `${tag}${scripts}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (tag) => `${tag}${scripts}`);
  return `${scripts}${html}`;
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
