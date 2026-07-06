import { useEffect, useMemo, useRef, useState } from 'react';
import type { WindowContext } from '@patchpit/system';
import { createSandboxPackageLoadPlan, type SandboxFilesystemAppEntry } from './sandbox-package-loader';
import './sandbox-app-host.css';

export const sandboxAppProtocol = 'patchpit.app@1' as const;

export type SandboxAppProtocol = typeof sandboxAppProtocol;
export type SandboxAppServiceName = 'act' | 'open' | 'view';
export type SandboxAppSession = Pick<WindowContext, 'app' | 'id' | 'url'>;

export type SandboxAppServiceRequest = {
  readonly protocol: SandboxAppProtocol;
  readonly type: 'serviceRequest';
  readonly id: string;
  readonly payload: unknown;
  readonly service: SandboxAppServiceName;
};

export type SandboxAppReportedError = {
  readonly message: string;
  readonly stack?: string;
};

export type SandboxFrameToHostMessage =
  | SandboxAppServiceRequest
  | {
      readonly protocol: SandboxAppProtocol;
      readonly type: 'error';
      readonly error: SandboxAppReportedError;
    }
  | {
      readonly protocol: SandboxAppProtocol;
      readonly type: 'running';
    };

export type SandboxAppHostProps = {
  readonly appId: string;
  readonly entry: SandboxFilesystemAppEntry | undefined;
  readonly session: SandboxAppSession;
  readonly title?: string;
};

type SandboxHostToFrameMessage = {
  readonly protocol: SandboxAppProtocol;
  readonly type: 'serviceResponse';
  readonly id: string;
  readonly ok: false;
  readonly error: {
    readonly code: 'unsupported';
    readonly message: string;
  };
};

type SandboxStatus =
  | { readonly kind: 'starting' }
  | { readonly kind: 'running' }
  | { readonly kind: 'error'; readonly error: SandboxAppReportedError };

export function SandboxAppHost({
  appId,
  entry,
  session,
  title = `${appId} sandbox`,
}: SandboxAppHostProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loadPlan = useMemo(() => (
    entry === undefined ? undefined : createSandboxPackageLoadPlan(entry)
  ), [entry]);
  const srcDoc = useMemo(() => (
    loadPlan === undefined || loadPlan.kind === 'error'
      ? undefined
      : sandboxSrcDoc({
          appId,
          loadPlan,
          protocol: sandboxAppProtocol,
          session,
        })
  ), [appId, loadPlan, session.app, session.id, session.url]);
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
        frameWindow.postMessage(unsupportedServiceResponse(message), '*');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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

function unsupportedServiceResponse(request: SandboxAppServiceRequest): SandboxHostToFrameMessage {
  return {
    error: {
      code: 'unsupported',
      message: `Sandbox service ${request.service} is not supported by this host yet.`,
    },
    id: request.id,
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  };
}

function sandboxFrameMessage(value: unknown): SandboxFrameToHostMessage | undefined {
  if (!isRecord(value) || value.protocol !== sandboxAppProtocol || typeof value.type !== 'string') {
    return undefined;
  }

  if (value.type === 'running') return { protocol: sandboxAppProtocol, type: 'running' };

  if (value.type === 'error') {
    const error = reportedError(value.error);
    return error === undefined ? undefined : { error, protocol: sandboxAppProtocol, type: 'error' };
  }

  if (
    value.type === 'serviceRequest'
    && typeof value.id === 'string'
    && isSandboxAppServiceName(value.service)
  ) {
    return {
      id: value.id,
      payload: value.payload,
      protocol: sandboxAppProtocol,
      service: value.service,
      type: 'serviceRequest',
    };
  }

  return undefined;
}

function isSandboxAppServiceName(value: unknown): value is SandboxAppServiceName {
  return value === 'act' || value === 'open' || value === 'view';
}

function reportedError(value: unknown): SandboxAppReportedError | undefined {
  if (!isRecord(value) || typeof value.message !== 'string') return undefined;
  if (typeof value.stack !== 'string') return { message: value.message };
  return { message: value.message, stack: value.stack };
}

function sandboxSrcDoc({
  appId,
  loadPlan,
  protocol,
  session,
}: {
  readonly appId: string;
  readonly loadPlan: Exclude<ReturnType<typeof createSandboxPackageLoadPlan>, { readonly kind: 'error' }>;
  readonly protocol: SandboxAppProtocol;
  readonly session: SandboxAppSession;
}): string {
  const bridgeScript = sandboxBridgeScript({ appId, protocol, session });

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
  protocol,
  session,
}: {
  readonly appId: string;
  readonly protocol: SandboxAppProtocol;
  readonly session: SandboxAppSession;
}): string {
  const config = scriptJson({ appId, protocol, session });

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

      function unsupportedError(error) {
        const unsupported = new Error(error.message);
        unsupported.name = 'UnsupportedPatchpitService';
        unsupported.code = error.code;
        return unsupported;
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
        else request.reject(unsupportedError(message.error));
      });

      window.addEventListener('error', (event) => {
        reportError(event.error ?? event.message);
      });

      window.addEventListener('unhandledrejection', (event) => {
        reportError(event.reason);
      });

      const env = Object.freeze({
        protocol: config.protocol,
        appId: config.appId,
        session: Object.freeze(config.session),
        capabilities: Object.freeze({
          services: Object.freeze({
            act: false,
            open: false,
            view: false,
          }),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
