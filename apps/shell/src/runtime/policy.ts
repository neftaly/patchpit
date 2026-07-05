import type { IntentRequest, IntentResult } from '@patchpit/system/runtime';

export type RuntimePolicy = {
  admitIntent(request: IntentRequest): IntentPolicyDecision;
};

export type IntentPolicyDecision =
  | { readonly status: 'allow' }
  | { readonly status: 'deny'; readonly result: IntentResult }
  | { readonly status: 'quarantine'; readonly result: IntentResult };

export const allowAllRuntimePolicy: RuntimePolicy = {
  admitIntent() {
    return { status: 'allow' };
  },
};
