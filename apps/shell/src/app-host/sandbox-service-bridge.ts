import {
  automergeMimeType,
  findNode,
  type FilePickerStateDoc,
  type FileType,
  type FilesystemNode,
  type WindowContext,
} from '@patchpit/system';
import {
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  routeOpenIntent,
  routePreviewIntent,
  type IntentResult,
  type RuntimeClient,
} from '@patchpit/system/runtime';
import { submitFilePickerIntent, type FilePickerSelectUrlInput } from '../runtime/file-picker-intents';
import { submitRouteIntent } from '../runtime/route-intents';

export const sandboxAppProtocol = 'patchpit.app@1' as const;
export const sandboxFilePickerView = 'file-picker' as const;
export const sandboxLaunchView = 'launch' as const;
export const sandboxResourceView = 'resource' as const;

export type SandboxAppProtocol = typeof sandboxAppProtocol;
export type SandboxAppServiceName = 'act' | 'open' | 'view';
export type SandboxAppSession = Pick<WindowContext, 'app' | 'delegation' | 'id' | 'url'>;
export type SandboxAppServiceErrorCode = 'bad_request' | 'missing_scope' | 'not_found' | 'unsupported_service';

export type SandboxAppServiceCapabilities = Readonly<Record<SandboxAppServiceName, boolean>>;

export type SandboxAppResourceView =
  | {
      readonly kind: 'file';
      readonly mediaType: string;
      readonly name: string;
      readonly sourceUrl: string | null;
      readonly text?: string;
      readonly title: string;
      readonly url: string;
    }
  | {
      readonly children: readonly SandboxAppResourceChild[];
      readonly kind: 'folder';
      readonly mediaType: null;
      readonly name: string;
      readonly text?: string;
      readonly title: string;
      readonly url: string;
    };

export type SandboxAppResourceChild = {
  readonly kind: FilesystemNode['kind'];
  readonly mediaType: string | null;
  readonly name: string;
  readonly title: string;
  readonly url: string;
};

export type SandboxAppFilePickerView = {
  readonly fileTypes: readonly SandboxAppFilePickerType[];
  readonly root: SandboxAppFilePickerTreeNode;
  readonly session: SandboxAppSession;
  readonly state: SandboxAppFilePickerState;
  readonly view: typeof sandboxFilePickerView;
};

export type SandboxAppFilePickerState = {
  readonly activeUrl?: string;
  readonly fileTypesUrl: string;
  readonly openFolders: Readonly<Record<string, boolean>>;
  readonly rootUrl: string;
  readonly selectedUrls: readonly string[];
};

export type SandboxAppFilePickerTreeNode = {
  readonly children?: readonly SandboxAppFilePickerTreeNode[];
  readonly kind: FilesystemNode['kind'];
  readonly mediaType: string | null;
  readonly name: string;
  readonly title: string;
  readonly url: string;
};

export type SandboxAppFilePickerType = Pick<FileType, 'emoji' | 'match'>;

export type SandboxFilePickerServiceScope = {
  readonly fileTypes: readonly SandboxAppFilePickerType[];
  readonly root: FilesystemNode;
  readonly rootUrl: string;
  readonly runtime: RuntimeClient;
  readonly sourceSurfaceId: string;
  readonly state: FilePickerStateDoc;
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
  readonly respond: (
    request: SandboxAppServiceRequest,
  ) => SandboxHostToFrameMessage | Promise<SandboxHostToFrameMessage>;
};

type SandboxAppServiceGrant = SandboxAppViewGrant | SandboxAppActGrant;

type SandboxAppViewGrant = {
  readonly id: string;
  readonly name: string;
  readonly respond: (request: SandboxAppServiceRequest) => SandboxHostToFrameMessage;
  readonly service: 'view';
};

type SandboxAppActGrant = {
  readonly id: string;
  readonly name: SandboxFilePickerActionName;
  readonly respond: (
    request: SandboxAppServiceRequest,
    action: SandboxFilePickerActionRequest,
  ) => Promise<SandboxHostToFrameMessage> | SandboxHostToFrameMessage;
  readonly service: 'act';
};

export function createSandboxAppServiceBridge({
  appId,
  filePicker,
  resourceRoot,
  session,
}: {
  readonly appId: string;
  readonly filePicker?: SandboxFilePickerServiceScope | undefined;
  readonly resourceRoot?: FilesystemNode | undefined;
  readonly session: SandboxAppSession;
}): SandboxAppServiceBridge {
  const grants = sandboxAppServiceGrants({ appId, filePicker, resourceRoot, session });
  return {
    capabilities: Object.freeze({
      act: grants.some((grant) => grant.service === 'act'),
      open: false,
      view: grants.some((grant) => grant.service === 'view'),
    }),
    respond(request) {
      if (request.service === 'act') {
        return sandboxActResponse(request, grants);
      }

      if (request.service !== 'view') {
        return serviceErrorResponse(
          request,
          'unsupported_service',
          `Sandbox service ${request.service} is not supported by this host scope.`,
        );
      }

      return sandboxViewResponse(request, grants);
    },
  };
}

function sandboxAppServiceGrants({
  appId,
  filePicker,
  resourceRoot,
  session,
}: {
  readonly appId: string;
  readonly filePicker?: SandboxFilePickerServiceScope | undefined;
  readonly resourceRoot?: FilesystemNode | undefined;
  readonly session: SandboxAppSession;
}): readonly SandboxAppServiceGrant[] {
  const grants: SandboxAppServiceGrant[] = [
    {
      id: 'view:launch',
      name: sandboxLaunchView,
      respond: (request) => serviceSuccessResponse(request, {
        appId,
        session: {
          app: session.app,
          ...(session.delegation === undefined ? {} : { delegation: session.delegation }),
          id: session.id,
          url: session.url,
        },
        view: sandboxLaunchView,
      }),
      service: 'view',
    },
  ];

  if (resourceRoot !== undefined) {
    grants.push({
      id: 'view:resource',
      name: sandboxResourceView,
      respond: (request) => {
        const node = findNode(resourceRoot, session.url);
        if (node === null) {
          return serviceErrorResponse(
            request,
            'not_found',
            'Sandbox resource target is no longer available in this host scope.',
          );
        }

        return serviceSuccessResponse(request, {
          resource: sandboxResourceViewData(node),
          view: sandboxResourceView,
        });
      },
      service: 'view',
    });
  }

  if (sandboxFilePickerScopeApplies(appId, session, filePicker)) {
    grants.push({
      id: 'view:file-picker',
      name: sandboxFilePickerView,
      respond: (request) => serviceSuccessResponse(request, sandboxFilePickerViewData(session, filePicker)),
      service: 'view',
    });

    for (const action of sandboxFilePickerActionNames) {
      grants.push({
        id: `act:${action}`,
        name: action,
        respond: (request, actionRequest) => sandboxFilePickerActResponse(request, filePicker, actionRequest),
        service: 'act',
      });
    }
  }

  return Object.freeze(grants);
}

function sandboxViewResponse(
  request: SandboxAppServiceRequest,
  grants: readonly SandboxAppServiceGrant[],
): SandboxHostToFrameMessage {
  const viewRequest = sandboxViewRequest(request.payload);
  if (viewRequest.kind === 'app_supplied_authority') {
    return serviceErrorResponse(
      request,
      'missing_scope',
      'Sandbox service requests cannot carry app-supplied authority scope.',
    );
  }

  const grant = grants.find(
    (candidate): candidate is SandboxAppViewGrant =>
      candidate.service === 'view' && candidate.name === viewRequest.view,
  );
  if (grant !== undefined) return grant.respond(request);

  return serviceErrorResponse(
    request,
    'missing_scope',
    sandboxMissingViewMessage(viewRequest.view),
  );
}

function sandboxActResponse(
  request: SandboxAppServiceRequest,
  grants: readonly SandboxAppServiceGrant[],
): SandboxHostToFrameMessage | Promise<SandboxHostToFrameMessage> {
  const actGrants = grants.filter((grant): grant is SandboxAppActGrant => grant.service === 'act');
  if (actGrants.length === 0) {
    return serviceErrorResponse(
      request,
      'unsupported_service',
      'Sandbox service act is not supported by this host scope.',
    );
  }

  const actionRequest = sandboxActionRequest(request.payload);
  if (actionRequest.kind === 'app_supplied_authority') {
    return serviceErrorResponse(
      request,
      'missing_scope',
      'Sandbox service requests cannot carry app-supplied authority scope.',
    );
  }
  if (actionRequest.kind === 'bad_request') {
    return serviceErrorResponse(request, 'bad_request', actionRequest.message);
  }

  const grant = actGrants.find((candidate) => candidate.name === actionRequest.action);
  if (grant === undefined) {
    return serviceErrorResponse(
      request,
      'missing_scope',
      `Sandbox action ${actionRequest.action} is not available in this host scope.`,
    );
  }

  return grant.respond(request, actionRequest);
}

async function sandboxFilePickerActResponse(
  request: SandboxAppServiceRequest,
  filePicker: SandboxFilePickerServiceScope,
  actionRequest: SandboxFilePickerActionRequest,
): Promise<SandboxHostToFrameMessage> {
  try {
    const result = await submitSandboxFilePickerAction(filePicker, actionRequest);
    return serviceSuccessResponse(request, {
      action: actionRequest.action,
      result,
    });
  } catch (error) {
    return serviceErrorResponse(
      request,
      'bad_request',
      error instanceof Error ? error.message : 'Sandbox action request could not be submitted.',
    );
  }
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

type SandboxFilePickerActionName =
  | typeof filePickerSelectUrlIntent
  | typeof filePickerToggleFolderIntent
  | typeof routeOpenIntent
  | typeof routePreviewIntent;

const sandboxFilePickerActionNames = [
  filePickerSelectUrlIntent,
  filePickerToggleFolderIntent,
  routeOpenIntent,
  routePreviewIntent,
] as const satisfies readonly SandboxFilePickerActionName[];

type SandboxFilePickerActionRequest = {
  readonly action: SandboxFilePickerActionName;
  readonly options?: NonNullable<FilePickerSelectUrlInput['options']>;
  readonly title?: string;
  readonly url: string;
};

function sandboxFilePickerScopeApplies(
  appId: string,
  session: SandboxAppSession,
  filePicker: SandboxFilePickerServiceScope | undefined,
): filePicker is SandboxFilePickerServiceScope {
  return appId === sandboxFilePickerView && session.app === sandboxFilePickerView && filePicker !== undefined;
}

async function submitSandboxFilePickerAction(
  filePicker: SandboxFilePickerServiceScope,
  request: SandboxFilePickerActionRequest,
): Promise<IntentResult> {
  if (request.action === filePickerSelectUrlIntent) {
    return submitFilePickerIntent(
      filePicker.runtime,
      filePickerSelectUrlIntent,
      request.options === undefined ? { url: request.url } : { options: request.options, url: request.url },
    );
  }

  if (request.action === filePickerToggleFolderIntent) {
    return submitFilePickerIntent(filePicker.runtime, filePickerToggleFolderIntent, { url: request.url });
  }

  const title = request.title ?? findNode(filePicker.root, request.url)?.name ?? request.url;
  return submitRouteIntent(filePicker.runtime, request.action, {
    rootUrl: filePicker.rootUrl,
    sourceSurfaceId: filePicker.sourceSurfaceId,
    title,
    url: request.url,
  });
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

function sandboxMissingViewMessage(view: string | undefined): string {
  if (view === sandboxResourceView) return 'Sandbox resource view is not available in this host scope.';
  if (view === sandboxFilePickerView) return 'Sandbox file-picker view is not available in this host scope.';
  return view === undefined
    ? 'Sandbox view request is not available in this host scope.'
    : `Sandbox view ${view} is not available in this host scope.`;
}

function sandboxActionRequest(payload: unknown): (
  | { readonly kind: 'action' } & SandboxFilePickerActionRequest
  | { readonly kind: 'app_supplied_authority' }
  | { readonly kind: 'bad_request'; readonly message: string }
) {
  if (!isRecord(payload)) {
    return { kind: 'bad_request', message: 'Sandbox act request payload must be an object.' };
  }
  if (hasAppSuppliedActionAuthority(payload)) return { kind: 'app_supplied_authority' };

  const unknownField = Object.keys(payload).find((field) => !sandboxActionRequestFields.has(field));
  if (unknownField !== undefined) {
    return { kind: 'bad_request', message: `Sandbox act request field ${unknownField} is not supported.` };
  }

  const action = payload.name ?? payload.action ?? payload.intent;
  if (!isSandboxFilePickerActionName(action)) {
    return { kind: 'bad_request', message: 'Sandbox act request action is not supported.' };
  }

  if (typeof payload.url !== 'string') {
    return { kind: 'bad_request', message: `Sandbox action ${action} requires a url string.` };
  }

  const title = payload.title;
  if (title !== undefined && typeof title !== 'string') {
    return { kind: 'bad_request', message: `Sandbox action ${action} title must be a string.` };
  }

  const options = payload.options;
  if (options !== undefined && !isFilePickerSelectionOptions(options)) {
    return { kind: 'bad_request', message: `Sandbox action ${action} options are malformed.` };
  }

  if (action === filePickerToggleFolderIntent && options !== undefined) {
    return { kind: 'bad_request', message: `${filePickerToggleFolderIntent} only accepts name, action, intent, and url.` };
  }

  if ((action === routeOpenIntent || action === routePreviewIntent) && options !== undefined) {
    return { kind: 'bad_request', message: `${action} only accepts name, action, intent, url, and title.` };
  }

  return {
    action,
    kind: 'action',
    ...(options === undefined ? {} : { options }),
    ...(title === undefined ? {} : { title }),
    url: payload.url,
  };
}

function isSandboxFilePickerActionName(value: unknown): value is SandboxFilePickerActionName {
  return value === filePickerSelectUrlIntent
    || value === filePickerToggleFolderIntent
    || value === routeOpenIntent
    || value === routePreviewIntent;
}

function isFilePickerSelectionOptions(
  value: unknown,
): value is NonNullable<SandboxFilePickerActionRequest['options']> {
  if (!isRecord(value)) return false;
  const unknownField = Object.keys(value).find((field) => field !== 'selectedUrls' && field !== 'toggle');
  if (unknownField !== undefined) return false;
  const hasSelectedUrls = Object.hasOwn(value, 'selectedUrls');
  const hasToggle = Object.hasOwn(value, 'toggle');
  if (hasSelectedUrls === hasToggle) return false;
  if (hasSelectedUrls) {
    return Array.isArray(value.selectedUrls) && value.selectedUrls.every((url) => typeof url === 'string');
  }
  return value.toggle === true;
}

function hasAppSuppliedAuthority(payload: Readonly<Record<string, unknown>>): boolean {
  return appSuppliedAuthorityFields.some((field) => Object.hasOwn(payload, field));
}

function hasAppSuppliedActionAuthority(payload: Readonly<Record<string, unknown>>): boolean {
  return appSuppliedActionAuthorityFields.some((field) => Object.hasOwn(payload, field));
}

function sandboxFilePickerViewData(
  session: SandboxAppSession,
  filePicker: SandboxFilePickerServiceScope,
): SandboxAppFilePickerView {
  return {
    fileTypes: filePicker.fileTypes.map((fileType) => ({
      emoji: fileType.emoji,
      match: fileType.match,
    })),
    root: sandboxFilePickerTreeData(filePicker.root),
    session: {
      app: session.app,
      id: session.id,
      url: session.url,
    },
    state: {
      ...(filePicker.state.activeUrl === undefined ? {} : { activeUrl: filePicker.state.activeUrl }),
      fileTypesUrl: filePicker.state.fileTypesUrl,
      openFolders: { ...filePicker.state.openFolders },
      rootUrl: filePicker.state.rootUrl,
      selectedUrls: [...filePicker.state.selectedUrls],
    },
    view: sandboxFilePickerView,
  };
}

function sandboxFilePickerTreeData(node: FilesystemNode): SandboxAppFilePickerTreeNode {
  const base = {
    kind: node.kind,
    mediaType: node.kind === 'file' ? node.mediaType : null,
    name: node.name,
    title: node.name,
    url: node.url,
  };

  return node.kind === 'folder'
    ? { ...base, children: node.entries.map(sandboxFilePickerTreeData) }
    : base;
}

function sandboxResourceViewData(node: FilesystemNode): SandboxAppResourceView {
  const base = {
    name: node.name,
    title: node.name,
    url: node.url,
  };

  if (node.kind === 'folder') {
    return {
      ...base,
      children: node.entries.map(sandboxResourceChild),
      kind: 'folder',
      mediaType: null,
      ...(node.text === '' ? {} : { text: node.text }),
    };
  }

  return {
    ...base,
    kind: 'file',
    mediaType: node.mediaType,
    sourceUrl: node.sourceUrl,
    ...(isTextMediaType(node.mediaType) ? { text: node.text } : {}),
  };
}

function sandboxResourceChild(node: FilesystemNode): SandboxAppResourceChild {
  return {
    kind: node.kind,
    mediaType: node.kind === 'file' ? node.mediaType : null,
    name: node.name,
    title: node.name,
    url: node.url,
  };
}

function isTextMediaType(mediaType: string): boolean {
  const normalized = mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return normalized.startsWith('text/')
    || normalized === 'application/json'
    || normalized === 'application/javascript'
    || normalized === 'application/ecmascript'
    || normalized === automergeMimeType
    || normalized === 'application/xml'
    || normalized.endsWith('+json')
    || normalized.endsWith('+xml');
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
  'targetUrl',
  'url',
  'workspaceId',
] as const;

const appSuppliedActionAuthorityFields = [
  'appId',
  'contextId',
  'rootUrl',
  'scope',
  'session',
  'sourceSurfaceId',
  'surfaceId',
  'target',
  'targetUrl',
  'workspaceId',
] as const;

const sandboxActionRequestFields = new Set([
  'action',
  'intent',
  'name',
  'options',
  'title',
  'url',
]);
