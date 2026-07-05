import {
  windowCloseContextIntent,
  windowFocusIntent,
  windowMoveTabIntent,
  windowPinPreviewIntent,
  windowResizeSplitIntent,
  submitRuntimeIntent,
  type IntentResult,
  type Json,
  type RuntimeClient,
  type WindowIntentRow,
} from '@patchpit/system/runtime';
import { windowIntentBoundary } from '@patchpit/system';
import type { ContextDropTarget, SplitPath } from '../window-manager/window-manager-state';

export type WindowIntentName =
  | typeof windowCloseContextIntent
  | typeof windowFocusIntent
  | typeof windowMoveTabIntent
  | typeof windowPinPreviewIntent
  | typeof windowResizeSplitIntent;

export type WindowIntentInput = {
  readonly contextId?: string;
  readonly path?: SplitPath;
  readonly ratio?: number;
  readonly sourceSurfaceId?: string;
  readonly surfaceId?: string;
  readonly target?: ContextDropTarget;
};

let nextWindowRequestId = 1;

export function submitWindowIntent(
  runtime: RuntimeClient,
  intent: WindowIntentName,
  input: WindowIntentInput,
): Promise<IntentResult> {
  const row = windowIntentRow(input);
  return submitRuntimeIntent(runtime, {
    boundary: windowIntentBoundary,
    intent,
    idempotencyKey: row.id,
    row,
  });
}

function windowIntentRow(input: WindowIntentInput): WindowIntentRow {
  return {
    id: `window:${nextWindowRequestId++}`,
    ...(input.contextId === undefined ? {} : { contextId: input.contextId }),
    ...(input.path === undefined ? {} : { path: input.path as unknown as readonly Json[] }),
    ...(input.ratio === undefined ? {} : { ratio: input.ratio }),
    ...(input.sourceSurfaceId === undefined ? {} : { sourceSurfaceId: input.sourceSurfaceId }),
    ...(input.surfaceId === undefined ? {} : { surfaceId: input.surfaceId }),
    ...(input.target === undefined ? {} : { target: input.target as unknown as Json }),
  };
}
