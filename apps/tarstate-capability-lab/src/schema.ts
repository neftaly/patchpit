import {
  boolean,
  defineSchema,
  id,
  nullable,
  number,
  optional,
  ref,
  relation,
  string
} from '@tarstate/core';

export type ResourceKind =
  | 'fullscreen-target'
  | 'lock'
  | 'media-stream'
  | 'network-link'
  | 'pointer-stream'
  | 'renderer'
  | 'socket'
  | 'storage'
  | 'viewport'
  | 'worker';

export type ResourceStatus = 'idle' | 'active' | 'closed' | 'error' | 'pending';

export type ResourceRow = {
  readonly resourceId: string;
  readonly kind: ResourceKind;
  readonly adapter: string;
  readonly label: string;
  readonly status: ResourceStatus;
};

export type CapabilityRow = {
  readonly capabilityId: string;
  readonly resourceId: string;
  readonly kind: string;
  readonly canIssueIntents: boolean;
  readonly canReadRows: boolean;
  readonly description: string;
};

export type EffectIntentStatus = 'pending' | 'running' | 'handled' | 'failed';

export type EffectIntentRow = {
  readonly intentId: string;
  readonly resourceId: string;
  readonly capabilityId: string;
  readonly kind: string;
  readonly payloadJson: string;
  readonly status: EffectIntentStatus;
  readonly createdAt: number;
};

export type EffectResultStatus = 'ok' | 'error' | 'denied' | 'unsupported';

export type EffectResultRow = {
  readonly resultId: string;
  readonly intentId: string;
  readonly resourceId: string;
  readonly kind: string;
  readonly status: EffectResultStatus;
  readonly message: string;
  readonly valueJson: string;
  readonly createdAt: number;
};

export type DiagnosticRow = {
  readonly diagnosticId: string;
  readonly scope: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly resourceId: string | undefined;
  readonly createdAt: number;
};

export type EventRow = {
  readonly eventId: string;
  readonly resourceId: string;
  readonly kind: string;
  readonly sequence: number;
  readonly payloadJson: string;
  readonly createdAt: number;
};

export type ViewportRow = {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
};

export type FullscreenRow = {
  readonly fullscreenId: string;
  readonly targetResourceId: string;
  readonly available: boolean;
  readonly active: boolean;
  readonly requested: boolean;
  readonly mode?: 'simulated' | 'browser';
  readonly activationRequired?: boolean;
  readonly activationActive?: boolean;
  readonly lastOutcome?: 'none' | 'requested' | 'active' | 'exited' | 'denied' | 'unsupported' | 'failed';
  readonly lastErrorName?: string;
};

export const capabilityLabSchema = defineSchema({
  resources: relation<ResourceRow>({
    key: 'resourceId',
    fields: {
      resourceId: id('resource'),
      kind: string(),
      adapter: string(),
      label: string(),
      status: string()
    }
  }),
  capabilities: relation<CapabilityRow>({
    key: 'capabilityId',
    fields: {
      capabilityId: id('capability'),
      resourceId: ref('resources.resourceId'),
      kind: string(),
      canIssueIntents: boolean(),
      canReadRows: boolean(),
      description: string()
    }
  }),
  effectIntents: relation<EffectIntentRow>({
    key: 'intentId',
    fields: {
      intentId: id('effectIntent'),
      resourceId: ref('resources.resourceId'),
      capabilityId: ref('capabilities.capabilityId'),
      kind: string(),
      payloadJson: string(),
      status: string(),
      createdAt: number()
    },
    ephemeral: true
  }),
  effectResults: relation<EffectResultRow>({
    key: 'resultId',
    fields: {
      resultId: id('effectResult'),
      intentId: ref('effectIntents.intentId'),
      resourceId: ref('resources.resourceId'),
      kind: string(),
      status: string(),
      message: string(),
      valueJson: string(),
      createdAt: number()
    },
    ephemeral: true
  }),
  diagnostics: relation<DiagnosticRow>({
    key: 'diagnosticId',
    fields: {
      diagnosticId: id('diagnostic'),
      scope: string(),
      severity: string(),
      message: string(),
      resourceId: optional(ref('resources.resourceId')),
      createdAt: number()
    },
    ephemeral: true
  }),
  events: relation<EventRow>({
    key: 'eventId',
    fields: {
      eventId: id('event'),
      resourceId: ref('resources.resourceId'),
      kind: string(),
      sequence: number(),
      payloadJson: string(),
      createdAt: number()
    },
    ephemeral: true
  }),
  viewport: relation<ViewportRow>({
    key: 'viewportId',
    fields: {
      viewportId: id('viewport'),
      width: number(),
      height: number(),
      devicePixelRatio: number()
    }
  }),
  fullscreen: relation<FullscreenRow>({
    key: 'fullscreenId',
    fields: {
      fullscreenId: id('fullscreen'),
      targetResourceId: nullable(ref('resources.resourceId')),
      available: boolean(),
      active: boolean(),
      requested: boolean(),
      mode: optional(string()),
      activationRequired: optional(boolean()),
      activationActive: optional(boolean()),
      lastOutcome: optional(string()),
      lastErrorName: optional(string())
    },
    ephemeral: true
  })
});
