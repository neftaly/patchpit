import { useEffect, useMemo, useRef, useState } from 'react';
import type { WindowContext } from '@patchpit/system';
import './sandbox-app-host.css';

export const sandboxAppProtocol = 'patchpit.app@1' as const;

export type SandboxAppProtocol = typeof sandboxAppProtocol;
export type SandboxAppServiceName = 'act' | 'open' | 'view';
export type SandboxAppSession = Pick<WindowContext, 'app' | 'id' | 'url'>;

export type SandboxFilesystemAppEntry = {
  readonly text: string;
  readonly url: string;
};

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
  const entryText = entry?.text;
  const srcDoc = useMemo(() => (
    entryText === undefined
      ? undefined
      : sandboxSrcDoc({
          appId,
          protocol: sandboxAppProtocol,
          session,
          source: entryText,
        })
  ), [appId, entryText, session.app, session.id, session.url]);
  const [status, setStatus] = useState<SandboxStatus>({ kind: 'starting' });

  useEffect(() => {
    if (entryText !== undefined) setStatus({ kind: 'starting' });
  }, [entryText, srcDoc]);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const frameWindow = frameRef.current?.contentWindow;
      if (frameWindow === undefined || frameWindow === null || event.source !== frameWindow) return;

      const message = sandboxFrameMessage(event.data);
      if (message === undefined) return;

      if (message.type === 'running') {
        setStatus({ kind: 'running' });
      } else if (message.type === 'error') {
        setStatus({ kind: 'error', error: message.error });
      } else {
        frameWindow.postMessage(unsupportedServiceResponse(message), '*');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (entryText === undefined || srcDoc === undefined) {
    return (
      <SandboxNotice
        message="The app manifest points at an entry that is not available in the filesystem."
        title="App entry missing"
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
  protocol,
  session,
  source,
}: {
  readonly appId: string;
  readonly protocol: SandboxAppProtocol;
  readonly session: SandboxAppSession;
  readonly source: string;
}): string {
  const config = scriptJson({ appId, protocol, session });
  const appSource = scriptJson(source);

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
  <script id="patchpit-config" type="application/json">${config}</script>
  <script id="patchpit-source" type="application/json">${appSource}</script>
  <script>
    (() => {
      const config = JSON.parse(document.getElementById('patchpit-config').textContent);
      const source = JSON.parse(document.getElementById('patchpit-source').textContent);
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
        services: Object.freeze({
          act: (request) => requestService('act', request),
          open: (request) => requestService('open', request),
          view: (request) => requestService('view', request),
        }),
      });

      void (async () => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          const appModule = await import(moduleUrl);
          const app = appModule.default ?? appModule.main ?? window.patchpitApp;
          if (typeof app !== 'function') {
            throw new Error('App entry must export a default function or main(env).');
          }

          Promise.resolve(app(env)).catch(reportError);
          post({ type: 'running' });
        } catch (error) {
          reportError(error);
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
      })();
    })();
  </script>
</body>
</html>`;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
