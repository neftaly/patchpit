import {
  routeIntentSchemaId,
  routeOpenIntent,
  routePreviewIntent,
  routeRequestsRelation,
  type IntentResult,
  type Json,
  type RouteIntentRow,
  type RuntimeClient,
  type TarstateRow,
} from '@patchpit/system/runtime';
import type { ContextDropTarget } from '../window-manager/window-manager-state';

export type RouteIntentName = typeof routeOpenIntent | typeof routePreviewIntent;

export type RouteIntentInput = {
  readonly rootUrl?: string;
  readonly sourceSurfaceId?: string;
  readonly target?: ContextDropTarget;
  readonly title?: string;
  readonly url: string;
};

let nextRouteRequestId = 1;

export function submitRouteIntent(
  runtime: RuntimeClient,
  intent: RouteIntentName,
  input: RouteIntentInput,
): Promise<IntentResult> {
  const row = routeIntentRow(input);
  return runtime.submitIntent({
    intent,
    input: {
      schemaId: routeIntentSchemaId,
      relations: { [routeRequestsRelation]: [row as unknown as TarstateRow] },
    },
    idempotencyKey: row.id,
  });
}

function routeIntentRow(input: RouteIntentInput): RouteIntentRow {
  return {
    id: `route:${nextRouteRequestId++}`,
    url: input.url,
    ...(input.rootUrl === undefined ? {} : { rootUrl: input.rootUrl }),
    ...(input.sourceSurfaceId === undefined ? {} : { sourceSurfaceId: input.sourceSurfaceId }),
    ...(input.target === undefined ? {} : { target: input.target as unknown as Json }),
    ...(input.title === undefined ? {} : { title: input.title }),
  };
}
