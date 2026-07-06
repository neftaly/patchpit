import {
  appLaunchIntent,
  submitRuntimeIntent,
  type AppLaunchIntentRow,
  type IntentResult,
  type RuntimeClient,
} from '@patchpit/system/runtime';
import { appLaunchIntentBoundary, type SurfaceRole, type WindowContext } from '@patchpit/system';

export type AppLaunchIntentInput = {
  readonly app: string;
  readonly behavior: AppLaunchIntentRow['behavior'];
  readonly context?: WindowContext;
  readonly delegation?: string;
  readonly role: SurfaceRole;
};

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
  return {
    id: `app-launch:${nextAppLaunchRequestId++}`,
    app: input.app,
    behavior: input.behavior,
    ...(input.context === undefined ? {} : { context: input.context }),
    ...(input.delegation === undefined ? {} : { delegation: input.delegation }),
    role: input.role,
  };
}
