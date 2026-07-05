import {
  appLaunchIntent,
  submitRuntimeIntent,
  type AppLaunchIntentRow,
  type IntentResult,
  type RuntimeClient,
} from '@patchpit/system/runtime';
import { appLaunchIntentBoundary, type SurfaceRole, type WindowContext } from '@patchpit/system';

type AppLaunchIntentBase = {
  readonly app: string;
  readonly behavior: AppLaunchIntentRow['behavior'];
  readonly role: SurfaceRole;
  readonly slot?: string;
};

export type AppLaunchIntentInput =
  | (AppLaunchIntentBase & { readonly app: 'terminal'; readonly context?: never })
  | (AppLaunchIntentBase & { readonly context: WindowContext });

let nextAppLaunchRequestId = 1;

export function submitAppLaunchIntent(
  runtime: RuntimeClient,
  input: AppLaunchIntentInput,
): Promise<IntentResult> {
  const row = appLaunchIntentRow(input);
  return submitRuntimeIntent(runtime, {
    boundary: appLaunchIntentBoundary,
    intent: appLaunchIntent,
    idempotencyKey: row.id,
    row,
  });
}

function appLaunchIntentRow(input: AppLaunchIntentInput): AppLaunchIntentRow {
  const context = 'context' in input ? input.context : undefined;
  return {
    id: `app-launch:${nextAppLaunchRequestId++}`,
    app: input.app,
    behavior: input.behavior,
    ...(context === undefined ? {} : { context }),
    role: input.role,
    ...(input.slot === undefined ? {} : { slot: input.slot }),
  };
}
