import type { SurfaceRole, WindowContext } from '../filesystem/types';
import type {
  PatchpitRelationSchemaDescriptor,
  PatchpitSchemaHash,
  PatchpitSchemaId,
} from '../schema';

export const runtimeProtocol = 'patchpit.runtime@1' as const;

export const runtimeHandshakeTimeoutMs = 1_500;

export type RuntimeProtocol = typeof runtimeProtocol;
export type RuntimeBuildId = string;

export type ClientKind = 'tab' | 'sandbox' | 'agent' | 'device-adapter';

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type TarstateSchemaId = PatchpitSchemaId;
export type TarstateRow = Readonly<Record<string, Json>>;
export type AutomergeUrl = string;
export type AutomergeHeads = readonly string[];
export type AutomergeHeadSet = Readonly<Record<AutomergeUrl, AutomergeHeads>>;
export type AnalysisBranchId = string;

export type ProjectionBasis =
  | { readonly kind: 'live' }
  | { readonly kind: 'heads'; readonly heads: AutomergeHeadSet }
  | { readonly kind: 'analysisBranch'; readonly branchId: AnalysisBranchId };

export type RelationSet = {
  readonly relations: Readonly<Record<string, readonly TarstateRow[]>>;
};

export type RuntimeScope = {
  readonly clientId: string;
  readonly workspaceId: string;
  readonly viewportId?: string;
  readonly surfaceId?: string;
  readonly contextId?: string;
  readonly appId?: string;
  readonly subjectId?: string;
  readonly capabilityId?: string;
};

export type RuntimeConnectRequest = {
  readonly protocol: RuntimeProtocol;
  readonly id: string;
  readonly buildId: RuntimeBuildId;
  readonly clientKind: ClientKind;
  readonly workspaceId: string;
  readonly subjectId?: string;
  readonly appId?: string;
};

export type RuntimeConnectResult = {
  readonly buildId: RuntimeBuildId;
  readonly runtimeId: string;
  readonly clientId: string;
  readonly workspaceId: string;
};

export type RuntimeHello = {
  readonly protocol: RuntimeProtocol;
  readonly type: 'hello';
  readonly buildId: RuntimeBuildId;
  readonly clientId: string;
  readonly clientKind: ClientKind;
  readonly workspaceId: string;
};

export type RuntimeHelloAck = {
  readonly protocol: RuntimeProtocol;
  readonly type: 'helloAck';
  readonly buildId: RuntimeBuildId;
  readonly clientId: string;
  readonly runtimeInstanceId: string;
  readonly workspaceId: string;
};

export type RuntimeBootGateShutdown = {
  readonly protocol: RuntimeProtocol;
  readonly type: 'shutdown';
  readonly reason: 'stale-build' | 'dev-reload' | 'client-close';
};

export type RuntimeBootGateProblem = {
  readonly protocol: RuntimeProtocol;
  readonly type: 'problem';
  readonly error: RuntimeError;
};

export type RuntimeBootGateMessage =
  | RuntimeHello
  | RuntimeHelloAck
  | RuntimeBootGateProblem
  | RuntimeBootGateShutdown;

export type RuntimeOperation = 'subscribeProjection' | 'submitIntent' | 'openCapability';

export type RuntimeRequest<T> = {
  readonly protocol: RuntimeProtocol;
  readonly id: string;
  readonly op: RuntimeOperation;
  readonly scope: RuntimeScope;
  readonly payload: T;
};

export type RuntimeResponse<T> =
  | {
      readonly protocol: RuntimeProtocol;
      readonly id: string;
      readonly ok: true;
      readonly payload: T;
    }
  | {
      readonly protocol: RuntimeProtocol;
      readonly id: string;
      readonly ok: false;
      readonly error: RuntimeError;
    };

export type RuntimeConnectResponse = RuntimeResponse<RuntimeConnectResult>;

export type RuntimeErrorCode =
  | 'bad_request'
  | 'unsupported_protocol'
  | 'unsupported_platform'
  | 'unknown_projection'
  | 'unknown_intent'
  | 'unknown_capability'
  | 'missing_handler'
  | 'schema_mismatch'
  | 'unsupported_basis'
  | 'policy_denied'
  | 'policy_quarantined'
  | 'conflict'
  | 'stale_target'
  | 'commit_error'
  | 'not_found'
  | 'runtime_unavailable'
  | 'internal_error';

export type RuntimeError = {
  readonly code: RuntimeErrorCode;
  readonly message: string;
  readonly reason?: string;
  readonly metadata?: Readonly<Record<string, Json>>;
};

export type RuntimeEvent =
  | {
      readonly protocol: RuntimeProtocol;
      readonly type: 'projection';
      readonly subscriptionId: string;
      readonly event: ProjectionEvent;
    }
  | {
      readonly protocol: RuntimeProtocol;
      readonly type: 'intentTicket';
      readonly ticket: string;
      readonly result: IntentResult;
    }
  | {
      readonly protocol: RuntimeProtocol;
      readonly type: 'capability';
      readonly capabilityId: string;
      readonly event: CapabilityEvent;
    };

export type ProjectionName =
  | 'filesystem.tree'
  | 'appManifests.handlers'
  | 'workspace.surfaces'
  | 'workspace.contexts'
  | 'workspace.layout'
  | 'workspace.viewports'
  | 'policy.effectiveGrants'
  | 'presence.clients';

export const filesystemTreeProjection = 'filesystem.tree' as const satisfies ProjectionName;
export const filesystemTreeSchemaId = 'patchpit.filesystem.tree@1' as const;
export const filesystemTreeNodesRelation = 'nodes' as const;

export type FilesystemTreeNodeKind = 'folder' | 'file';
export type FilesystemTreeNodeRow = {
  readonly isRoot: boolean;
  readonly kind: FilesystemTreeNodeKind;
  readonly mediaType: string | null;
  readonly name: string;
  readonly parentUrl: string | null;
  readonly position: number;
  readonly sourceUrl: string | null;
  readonly text: string;
  readonly title: string | null;
  readonly type: string;
  readonly url: string;
};

export type ProjectionSubscriptionRequest = {
  readonly projection: ProjectionName;
  readonly schemaId: TarstateSchemaId;
  readonly args?: Json;
  readonly basis?: ProjectionBasis;
};

export type ProjectionSubscription = {
  readonly subscriptionId: string;
  close(): void;
};

export type ProjectionSnapshot = {
  readonly subscriptionId: string;
  readonly projection: ProjectionName;
  readonly schemaId: TarstateSchemaId;
  readonly schemaHash?: PatchpitSchemaHash;
  readonly schema?: PatchpitRelationSchemaDescriptor;
  readonly basis: ProjectionBasis;
  readonly storageHeads?: AutomergeHeadSet;
  readonly lensPath?: readonly string[];
  readonly relations: RelationSet;
};

export type ProjectionPatch = {
  readonly subscriptionId: string;
  readonly seq: number;
  readonly patch: RelationPatch;
  readonly storageHeads?: AutomergeHeadSet;
};

export type RelationPatch = {
  readonly schemaId: TarstateSchemaId;
  readonly format: 'tarstate.relationPatch@unstable';
  readonly ops: readonly Json[];
};

export type ProjectionEvent =
  | { readonly type: 'snapshot'; readonly snapshot: ProjectionSnapshot }
  | { readonly type: 'patch'; readonly patch: ProjectionPatch }
  | { readonly type: 'reset'; readonly snapshot: ProjectionSnapshot; readonly reason?: string }
  | { readonly type: 'error'; readonly error: RuntimeError };

export type IntentName =
  | 'app.launch'
  | 'route.preview'
  | 'route.open'
  | 'route.reveal'
  | 'route.activate'
  | 'filesystem.writeFile'
  | 'filesystem.mkdir'
  | 'filesystem.move'
  | 'filesystem.delete'
  | 'filePicker.selectUrl'
  | 'filePicker.toggleFolder'
  | 'window.focus'
  | 'window.pinPreview'
  | 'window.closeContext'
  | 'window.moveTab'
  | 'window.resizeSplit'
  | 'asset.commitImport'
  | 'asset.classify'
  | 'asset.approveShare';

export const appLaunchIntent = 'app.launch' as const satisfies IntentName;
export const appLaunchIntentSchemaId = 'patchpit.intent.appLaunch@1' as const;
export const appLaunchRequestsRelation = 'requests' as const;
export const routePreviewIntent = 'route.preview' as const satisfies IntentName;
export const routeOpenIntent = 'route.open' as const satisfies IntentName;
export const routeIntentSchemaId = 'patchpit.intent.route@1' as const;
export const routeRequestsRelation = 'requests' as const;
export const filePickerSelectUrlIntent = 'filePicker.selectUrl' as const satisfies IntentName;
export const filePickerToggleFolderIntent = 'filePicker.toggleFolder' as const satisfies IntentName;
export const filePickerIntentSchemaId = 'patchpit.intent.filePicker@1' as const;
export const filePickerRequestsRelation = 'requests' as const;
export const windowCloseContextIntent = 'window.closeContext' as const satisfies IntentName;
export const windowFocusIntent = 'window.focus' as const satisfies IntentName;
export const windowMoveTabIntent = 'window.moveTab' as const satisfies IntentName;
export const windowPinPreviewIntent = 'window.pinPreview' as const satisfies IntentName;
export const windowResizeSplitIntent = 'window.resizeSplit' as const satisfies IntentName;
export const windowIntentSchemaId = 'patchpit.intent.window@1' as const;
export const windowRequestsRelation = 'requests' as const;

export type AppLaunchBehavior = 'open-context' | 'toggle-surface';

export type AppLaunchIntentRow = {
  readonly id: string;
  readonly app: string;
  readonly behavior: AppLaunchBehavior;
  readonly context?: WindowContext;
  readonly role: SurfaceRole;
  readonly slot?: string;
};

export type RouteIntentRow = {
  readonly id: string;
  readonly url: string;
  readonly rootUrl?: string;
  readonly sourceSurfaceId?: string;
  readonly target?: Json;
  readonly title?: string;
};

export type FilePickerIntentRow = {
  readonly id: string;
  readonly url: string;
  readonly range?: readonly string[];
  readonly toggle?: boolean;
};

export type WindowIntentRow = {
  readonly id: string;
  readonly contextId?: string;
  readonly path?: readonly Json[];
  readonly ratio?: number;
  readonly sourceSurfaceId?: string;
  readonly surfaceId?: string;
  readonly target?: Json;
};

export type TarstateIntentInput = {
  readonly schemaId: TarstateSchemaId;
  readonly relations: RelationSet['relations'];
};

export type IntentRequest = {
  readonly intent: IntentName;
  readonly input: TarstateIntentInput;
  readonly baseHeads?: AutomergeHeadSet;
  readonly idempotencyKey?: string;
};

export type IntentResult =
  | {
      readonly status: 'committed';
      readonly heads: AutomergeHeadSet;
      readonly effects?: readonly RelationPatch[];
      readonly policy?: AppliedPolicyEffects;
    }
  | {
      readonly status: 'queued';
      readonly ticket: string;
    }
  | {
      readonly status: 'rejected';
      readonly error: RuntimeError;
    }
  | {
      readonly status: 'conflict';
      readonly currentHeads: AutomergeHeadSet;
      readonly error?: RuntimeError;
    }
  | {
      readonly status: 'quarantined';
      readonly reason: string;
    };

export type AppliedPolicyEffects = {
  readonly transformed?: boolean;
  readonly obligations?: readonly Json[];
  readonly reason?: string;
};

export type CapabilityName =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'terminal.filesystem'
  | 'context.control'
  | 'surface.place'
  | 'viewport.present'
  | 'presence.publish'
  | 'analysis.branch'
  | 'asset.import'
  | 'agent.suggestIntent'
  | 'export.request';

export type CapabilityRequest = {
  readonly capability: CapabilityName;
  readonly verbs?: readonly string[];
};

export type CapabilityGrant = {
  readonly capabilityId: string;
  readonly capability: CapabilityName;
  readonly verbs: readonly string[];
  readonly bounds?: CapabilityBounds;
  readonly schemas?: Readonly<Record<TarstateSchemaId, PatchpitRelationSchemaDescriptor>>;
};

export type CapabilityBounds = {
  readonly maxItems?: number;
  readonly maxBytes?: number;
  readonly ttlMs?: number;
};

export type CapabilityPort = {
  readonly grant: CapabilityGrant;
  readonly port: MessagePort;
};

export type CapabilityEvent =
  | { readonly type: 'ready'; readonly grant: CapabilityGrant }
  | { readonly type: 'revoked'; readonly reason?: string }
  | { readonly type: 'error'; readonly error: RuntimeError };

export type RealtimeMessage = {
  readonly topic: string;
  readonly mode: 'replace-latest' | 'append-bounded';
  readonly ttlMs: number;
  readonly key?: string;
  readonly schemaId?: TarstateSchemaId;
  readonly data: Json;
};

export type RuntimeClient = {
  subscribeProjection(
    request: ProjectionSubscriptionRequest,
    listener: (event: ProjectionEvent) => void,
  ): ProjectionSubscription;
  submitIntent(request: IntentRequest): Promise<IntentResult>;
  openCapability(request: CapabilityRequest): Promise<CapabilityPort>;
};

export function runtimeError(code: RuntimeErrorCode, message: string, reason?: string): RuntimeError {
  return reason === undefined ? { code, message } : { code, message, reason };
}
