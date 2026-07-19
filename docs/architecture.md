# Patchpit architecture

## A1. State ownership

| State | Owner | Representation |
| --- | --- | --- |
| Files, folders, links, and durable workspace | Canonical storage | Automerge documents |
| Logical relations, authority, readiness, queries, and source-routed writes | Tarstate | Attachments, projections, and transactions |
| Selection, previews, and recent context history | Patchpit presence | Per-client Tarstate relational external-store database |
| Pointer resize drafts and drag sessions | React component runtime | Local ephemeral state |
| Live same-origin replica transport | Browser host | Deployment-scoped Automerge Repo BroadcastChannel adapter |
| Generated participant display identity | Patchpit browser profile | Origin-local opaque ID; label/color projection only crosses the sandbox port |
| Immutable launched application files | Sandbox boundary | Authority-scoped snapshot and cache mount |
| Editor text and character identity | Canonical storage | Patchwork-compatible Automerge text document |
| Editor focus, selection, and mounted participants | Automerge Repo Presence | Per-document ephemeral sessions, profile identity, and Automerge cursors |
| In-progress input and composition | Sandboxed editor runtime | Local EditContext session and semantic splice intents |
| Editor authority and revision lifecycle | Patchpit root/content runtime | Host-owned document session and versioned MessagePort |
| Ordinary file views | Tarstate query, projected by Patchpit content UI | Exact logical file rows and readiness evidence |
| Owned raw document inspection | Patchpit root view source | Conflict-aware immutable snapshots subscribed to Automerge heads |
| Cross-source resource progress | Patchpit root runtime over Tarstate receipts | Pure graph classifier plus source-local transactions and lifecycle operations |

State crosses an owner boundary through a projection, canonical writer, or
explicit attached source. Patchpit does not mirror Tarstate readiness or raw
Automerge handles inside application state.

The root runtime owns Automerge handles and attached database lifecycles.
Ordinary viewers observe logical file relations through a closeable Tarstate
query. The owned workspace inspector receives only immutable presentation
snapshots from a head-subscribed root view source. Only editor and
canonical-writer boundaries that require source-native identity receive a
host-owned document session.

The browser root host owns the Repo it creates for its default transport. A
Repo supplied by a container remains owned and shut down by that container.

## A2. Workspace update flow

User intent is lowered by the functional core into a workspace plan. A plan
contains the projected next durable workspace, an optional semantic durable
operation, and reconciled per-client view state. The imperative shell serializes
the durable operation, reads the committed projection, then reconciles and
commits presence. Failed or unknown durable receipts do not advance presence.

## A3. Identity and presentation

Context and filesystem link IDs are stable identity. Pane membership, order,
name, path, and selection are facts about that identity. Presentation combines
durable workspace rows with ephemeral previews. The active editor is derived
from recent context history and editor eligibility; it is not another mutable
pane or context field.

## A4. Input protocols

State machines are reserved for temporal protocols with invalid intermediate
combinations. Sandbox installation is a `loading | ready | unavailable`
lifecycle. Dragging is an optional session that owns both drag data and its
current validated drop preview. Pointer resize has one captured pointer and one
draft ratio. Selection and layout remain ordinary declarative transitions.

The Markdown editor has one host-owned document-session protocol. The app opens
a relative document path, observes detached replacement projections, submits
basis-bound semantic splices, and publishes local selection for the matching
opaque revision. The host converts selection offsets to Automerge cursors and
back. Each mounted editor session owns one retained Tarstate text-intent session:
an in-flight publication atomically captures its pending prefix while later
dependent input remains a source-native suffix for the next publication.
The host materializes selection at a committed receipt's exact Automerge basis,
even when its live handle has advanced. Rejected, unknown, or unresolvable
results retain the local draft and stop writes; Patchpit never rebases numeric
offsets itself.

## A5. Sandbox boundary

The host creates an immutable app snapshot from exact Tarstate projections and
mounts it through the browser adapter. Applications receive normal relative
URLs, not a Repo, document handle, source handle, credentials, or host iframe
state. The trusted same-origin profile bridges interaction events so host editor
selection follows interaction inside nested frames, and grants each app instance
a narrow versioned MessagePort. Relative document requests are resolved within
the app folder's authority; source handles remain host-only.

## A6. Source organization

- `src/browser/` contains browser-only hosts, service-worker glue, and demo seed.
- `src/root/` owns root invocation and root-document lifecycle.
- `src/content/` projects and presents filesystem resources and applications.
- `src/workspace/` owns durable semantics, presence, planning, layout, and UI.
- `packages/artifacts/` owns canonical schemas, mappings, constraints, and
  generated bindings.
- `packages/fs/` owns logical filesystem relations and queries.
- `packages/automerge-fs/` owns Automerge filesystem adapters.
- `packages/sandbox-fs/` owns authority-scoped immutable app projection.
- `packages/sandbox/` owns mount and runner contracts.
- `apps/markdown-editor/` owns local text input, rendering, and the app side of
  the editor port; it owns no canonical document or replica.

## A7. Cross-source operations

The resource-transfer functional core classifies an exact folder-graph
projection into a next source-local operation, completion, no-op, or explicit
block. The root shell re-projects before each step and delegates source writes,
non-atomic batches, lifecycle creation, and nested receipts to Tarstate.
Relocation is recoverable from canonical link postconditions. Copy preparation
captures an exact file basis; its document-creation idempotency is scoped to the
open root's memory-backed lifecycle epoch. Patchpit does not mirror a workflow
state machine or imply cross-source atomicity.

The content layer owns only the open modal and its same-operation retry attempt.
Closing a settled dialog discards its receipt presentation; canonical progress
remains visible through the resource graph.
