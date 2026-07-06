import type { WindowContext } from '@patchpit/system';

export const sandboxAppProtocol = 'patchpit.app@1' as const;
export const sandboxLaunchView = 'launch' as const;

export type SandboxAppProtocol = typeof sandboxAppProtocol;
export type SandboxAppServiceName = 'act' | 'open' | 'view';
export type SandboxAppSession = Pick<WindowContext, 'app' | 'id' | 'url'>;
export type SandboxAppServiceErrorCode = 'missing_scope' | 'unsupported_service';

export type SandboxAppServiceCapabilities = Readonly<Record<SandboxAppServiceName, boolean>>;

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

export type SandboxHostToFrameMessage = {
  readonly protocol: SandboxAppProtocol;
  readonly type: 'serviceResponse';
  readonly id: string;
} & (
  | {
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: SandboxAppServiceErrorCode;
        readonly message: string;
      };
    }
);

export type SandboxAppServiceBridge = {
  readonly capabilities: SandboxAppServiceCapabilities;
  readonly respond: (request: SandboxAppServiceRequest) => SandboxHostToFrameMessage;
};

export function createSandboxAppServiceBridge({
  appId,
  session,
}: {
  readonly appId: string;
  readonly session: SandboxAppSession;
}): SandboxAppServiceBridge {
  return {
    capabilities: Object.freeze({
      act: false,
      open: false,
      view: true,
    }),
    respond(request) {
      if (request.service !== 'view') {
        return serviceErrorResponse(
          request,
          'unsupported_service',
          `Sandbox service ${request.service} is not supported by this host scope.`,
        );
      }

      const viewRequest = sandboxViewRequest(request.payload);
      if (viewRequest.kind === 'app_supplied_authority') {
        return serviceErrorResponse(
          request,
          'missing_scope',
          'Sandbox service requests cannot carry app-supplied authority scope.',
        );
      }
      if (viewRequest.view !== sandboxLaunchView) {
        return serviceErrorResponse(
          request,
          'missing_scope',
          viewRequest.view === undefined
            ? 'Sandbox view request is not available in this host scope.'
            : `Sandbox view ${viewRequest.view} is not available in this host scope.`,
        );
      }

      return serviceSuccessResponse(request, {
        appId,
        session: {
          app: session.app,
          id: session.id,
          url: session.url,
        },
        view: sandboxLaunchView,
      });
    },
  };
}

export function sandboxFrameMessage(value: unknown): SandboxFrameToHostMessage | undefined {
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

function serviceSuccessResponse(request: SandboxAppServiceRequest, result: unknown): SandboxHostToFrameMessage {
  return {
    id: request.id,
    ok: true,
    protocol: sandboxAppProtocol,
    result,
    type: 'serviceResponse',
  };
}

function serviceErrorResponse(
  request: SandboxAppServiceRequest,
  code: SandboxAppServiceErrorCode,
  message: string,
): SandboxHostToFrameMessage {
  return {
    error: { code, message },
    id: request.id,
    ok: false,
    protocol: sandboxAppProtocol,
    type: 'serviceResponse',
  };
}

function sandboxViewRequest(payload: unknown): (
  | { readonly kind: 'app_supplied_authority' }
  | { readonly kind: 'view'; readonly view: string | undefined }
) {
  if (payload === undefined || payload === null) return { kind: 'view', view: sandboxLaunchView };
  if (payload === sandboxLaunchView) return { kind: 'view', view: sandboxLaunchView };
  if (!isRecord(payload)) return { kind: 'view', view: undefined };
  if (hasAppSuppliedAuthority(payload)) return { kind: 'app_supplied_authority' };

  const name = payload.name ?? payload.view;
  return { kind: 'view', view: typeof name === 'string' ? name : undefined };
}

function hasAppSuppliedAuthority(payload: Readonly<Record<string, unknown>>): boolean {
  return appSuppliedAuthorityFields.some((field) => Object.hasOwn(payload, field));
}

function isSandboxAppServiceName(value: unknown): value is SandboxAppServiceName {
  return value === 'act' || value === 'open' || value === 'view';
}

function reportedError(value: unknown): SandboxAppReportedError | undefined {
  if (!isRecord(value) || typeof value.message !== 'string') return undefined;
  if (typeof value.stack !== 'string') return { message: value.message };
  return { message: value.message, stack: value.stack };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const appSuppliedAuthorityFields = [
  'appId',
  'contextId',
  'rootUrl',
  'scope',
  'session',
  'surfaceId',
  'workspaceId',
] as const;
