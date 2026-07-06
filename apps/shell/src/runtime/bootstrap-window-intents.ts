import {
  rootContainer,
  routeIntentBoundary,
  type SeedFilesystem,
  windowIntentBoundary,
  type WindowContext,
  type WindowManagerStateDoc,
} from '@patchpit/system';
import {
  routeOpenIntent,
  routePreviewIntent,
  runtimeError,
  runtimeIntentRequestRow,
  windowCloseContextIntent,
  windowFocusIntent,
  windowMoveTabIntent,
  windowPinPreviewIntent,
  windowResizeSplitIntent,
  type IntentRequest,
  type IntentResult,
  type RouteIntentRow,
  type RuntimeError,
  type WindowIntentRow,
} from '@patchpit/system/runtime';
import {
  closeContext,
  commitWindowManagerState,
  dropContext,
  dropNewContext,
  focusContext,
  openContext,
  pinContext,
  previewContext,
  resizeSplit,
  type SplitPath,
} from '../window-manager/window-manager-state';
import {
  badRequest,
  isRuntimeError,
  rejected,
} from './bootstrap-intent-result';
import {
  contextDropTarget,
  isSplitPath,
  targetDocumentSurface,
  validateMovedContextDropTarget,
  validateNewContextDropTarget,
  validatePreviewContext,
  validateResizeSplit,
  validateSurfaceContext,
} from './bootstrap-window-topology';
import { automergeHeadSetForHandle } from './automerge-heads';
import { manifestRouteHandler } from './manifest-routing';

type RouteIntentName = typeof routeOpenIntent | typeof routePreviewIntent;

type WindowIntentName =
  | typeof windowCloseContextIntent
  | typeof windowFocusIntent
  | typeof windowMoveTabIntent
  | typeof windowPinPreviewIntent
  | typeof windowResizeSplitIntent;

type ParsedWindowIntentRow = Omit<WindowIntentRow, 'path'> & {
  readonly path?: SplitPath;
};

export function submitBootstrapRouteIntent(
  seed: SeedFilesystem,
  request: IntentRequest,
): IntentResult | undefined {
  const intent = routeIntentName(request.intent);
  if (intent === undefined) return undefined;

  const route = routeIntentRequest(request);
  if (isRuntimeError(route)) return rejected(route);

  const validationError = validateRouteIntent(seed.windowManagerHandle.doc(), intent, route);
  if (validationError !== undefined) return rejected(validationError);

  const routeHandler = manifestRouteHandler(seed, intent, route.url);
  if (isRuntimeError(routeHandler)) return rejected(routeHandler);

  commitWindowManagerState(seed.windowManagerHandle, (doc) => {
    commitRouteIntent(doc, intent, route, seed.rootUrl, routeHandler.app);
  });

  return {
    status: 'committed',
    heads: automergeHeadSetForHandle(seed.windowManagerHandle),
  };
}

export function submitBootstrapWindowIntent(
  seed: SeedFilesystem,
  request: IntentRequest,
): IntentResult | undefined {
  const intent = windowIntentName(request.intent);
  if (intent === undefined) return undefined;

  const windowRequest = windowIntentRequest(request, intent);
  if (isRuntimeError(windowRequest)) return rejected(windowRequest);

  const validationError = validateWindowIntent(seed.windowManagerHandle.doc(), intent, windowRequest);
  if (validationError !== undefined) return rejected(validationError);

  commitWindowManagerState(seed.windowManagerHandle, (doc) => {
    commitWindowIntent(doc, intent, windowRequest);
  });

  return {
    status: 'committed',
    heads: automergeHeadSetForHandle(seed.windowManagerHandle),
  };
}

function routeIntentName(intent: IntentRequest['intent']): RouteIntentName | undefined {
  return intent === routeOpenIntent || intent === routePreviewIntent ? intent : undefined;
}

function routeIntentRequest(request: IntentRequest): RouteIntentRow | RuntimeError {
  const row = runtimeIntentRequestRow<RouteIntentRow>(request, routeIntentBoundary);
  if (isRuntimeError(row)) return row;
  if (row.target !== undefined && contextDropTarget(row.target) === undefined) {
    return badRequest('Route request target is invalid.');
  }

  return {
    id: row.id,
    url: row.url,
    ...(row.rootUrl === undefined ? {} : { rootUrl: row.rootUrl }),
    ...(row.sourceSurfaceId === undefined ? {} : { sourceSurfaceId: row.sourceSurfaceId }),
    ...(row.target === undefined ? {} : { target: row.target }),
    ...(row.title === undefined ? {} : { title: row.title }),
  };
}

function validateRouteIntent(
  state: WindowManagerStateDoc,
  intent: RouteIntentName,
  route: RouteIntentRow,
): RuntimeError | undefined {
  const target = contextDropTarget(route.target);
  if (target !== undefined) return validateNewContextDropTarget(state, target);
  if (targetDocumentSurface(state, route.sourceSurfaceId) !== undefined) return undefined;
  if (Object.keys(state.surfaces).length > 0) return undefined;
  return runtimeError('conflict', `No document surface can accept ${intent}.`);
}

function commitRouteIntent(
  doc: WindowManagerStateDoc,
  intent: RouteIntentName,
  route: RouteIntentRow,
  defaultRootUrl: string,
  app: string,
): void {
  const target = contextDropTarget(route.target);
  const context = target === undefined
    ? routedContext(app, route.url, route.title, route.rootUrl ?? defaultRootUrl)
    : placedRoutedContext(doc, app, route.url, route.title, route.rootUrl ?? defaultRootUrl, route.id);

  if (target !== undefined) {
    dropNewContext(doc, context, target);
  } else if (intent === routeOpenIntent) {
    openContext(doc, context, route.sourceSurfaceId);
  } else {
    previewContext(doc, context, route.sourceSurfaceId);
  }
}

function windowIntentName(intent: IntentRequest['intent']): WindowIntentName | undefined {
  return (
    intent === windowCloseContextIntent
    || intent === windowFocusIntent
    || intent === windowMoveTabIntent
    || intent === windowPinPreviewIntent
    || intent === windowResizeSplitIntent
  )
    ? intent
    : undefined;
}

function windowIntentRequest(
  request: IntentRequest,
  intent: WindowIntentName,
): ParsedWindowIntentRow | RuntimeError {
  const row = runtimeIntentRequestRow<WindowIntentRow>(request, windowIntentBoundary);
  if (isRuntimeError(row)) return row;
  if (row.path !== undefined && !isSplitPath(row.path)) return badRequest('Window request path is invalid.');
  if (row.target !== undefined && contextDropTarget(row.target) === undefined) {
    return badRequest('Window request target is invalid.');
  }

  const parsed = {
    id: row.id,
    ...(row.contextId === undefined ? {} : { contextId: row.contextId }),
    ...(row.path === undefined ? {} : { path: row.path }),
    ...(row.ratio === undefined ? {} : { ratio: row.ratio }),
    ...(row.sourceSurfaceId === undefined ? {} : { sourceSurfaceId: row.sourceSurfaceId }),
    ...(row.surfaceId === undefined ? {} : { surfaceId: row.surfaceId }),
    ...(row.target === undefined ? {} : { target: row.target }),
  } satisfies ParsedWindowIntentRow;

  const fieldError = windowIntentFieldError(intent, parsed);
  return fieldError === undefined ? parsed : badRequest(fieldError);
}

function windowIntentFieldError(
  intent: WindowIntentName,
  row: ParsedWindowIntentRow,
): string | undefined {
  if (
    (intent === windowCloseContextIntent || intent === windowFocusIntent || intent === windowPinPreviewIntent)
    && (typeof row.surfaceId !== 'string' || typeof row.contextId !== 'string')
  ) {
    return `${intent} requires surfaceId and contextId.`;
  }
  if (
    intent === windowMoveTabIntent
    && (
      typeof row.sourceSurfaceId !== 'string'
      || typeof row.contextId !== 'string'
      || row.target === undefined
    )
  ) {
    return `${intent} requires sourceSurfaceId, contextId, and target.`;
  }
  if (intent === windowResizeSplitIntent && (row.path === undefined || typeof row.ratio !== 'number')) {
    return `${intent} requires path and ratio.`;
  }
  return undefined;
}

function validateWindowIntent(
  state: WindowManagerStateDoc,
  intent: WindowIntentName,
  request: ParsedWindowIntentRow,
): RuntimeError | undefined {
  if (
    (intent === windowFocusIntent || intent === windowCloseContextIntent)
    && request.surfaceId !== undefined
    && request.contextId !== undefined
  ) {
    return validateSurfaceContext(state, request.surfaceId, request.contextId);
  }

  if (
    intent === windowPinPreviewIntent
    && request.surfaceId !== undefined
    && request.contextId !== undefined
  ) {
    return validatePreviewContext(state, request.surfaceId, request.contextId);
  }

  if (
    intent === windowMoveTabIntent
    && request.sourceSurfaceId !== undefined
    && request.contextId !== undefined
    && request.target !== undefined
  ) {
    const target = contextDropTarget(request.target);
    return target === undefined
      ? runtimeError('bad_request', 'Window request target is invalid.')
      : validateMovedContextDropTarget(state, request.sourceSurfaceId, request.contextId, target);
  }

  if (intent === windowResizeSplitIntent && request.path !== undefined && request.ratio !== undefined) {
    return validateResizeSplit(state, request.path);
  }

  return undefined;
}

function commitWindowIntent(
  doc: WindowManagerStateDoc,
  intent: WindowIntentName,
  request: ParsedWindowIntentRow,
): void {
  if (intent === windowFocusIntent && request.surfaceId !== undefined && request.contextId !== undefined) {
    focusContext(doc, request.surfaceId, request.contextId);
  } else if (intent === windowCloseContextIntent && request.surfaceId !== undefined && request.contextId !== undefined) {
    closeContext(doc, request.surfaceId, request.contextId);
  } else if (intent === windowPinPreviewIntent && request.surfaceId !== undefined && request.contextId !== undefined) {
    pinContext(doc, request.surfaceId, request.contextId);
  } else if (
    intent === windowMoveTabIntent
    && request.sourceSurfaceId !== undefined
    && request.contextId !== undefined
    && request.target !== undefined
  ) {
    const target = contextDropTarget(request.target);
    if (target !== undefined) dropContext(doc, request.sourceSurfaceId, request.contextId, target);
  } else if (intent === windowResizeSplitIntent && request.path !== undefined && request.ratio !== undefined) {
    resizeSplit(doc, request.path, request.ratio);
  }
}

function placedRoutedContext(
  doc: WindowManagerStateDoc,
  app: string,
  url: string,
  title: string | undefined,
  rootUrl: string,
  intentId: string,
): WindowContext {
  return {
    ...routedContext(app, url, title, rootUrl),
    id: uniqueContextId(doc, `${app}:intent:${intentId}`),
  };
}

function uniqueContextId(doc: WindowManagerStateDoc, id: string): string {
  if (doc.contexts[id] === undefined) return id;
  let index = 2;
  while (doc.contexts[`${id}:${index}`] !== undefined) index += 1;
  return `${id}:${index}`;
}

function routedContext(app: string, url: string, title: string | undefined, rootUrl: string): WindowContext {
  return {
    app,
    container: rootContainer(rootUrl),
    id: `${app}:${url}`,
    ...(title === undefined ? {} : { title }),
    url,
  };
}
