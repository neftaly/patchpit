import {
  appLaunchIntent,
  appLaunchIntentSchemaId,
  appLaunchRequestsRelation,
  type AppLaunchIntentRow,
  type IntentResult,
  type RuntimeClient,
  type TarstateRow,
} from '@patchpit/system/runtime';
import type { SurfaceRole, WindowContext } from '@patchpit/system';

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
  return runtime.submitIntent({
    intent: appLaunchIntent,
    input: {
      schemaId: appLaunchIntentSchemaId,
      relations: { [appLaunchRequestsRelation]: [row as unknown as TarstateRow] },
    },
    idempotencyKey: row.id,
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
