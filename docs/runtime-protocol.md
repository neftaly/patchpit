# Patchpit Runtime Protocol

Patchpit needs a shared runtime boundary for Automerge, Tarstate, policy, and
app capabilities. This document narrows that boundary and records the first
implementation slice.

The surface protocol defines Patchpit's shell objects: app manifests, intents,
contexts, surfaces, layouts, and viewports. This document defines how clients
talk to the live runtime that owns the underlying Automerge repo and Tarstate
projections.

## Goals

- Keep Automerge docs as canonical durable state.
- Use Tarstate for named projections, shared IVM, indexes, and write lenses.
- Let tabs, sandboxed apps, agents, and device adapters share one runtime.
- Expose projections, intents, and capabilities instead of raw `Repo` or
  `DocHandle` access.
- Make Tarstate schemas the compatibility and versioning layer for projection
  and intent payloads.
- Attach portable schema descriptors to snapshots, durable documents, and
  capability grants so relation-shaped state can be understood without importing
  app TypeScript.
- Keep the public protocol separate from worker placement, while making the V0
  deployment target explicit.
- Require the runtime platform we need instead of building compatibility
  fallbacks.
- Keep the frame/realtime hot path decomplected from durable Automerge and
  Tarstate work.
- Leave app-specific rendering, XR, graphics, and engine concerns outside the
  core runtime protocol.

## Non-Goals

- Do not define a general plugin API.
- Do not define field-level sync filtering.
- Do not define the NSFW classifier implementation.
- Do not define GLTF, WebXR, WebGL, WebGPU, or game engine APIs.
- Do not require schema evolution lenses before the first worker boundary.
- Do not make `FilesystemIndexDoc` an interchange format.
- Do not provide alternate runtime implementations for browsers that fail the
  required platform probe.

## Invariants

- Automerge docs are the only canonical durable document state.
- Tarstate projections, indexes, materialized views, and policy indexes are
  derived state.
- Apps, shell surfaces, and sandboxed code never receive raw `Repo`,
  unrestricted `DocHandle`, or broad storage authority.
- Every durable mutation enters through `submitIntent`.
- Every read exposed across the runtime boundary is a projection or capability
  result.
- Every capability is scoped, revocable, and policy-gated.
- Wire payloads are structured-clone compatible. Semantic payloads are Tarstate
  relation sets or patches, Automerge refs/heads/changes, capability messages,
  or named runtime envelopes. JSON-compatible data is the default portable
  encoding, not the application model.
- Historical reads and temporary analysis branches are derived views over
  Automerge heads. They are not canonical state until promoted through a normal
  intent.
- Unknown top-level protocol fields are invalid. V0 does not provide general
  extension bags; payload-specific `metadata` fields are allowed only where a
  type explicitly declares them.
- Missing required platform features are fatal at boot. V0/V1 have no degraded
  runtime mode.
- No frame path may depend on an Automerge merge, Tarstate projection update,
  policy classification, durable cache write, or worker round trip.

## Vocabulary

Use Patchpit's existing surface vocabulary where possible.

- `Runtime`: the live Patchpit OS service behind the worker boundary.
- `Client`: one connected actor, such as a browser tab, headset, tablet,
  spatial laptop, agent bridge, BCI adapter, or sandbox host.
- `Workspace`: durable shell state for a working set of surfaces, contexts, and
  layout policy.
- `Context`: a running/session object for one app around one primary URL.
- `Surface`: a shell-visible container for contexts and tabs.
- `Viewport`: one client's local presentation of a surface.
- `Projection`: a Tarstate-derived read model over Automerge docs.
- `Intent`: a request for the runtime to do something.
- `Capability`: scoped authority granted to an app, context, or client.

Input is not intent. A mouse event, gaze ray, controller pose, agent message, or
BCI signal is local input. A routed action such as `route.open`,
`window.focus`, or `filesystem.move` is an intent.

## Public Operations

The public runtime API should stay small:

```ts
type RuntimeClient = {
  subscribeProjection(
    req: ProjectionSubscriptionRequest,
    listener: (event: ProjectionEvent) => void,
  ): ProjectionSubscription;

  submitIntent(req: IntentRequest): Promise<IntentResult>;

  openCapability(req: CapabilityRequest): Promise<CapabilityPort>;
};
```

These names are intentionally not generic RPC terms.

- `subscribeProjection` says the read side is Tarstate-derived.
- `submitIntent` matches Patchpit's surface protocol and shell routing model.
- `openCapability` says the returned port carries authority, not just messages.

Avoid public APIs named `getRepo`, `getDocHandle`, `changeDoc`, `command`, or
`view`. Those names either leak implementation authority or conflict with
Patchpit's `Viewport` concept.

The public protocol should not expose whether the runtime is local, worker
backed, or hosted elsewhere. The target deployment path is:

```txt
Client <-> RuntimeClient <-> SharedWorker runtime
```

The current V0 slice has not moved runtime ownership there yet. It gates boot
through a module SharedWorker hello/ack and then runs the bootstrap
`RuntimeClient` in the shell process. If the required boot platform is absent,
Patchpit should fail before booting the in-process scaffold.

Connection is lifecycle, not an app-facing operation. A runtime client must
complete the boot-gate handshake before exposing the three public operations.

## Scope

Every runtime request carries enough scope for policy, routing, and diagnostics.

```ts
type RuntimeScope = {
  clientId: string;
  workspaceId: string;
  viewportId?: string;
  surfaceId?: string;
  contextId?: string;
  appId?: string;
  subjectId?: string;
  capabilityId?: string;
};
```

`workspaceId` is required for every client request. Global projections such as
`appManifests.handlers` may ignore it for data selection, but policy,
diagnostics, and lifecycle still need to know which workspace the request came
from.

At the runtime boundary, `workspaceId` selects the durable workspace state for
surfaces, contexts, layout, and shell routing. Different clients may connect to
the same Patchpit OS while using different workspace ids. Local viewport state
remains client-owned unless an explicit shared workspace projection says
otherwise.

The same protocol should support visual and non-visual clients. An agent may
have no viewport. A BCI bridge may publish selection presence and submit an
activation intent. An XR headset may present a surface as an immersive space.
The runtime should not need separate APIs for those cases.

## Envelope And Lifecycle

The three public operations are convenience methods over one versioned worker
message envelope.

```ts
type RuntimeProtocol = 'patchpit.runtime@1';
type RuntimeBuildId = string;

type RuntimeConnectRequest = {
  protocol: RuntimeProtocol;
  id: string;
  buildId: RuntimeBuildId;
  clientKind: 'tab' | 'sandbox' | 'agent' | 'device-adapter';
  workspaceId: string;
  subjectId?: string;
  appId?: string;
};

type RuntimeConnectResult = {
  buildId: RuntimeBuildId;
  runtimeId: string;
  clientId: string;
  workspaceId: string;
};

type RuntimeHello = {
  protocol: RuntimeProtocol;
  type: 'hello';
  buildId: RuntimeBuildId;
  clientId: string;
  clientKind: 'tab' | 'sandbox' | 'agent' | 'device-adapter';
  workspaceId: string;
};

type RuntimeHelloAck = {
  protocol: RuntimeProtocol;
  type: 'helloAck';
  buildId: RuntimeBuildId;
  clientId: string;
  runtimeInstanceId: string;
  workspaceId: string;
};

type RuntimeConnectResponse = RuntimeResponse<RuntimeConnectResult>;

type RuntimeRequest<T> = {
  protocol: RuntimeProtocol;
  id: string;
  op: 'subscribeProjection' | 'submitIntent' | 'openCapability';
  scope: RuntimeScope;
  payload: T;
};

type RuntimeResponse<T> = {
  protocol: RuntimeProtocol;
  id: string;
  ok: boolean;
  payload?: T;
  error?: RuntimeError;
};

type RuntimeError = {
  code:
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
  message: string;
  reason?: string;
  metadata?: Record<string, Json>;
};

type RuntimeEvent =
  | {
      protocol: RuntimeProtocol;
      type: 'projection';
      subscriptionId: string;
      event: ProjectionEvent;
    }
  | {
      protocol: RuntimeProtocol;
      type: 'intentTicket';
      ticket: string;
      result: IntentResult;
    }
  | {
      protocol: RuntimeProtocol;
      type: 'capability';
      capabilityId: string;
      event: CapabilityEvent;
    };
```

Connection uses the same response discipline as normal requests. Successful
connection returns `RuntimeConnectResponse`. Unsupported protocol, unsupported
platform, invalid workspace, or denied subject failures return
`RuntimeResponse<never>` with a `RuntimeError`.

The runtime assigns a stable `clientId` during connection and uses it for every
later request from that client. Reconnecting creates a new client session unless
a future resume protocol explicitly says otherwise.

The boot-gate handshake is mandatory before the public operations are exposed.
The client names the SharedWorker with both protocol and build id, posts
`hello`, and waits for `helloAck`. Protocol mismatch, timeout, or build
mismatch is a runtime boot failure. On build mismatch the client may ask the
stale boot-gate worker to shut down and retry once with a cache-busted worker
URL; this is stale boot-gate recovery, not a degraded runtime path.

`RuntimeRequest.id` is a transport correlation id. It is not an idempotency key
and does not imply retry safety.

`RuntimeResponse` is the one-shot response to a request. `RuntimeEvent` is the
push channel for ongoing projection subscriptions, queued intent results, and
capability lifecycle events.

Projection subscriptions are lifecycle objects:

```ts
type ProjectionSubscription = {
  subscriptionId: string;
  close(): void;
};

type ProjectionEvent =
  | { type: 'snapshot'; snapshot: ProjectionSnapshot }
  | { type: 'patch'; patch: ProjectionPatch }
  | { type: 'reset'; snapshot: ProjectionSnapshot; reason?: string }
  | { type: 'error'; error: RuntimeError };
```

Patch sequence numbers are ordered only within one subscription. A client must
not compare sequence numbers across projections or across reconnects.

Projection events are delivered through `RuntimeEvent` with
`type: 'projection'` and the matching `subscriptionId`.

All request payloads must be validated before execution. Unknown operation names,
unknown capabilities, invalid scopes, invalid schema ids, or unknown top-level
fields must be rejected before policy or mutation work begins.

## Schemas And Versioning

Tarstate schemas are the projection and intent payload versioning boundary.
Operation names are stable semantic handles; `schemaId` carries compatibility.
The exact portable descriptor format is defined in
[`schema-protocol.md`](schema-protocol.md). Descriptors are stable protocol
headers: snapshots and durable documents may carry them, while normal patches
and state updates carry only `schemaId`.

```ts
type TarstateSchemaId = string;
type PatchpitSchemaHash = string;
type PatchpitRelationSchemaDescriptor = Record<string, Json>;
type AutomergeUrl = string;
type AutomergeHeads = readonly string[];
type AutomergeHeadSet = Record<AutomergeUrl, AutomergeHeads>;
type AnalysisBranchId = string;

type ProjectionBasis =
  | { kind: 'live' }
  | { kind: 'heads'; heads: AutomergeHeadSet }
  | { kind: 'analysisBranch'; branchId: AnalysisBranchId };

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type TarstateRow = Record<string, Json>;

type RelationSet = {
  relations: Record<string, readonly TarstateRow[]>;
};

type ProjectionSubscriptionRequest = {
  projection: string;
  schemaId: TarstateSchemaId;
  args?: Json;
  basis?: ProjectionBasis;
};

type TarstateIntentInput = {
  schemaId: TarstateSchemaId;
  relations: RelationSet['relations'];
};

type IntentRequest = {
  intent: string;
  input: TarstateIntentInput;
  baseHeads?: AutomergeHeadSet;
  idempotencyKey?: string;
};
```

`scope` lives only on the envelope. Operation payloads must not carry their own
scope; otherwise policy and routing can diverge between envelope and payload.

`AutomergeHeadSet` is keyed by Automerge URL because Patchpit state is a linked
document graph. Filesystem, workspace, and policy projections can span many
docs, and an intent may read or write more than one doc.

`ProjectionBasis` selects what Automerge state a projection reads:

- `live` follows the current runtime repo state and is the default.
- `heads` reads a fixed historical or otherwise explicit set of Automerge heads.
- `analysisBranch` reads a runtime-local temporary branch.

Projection basis affects reads only. Durable writes still go through
`submitIntent` and commit to normal live Automerge docs after policy,
precondition, and conflict checks.

V0 requests exactly one `schemaId`. A future negotiation layer may add an
ordered `accept` list, but V0 should reject unsupported schemas explicitly
instead of guessing a compatible shape.

Use:

```txt
projection: filesystem.tree
schemaId: patchpit.filesystem.tree@1

intent: filesystem.writeFile
input.schemaId: patchpit.intent.filesystem.writeFile@1
```

Avoid:

```txt
projection: filesystem.tree@1
intent: filesystem.writeFile@1
```

A runtime receiving a projection or intent request must either:

- serve the projection `schemaId` or accept the intent `input.schemaId`
  directly,
- translate through a declared Tarstate lens path,
- or reject with `schema_mismatch`.

It must not silently return "close enough" JSON.

Schema evolution is not required for the first implementation, but the protocol
shape should not prevent it. When evolution is available, reads and writes
should prefer relation patch translation over snapshot translation so intent is
preserved.

## Projections

Projections are named Tarstate relation sets, not component DTOs. They are read
models over Automerge docs, policy docs, runtime state, or ephemeral data.

```ts
type ProjectionSnapshot = {
  subscriptionId: string;
  projection: string;
  schemaId: TarstateSchemaId;
  schemaHash?: PatchpitSchemaHash;
  schema?: PatchpitRelationSchemaDescriptor;
  basis: ProjectionBasis;
  storageHeads?: AutomergeHeadSet;
  lensPath?: string[];
  relations: RelationSet;
};

type ProjectionPatch = {
  subscriptionId: string;
  seq: number;
  patch: RelationPatch;
  storageHeads?: AutomergeHeadSet;
};

type RelationPatch = {
  schemaId: TarstateSchemaId;
  format: 'tarstate.relationPatch@unstable';
  ops: readonly Json[];
};
```

`RelationPatch` is a Tarstate patch carrier, not a generic JSON patch. The
`@unstable` format marks that Tarstate still owns the operation vocabulary. V0
clients may choose snapshot/reset-only handling until a stable Tarstate patch
format lands, but the runtime must tag every patch with its format and schema.
Rows inside relation sets are Tarstate rows encoded for worker transport. Their
meaning comes from the accompanying Tarstate `schemaId`; clients must not treat
them as unversioned component DTOs.

Historical and branch projections use the same projection protocol as live
projections. Runtime caches must include `basis`, `schemaId`, projection name,
args, policy version, and lens path in their cache key. A projection computed
against one basis must never be applied to another basis.

Rules:

- Subscriptions are snapshot-first, patch-after.
- Patches are ordered per subscription.
- The runtime may send a reset when patch history is unavailable or too large.
- Clients must tolerate reset followed by a new snapshot.
- Projections may be redacted by policy, but redaction must still satisfy the
  advertised schema. If it cannot, return a different redacted schema or reject.
- Projection caches are disposable. Automerge remains canonical.

Initial projections:

```txt
filesystem.tree
appManifests.handlers
workspace.surfaces
workspace.contexts
workspace.layout
workspace.viewports
policy.effectiveGrants
presence.clients
```

`filesystem.tree` with `schemaId: patchpit.filesystem.tree@1` returns one
relation:

```ts
relations.nodes: FilesystemTreeNodeRow[];

type FilesystemTreeNodeRow = {
  url: string;
  parentUrl: string | null;
  isRoot: boolean;
  position: number;
  name: string;
  kind: 'folder' | 'file';
  type: string;
  title: string | null;
  mediaType: string | null;
  sourceUrl: string | null;
  text: string;
};
```

`url` identifies the backing resource. `parentUrl`, `isRoot`, and `position`
describe the projected tree shape without exposing folder `entries` blobs.
`kind` is the UI tree kind; `type` is the Patchpit document/resource type.
`mediaType`, `sourceUrl`, and `text` carry the current viewer metadata. A
runtime may derive this relation from `FilesystemIndexDoc`, but must not expose
`FilesystemIndexRow`, `filesystemIndex.documents`, or a public `documents`
relation for this projection.

`workspace.viewports` is for shared viewport membership or presence-like facts,
such as which client is presenting which surface. It is not the default home for
local viewport geometry, camera, pointer focus, or device form state.

The current `FilesystemIndexDoc` remains an internal projection/cache, not a
portable runtime payload or interchange schema.

## Historical Reads And Analysis Branches

Patchpit should support reading past Automerge state and runtime-local temporary
branches without making those branches canonical.

Use cases:

- rewind a workspace or file tree to past heads for analysis,
- compare two historical states,
- run Tarstate projections on a fork in a worker,
- let an agent or classifier inspect a speculative branch,
- test a write lens or migration before committing anything durable.

The public protocol should depend on stable Automerge concepts: document URLs,
heads, changes, and object ids. If Automerge exposes a convenient fork, clone,
or historical-view API, the runtime can use it internally. The protocol should
not expose that implementation detail.

Temporary analysis branches are runtime-local:

- not synced,
- not normal cache entries,
- not visible in normal workspace projections,
- not durable unless a later explicit intent commits a result,
- evicted when their capability/session expires.

An analysis branch may be created and managed behind a capability such as
`analysis.branch`. Branch-scoped projections use
`basis: { kind: 'analysisBranch', branchId }`.

Rewound reads use `basis: { kind: 'heads', heads }`. Policy still applies to the
requested basis: old heads can contain material that current policy would block
or redact. Historical access is not automatically safer than live access.

Speculative branch edits must not be merged into canonical docs by sharing raw
Automerge changes directly with apps. To make a speculative result durable, the
client submits a normal intent against live docs with explicit `baseHeads`. The
runtime may reject or conflict that intent if live state has moved on.

## Intents

Intents are the write and routing surface. Tarstate write lenses and Automerge
changes are implementation details behind the runtime boundary.

```ts
type IntentResult =
  | {
      status: 'committed';
      heads: AutomergeHeadSet;
      effects?: RelationPatch[];
      policy?: AppliedPolicyEffects;
    }
  | {
      status: 'queued';
      ticket: string;
    }
  | {
      status: 'rejected';
      error: RuntimeError;
    }
  | {
      status: 'conflict';
      currentHeads: AutomergeHeadSet;
      error?: RuntimeError;
    }
  | {
      status: 'quarantined';
      reason: string;
    };

type AppliedPolicyEffects = {
  transformed?: boolean;
  obligations?: readonly Json[];
  reason?: string;
};
```

`idempotencyKey` scopes retries for one subject, workspace, intent name,
input schema, and Tarstate input. Repeating the same idempotency key with the
same request must not perform the durable mutation twice. Reusing the same key
with different request data must be rejected. Requests without an idempotency key
may execute more than once if a client retries after losing the response.

A `queued` result must later resolve through a `RuntimeEvent` with
`type: 'intentTicket'` while the client session remains connected. The eventual
ticket result should be terminal: `committed`, `rejected`, `conflict`, or
`quarantined`. V0 does not guarantee durable ticket history across reconnects;
clients that need retry safety should use `idempotencyKey`.

If policy transforms a durable intent before commit, the committed result must
report that through `policy.transformed` or `policy.obligations`. Policy must not
silently transform a durable write without surfacing that fact to the caller.

Initial route intents come from the surface protocol:

```txt
route.preview
route.open
route.reveal
route.activate
```

Initial filesystem and shell intents:

```txt
app.launch
filesystem.writeFile
filesystem.mkdir
filesystem.move
filesystem.delete
filePicker.selectUrl
filePicker.toggleFolder
window.focus
window.pinPreview
window.closeContext
window.moveTab
window.resizeSplit
asset.commitImport
asset.classify
asset.approveShare
```

`route.open` is the public request to open or reuse a durable pinned context.
Lower-level context creation is a runtime/window-manager effect, not a separate
public intent in V0.

The V0 app launch intent input is a Tarstate relation set:

```ts
intent: app.launch
input.schemaId: patchpit.intent.appLaunch@1

relation requests:
  id: string
  app: string
  behavior: 'open-context' | 'toggle-surface'
  context?: WindowContext
  role: 'document-set' | 'workspace-view'
  slot?: string
```

`slot` names the app-managed persistent state instance for launches that do not
provide an explicit `context`. It defaults to `default` and must be a non-empty
string. The runtime combines app id and slot for handler-local reuse, while the
canonical state remains the app's Automerge state doc under `/system/apps`.
Tarstate projects and write lenses sit over that doc shape; app state docs are
not flattened just to make launch admission convenient.

If `context` is present, the runtime validates that the context app matches the
request, the backing URL is still available, and any existing context id still
targets the same app and URL. If `context` is absent, the app manifest's matching
surface must declare a persisted `state` type and the runtime must have a
managed launch state handler for it. The current slice implements that managed
path for the terminal app only: terminal launch omits `context`, uses
`behavior: 'open-context'`, targets `role: 'document-set'`, and creates or
reuses a terminal state doc through a handler-local `terminal:<slot>` key. The
document itself is a normal terminal state resource registered under
`/system/apps`.

`app.launch` uses explicit failure states so callers do not infer placement or
state ownership from a generic rejection:

- `schema_mismatch`: request used a schema other than
  `patchpit.intent.appLaunch@1`.
- `bad_request`: the relation set is malformed, the slot is empty, terminal
  supplied a context, or required terminal behavior/role is wrong.
- `missing_handler`: the app is not installed, has no matching surface state, or
  no managed state handler exists for a context-less launch.
- `policy_denied`: runtime policy rejected launch before mutation.
- `stale_target`: `baseHeads` or an explicit context target no longer matches
  the current window-manager/filesystem state.
- `conflict`: no compatible surface can accept the launch.
- `commit_error`: state creation or the window-manager commit failed after
  admission.

The V0 route intent input is a Tarstate relation set:

```ts
intent: route.open | route.preview
input.schemaId: patchpit.intent.route@1

relation requests:
  id: string
  url: string
  rootUrl?: string
  sourceSurfaceId?: string
  target?: Json
  title?: string
```

`sourceSurfaceId` lets preview/open avoid replacing the source file-picker
surface. `target` is the window-manager drop target for drag-and-drop opens.
The runtime validates the relation before mutating window-manager state.

The V0 window intent input is also a Tarstate relation set:

```ts
intent:
  | window.focus
  | window.closeContext
  | window.pinPreview
  | window.moveTab
  | window.resizeSplit

input.schemaId: patchpit.intent.window@1

relation requests:
  id: string
  contextId?: string
  path?: readonly Json[]
  ratio?: number
  sourceSurfaceId?: string
  surfaceId?: string
  target?: Json
```

Each window intent validates its required fields before applying the
window-manager write lens. Missing or malformed targets are rejected instead of
being treated as a no-op or a different placement.

`asset.import` is a capability for staged import access. `asset.commitImport` is
the durable intent that commits an approved staged asset into normal Patchpit
state.

`filesystem.move` must preserve semantic move intent. Until Automerge exposes
native object moves, the runtime records semantic moves on doc roots as
`__automergeMoves` keyed by `getObjectId`. Copy/delete must not be treated as an
identity-preserving move.

## Capabilities

Capabilities are scoped authority. A capability may be represented by a
`MessagePort`, but the public concept is authority, not transport.

```ts
type CapabilityRequest = {
  capability: string;
  verbs?: string[];
};

type CapabilityGrant = {
  capabilityId: string;
  capability: string;
  verbs: readonly string[];
  bounds?: CapabilityBounds;
  endpoint?: CapabilityEndpoint;
  schemas?: Record<TarstateSchemaId, PatchpitRelationSchemaDescriptor>;
};

type CapabilityEndpoint = {
  protocol: string;
  rootUrl?: string;
  rootUrls?: readonly string[];
  initialPaths?: readonly string[];
  initialPathsByRoot?: Readonly<Record<string, readonly string[]>>;
};

type CapabilityBounds = {
  maxItems?: number;
  maxBytes?: number;
  ttlMs?: number;
};

type CapabilityPort = {
  grant: CapabilityGrant;
  port: MessagePort;
  close(): void;
};

type CapabilityEvent =
  | { type: 'ready'; grant: CapabilityGrant }
  | { type: 'revoked'; reason?: string }
  | { type: 'error'; error: RuntimeError };
```

Initial capabilities:

```txt
filesystem.read
filesystem.write
terminal.filesystem
context.control
surface.place
viewport.present
presence.publish
analysis.branch
asset.import
agent.suggestIntent
export.request
```

Sandboxed apps must not receive raw `Repo`, unrestricted `DocHandle`, or broad
storage access. They receive capabilities bound to subject, app, workspace,
context, document, object, projection, and allowed verbs.

The runtime may revoke a capability at any time when policy, workspace, app, or
client lifecycle changes. Capability users must treat port closure as revocation,
not as a retryable transport failure.

The effective grant may be narrower than the request. Clients must use the
returned `CapabilityGrant`, not the original request, when deciding allowed
verbs, TTLs, and queue bounds.

Capability lifecycle events are delivered through `RuntimeEvent` with
`type: 'capability'`. Capability-specific traffic uses the returned
`MessagePort`.

### Terminal Filesystem Capability

`terminal.filesystem` exposes a scoped `just-bash` filesystem over a capability
port. The bootstrap runtime serves it from the canonical Patchpit filesystem,
and terminal UIs consume the returned port instead of raw `Repo` or `DocHandle`
authority.

The grant endpoint is explicit:

```ts
const terminalFilesystemCapability = 'terminal.filesystem';
const terminalFilesystemProtocol = 'patchpit.terminal.filesystem@1';

type TerminalFilesystemCapabilityGrant = CapabilityGrant & {
  capability: 'terminal.filesystem';
  verbs: readonly ('read' | 'write' | 'stat' | 'list' | 'mount')[];
  endpoint: {
    protocol: 'patchpit.terminal.filesystem@1';
    rootUrl: string;
    rootUrls: readonly string[];
    initialPaths: readonly string[];
    initialPathsByRoot?: Readonly<Record<string, readonly string[]>>;
  };
};
```

Port traffic is request/response. `rootUrl` selects the mounted Automerge root
for the operation, so overlay mounts use the same capability without receiving
broad filesystem authority.

```ts
type TerminalFilesystemRequest = {
  protocol: 'patchpit.terminal.filesystem@1';
  id: string;
  capabilityId: string;
  rootUrl: string;
  op: TerminalFilesystemOperation;
  args: readonly unknown[];
};

type TerminalFilesystemResponse =
  | { protocol: 'patchpit.terminal.filesystem@1'; id: string; ok: true; result?: unknown }
  | { protocol: 'patchpit.terminal.filesystem@1'; id: string; ok: false; error: { code?: string; message: string } }
  | { protocol: 'patchpit.terminal.filesystem@1'; type: 'closed'; error: { code?: string; message: string } };
```

`rootUrls` is an allow-list. The server rejects requests for roots outside the
grant and the bootstrap grant currently derives that list from the terminal
container's Automerge mounts. Copy and move require both `read` and `write`
verbs. `initialPathsByRoot` seeds the client's synchronous `getAllPaths()` cache;
successful path-changing operations update that cache locally instead of forcing
a full server tree walk. The serving side sends `type: 'closed'` before
revocation so clients can reject in-flight filesystem calls.

## Realtime Capabilities

Realtime is intentionally not a fourth public operation. It is authority granted
through `openCapability`.

```ts
type RealtimeMessage = {
  topic: string;
  mode: 'replace-latest' | 'append-bounded';
  ttlMs: number;
  key?: string;
  data: Json;
};
```

Presence, previews, pointer state, gaze, controller poses, provisional
selection, and agent draft state should use realtime capabilities such as
`presence.publish`. They must not go through `submitIntent` unless the user or
app is committing a durable semantic action.

Realtime capability queues are bounded. `replace-latest` messages with the same
topic and key may overwrite older messages. Expired messages are dropped without
becoming Automerge changes, durable Tarstate rows, or cache entries.

For `append-bounded`, the effective capability grant must define `maxItems`,
`maxBytes`, or both. Message-level data must not expand the grant.

## Policy

Policy is a runtime decision service. It is not storage, sync, rendering,
Tarstate schema design, Automerge mutation mechanics, or app business logic.

Policy answers:

- Who is asking?
- What operation is requested?
- What doc, object, field, projection row, asset, or cache entry is affected?
- What labels, grants, origin, retention, and sharing scope apply?
- What effect and obligations are required?

```ts
type PolicyDecision = {
  effect: 'allow' | 'deny' | 'transform' | 'quarantine';
  redactions?: Json[];
  obligations?: Json[];
  reason?: string;
};
```

Classifiers produce labels. Policy decides what those labels mean.

Policy gates every trust boundary:

```txt
external -> Patchpit
Patchpit -> Automerge
Patchpit -> cache
Patchpit -> sync/share
Patchpit -> display/projection
Patchpit -> sandboxed app
Patchpit -> export
```

Policy state should itself be durable Automerge state when history matters,
such as grants, groups, sharing rules, app permissions, peer trust, and human or
system verdicts. Tarstate projects that state into fast indexes.

The Service Worker may enforce boot/cache decisions from a cached policy
snapshot, but the authoritative policy service lives in the runtime.

Admission is a policy boundary. Unapproved bytes and blocked material must not
enter the normal shared Automerge repo or broad shared caches. Import, asset
fetch, and inbound sync flows should stage unknown material in a local
quarantine store or quarantine repo until policy allows normal projection,
cache, display, share, or export.

Inbound sync from untrusted peers is admitted in two steps:

```txt
remote material -> quarantine repo/store -> policy/classification -> normal repo
```

Quarantine data is not projected into normal workspace views and is not shared
onward unless policy explicitly releases it.

## Runtime Placement

Logical services and browser workers are separate concerns.

```txt
ServiceWorker:
  boot
  static/app cache
  fetch interception
  update/version/kill switch
  cached policy snapshot for early denial

Target SharedWorker runtime:
  Automerge repo
  sync/networking
  Tarstate shared IVM
  projection subscriptions
  intent routing
  authoritative policy decisions
  capability broker
  workspace/session coordination

Dedicated workers:
  classifiers
  expensive import/decode/index jobs
  optional realtime/game workers

Clients:
  render projections
  keep local viewport state
  translate input into presence or intents
```

The current boot gate is the implemented runtime contract for this slice:

```txt
secure context
SharedWorker
crypto.randomUUID
module SharedWorker hello/ack with the page build id
```

The target shared runtime will also require:

```txt
Worker
MessageChannel
transferable ArrayBuffer
ServiceWorker
Cache API
IndexedDB
WebSocket usable from worker
worker ES modules, if the target runtime worker is a module
```

The platform probe must test behavior, not just constructor presence when a
feature becomes required by implemented code. Planned features may be shown in
diagnostics, but they must not block the shell before they are on the boot path.
Boot uses the real module SharedWorker URL for the hello/ack handshake, so a
stale, missing, or non-module worker fails before the shell renders. The app
callsite must expose the worker entry to Vite as a SharedWorker URL or literal
SharedWorker constructor so production builds emit a compiled worker chunk
instead of embedding the TypeScript source as a generic asset. If a required
feature is missing or fails the probe, Patchpit shows an unsupported
browser/device screen. There is no dedicated-worker fallback, BroadcastChannel
leader mode, or degraded multi-tab runtime in V0/V1.

Some failures happen before any runtime owner can exist; those produce the local
unsupported-browser screen directly. `unsupported_platform` is for failures the
boot gate or runtime detects after a connection attempt starts.

## Runtime State Docs

Runtime and worker state that should be inspected by users or developers lives
under `/system/runtime` as normal visible Automerge docs. The current slice
seeds `/system/runtime/runtime-boot-gate.am` with the runtime protocol id, build
id once `helloAck` is recorded, runtime instance id when available, boot status,
current required boot features, target shared-runtime features, and ownership
notes.

That document deliberately says the SharedWorker is only the boot gate, while
the in-process bootstrap runtime still owns seed Automerge handles until the
implementation moves into the SharedWorker. This keeps the decomplection
question visible without pretending ownership has moved before it has.

## Hot Path And Latency

Define latency by path, not app domain.

- Frame path: input sampling, local prediction, rendering, and local view state.
  It must not await Automerge, Tarstate, sync, or worker round trips.
- Realtime path: presence, previews, and multiplayer low-latency signals. It may
  be lossy, replace-latest, and non-durable.
- Durable path: Automerge mutations, sync, persistence, history, and semantic
  moves. It should be correct and convergent, not frame-critical.
- Projection path: Tarstate IVM updates and pushes relation patches
  asynchronously.

The worker split helps when Automerge merges, sync, persistence, indexing,
projection maintenance, policy evaluation, and classification leave the frame
path. It hurts when clients need a worker round trip or large structured clone
inside the frame path.

The hot path is intentionally smaller than the runtime protocol:

```txt
local input -> local presentation/prediction
local input -> optional realtime publish
semantic action -> submitIntent -> durable runtime
```

`subscribeProjection` is not a frame dependency. Projections update UI and
durable read models asynchronously. Clients may keep local frame state derived
from the latest projection snapshot, but they must not block a frame while
waiting for projection patches.

`submitIntent` is not the low-latency input path. It is the durable semantic
action path. A game, XR surface, agent bridge, or BCI adapter can provide local
feedback immediately and reconcile later when the runtime commits or rejects the
intent.

Realtime signals should be bounded and replace-latest where possible. They are
not Automerge documents, not Tarstate durable rows, and not a substitute for
committed intents.

## Verification Strategy

Prefer a small number of deterministic tests plus fuzzing/property tests at the
runtime boundary. The goal is fewer example tests and more invariant coverage.

Keep deterministic tests for:

- platform probe failure and success,
- initial runtime connect,
- first projection snapshot,
- projection event delivery,
- historical projection by explicit Automerge heads,
- one committed intent,
- one queued intent resolving by ticket event,
- one rejected policy decision,
- one capability open and revoke,
- one narrowed capability grant,
- one Service Worker cache version transition.

Use fuzzing/property tests for:

- protocol envelope parsing and unknown-field rejection,
- projection snapshot plus patch application equals reset snapshot,
- relation patch ordering and idempotency,
- schema negotiation and `schema_mismatch` diagnostics,
- intent idempotency keys and retry behavior,
- multi-document Automerge head-set accounting,
- projection cache keys include projection basis,
- policy decision consistency across read/display/cache/share/export gates,
- redaction preserving or intentionally changing schema,
- effective capability grants and realtime queue bounds,
- Automerge semantic move records keyed by object identity,
- worker restart and resubscribe behavior,
- cache purge obligations after policy label changes.

Fuzz generated data should be schema-aware. Tarstate schemas define relation
shape, keys, refs, optionality, nullability, and ephemeral relations, so fuzzers
should generate valid and invalid relation sets from those schemas instead of
random unstructured JSON.

Do not use broad mocked unit-test matrices to compensate for unclear ownership.
If an invariant is hard to fuzz or test, that usually means the protocol
boundary is too vague.

## Decomplection Checks

A runtime requirement belongs here when it answers one of these:

- Who owns canonical state?
- Who owns derived state?
- Who may mutate docs?
- Who decides what a client or app can read, write, cache, display, share, or
  export?
- What survives worker restart?
- What can be rebuilt from Automerge?
- What is shared across clients versus local to one viewport?

A requirement is suspicious when it combines:

- sync plus query semantics,
- workspace permissions plus document mutation mechanics,
- projection cache plus canonical persistence,
- browser worker topology plus business behavior,
- app-specific rendering features plus runtime protocol,
- device input details plus semantic intents.

## V0 Boundary

The first implementation should only prove the boundary. Current code has
landed the handshake gate and the first shell extraction scaffold:

- `@patchpit/system/runtime` exports protocol types, platform probing,
  SharedWorker boot-gate connection/handshake helpers, boot-gate worker naming,
  stale-build retry, and Automerge head-set helpers.
- `apps/shell/src/runtime/shared-worker.ts` is a thin Vite module SharedWorker
  entry that accepts the mandatory hello/ack handshake and shuts down on stale
  build or dev reload.
- `apps/shell/src/runtime/bootstrap-runtime.ts` is an explicit in-process
  scaffold for the first boundary slice. It owns the raw seed `DocHandle`s for
  this slice, serves `filesystem.tree`, admits app launch, file-picker, route,
  and window intents through a policy hook, and commits their effects to the
  relevant system docs.
- `/system/runtime/runtime-boot-gate.am` is a visible Automerge runtime state
  doc for the current SharedWorker boot gate plus in-process bootstrap slice;
  `App.tsx` records the boot-gate `helloAck` into it after boot.
- `App.tsx` gates shell render on the runtime platform probe plus worker
  boot-gate handshake. Missing features or handshake failures show diagnostics
  and do not boot a compatibility runtime.
- File picker open/preview and file drag/drop now go through
  `submitIntent(route.open | route.preview)` instead of direct viewer context
  construction in the UI.
- Normal window controls now go through window intents for focus, close,
  preview pinning, tab drops, and split resize.
- Terminal filesystems now open through
  `openCapability('terminal.filesystem')`. The shell UI consumes a scoped
  port-backed adapter instead of constructing the raw filesystem from
  `Repo`/`DocHandle` authority.

Next work:

- Move the bootstrap runtime implementation into the SharedWorker so tabs share
  the same Automerge repo and Tarstate IVM.
- Move window-manager desktop state behind
  `subscribeProjection('workspace.surfaces')`,
  `subscribeProjection('workspace.contexts')`, and
  `subscribeProjection('workspace.layout')`.
- Add runtime boundary metrics.

Delete or quarantine the in-process scaffold once the worker path owns the
boundary. It must not remain as a fallback for unsupported browsers or failed
worker handshakes.

## Later Milestones

These are capability milestones, not release promises.

- V1: shared Automerge networking, Tarstate IVM, app contexts, workspace-scoped
  layouts, and sandbox capability ports in the runtime.
- V2: policy and sharing hardening, quarantine, classifier workers, redacted
  projections, audit, and cache purge obligations.
- V3: realtime/presence path for multiplayer feel, separated from durable
  Automerge commits.
- V4: Tarstate schema negotiation and lens-backed compatibility for projection
  and intent payloads.
- V5: `/srv` live services and Royal-style asset manifests, residency, and
  brokered resource loading.

## Open Questions

- Are projection names rooted under workspace/system namespaces, or kept as
  flat semantic handles such as `filesystem.tree`?
- What is the first durable shape for policy docs under `/system`?
- What is Tarstate's first stable relation patch operation vocabulary?
- Which Automerge fork/historical-view API should back `analysisBranch`
  internally for the pinned Automerge version?
- Which runtime metrics should be persisted versus only emitted as ephemeral
  Tarstate relations?
- Should capability names be global strings or manifest-scoped names?
- Which minimum browser engine versions does the platform probe target?
