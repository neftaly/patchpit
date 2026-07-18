# Patchpit architecture

## A1. State ownership

| State | Owner | Representation |
| --- | --- | --- |
| Files, folders, links, and durable workspace | Canonical storage | Automerge documents |
| Logical relations, authority, readiness, queries, and source-routed writes | Tarstate | Attachments, projections, and transactions |
| Selection, previews, and recent context history | Patchpit presence | Per-client attached external source |
| Pointer resize drafts and drag sessions | React component runtime | Local ephemeral state |
| Immutable launched application files | Sandbox boundary | Authority-scoped snapshot and cache mount |

State crosses an owner boundary through a projection, canonical writer, or
explicit attached source. Patchpit does not mirror Tarstate readiness or raw
Automerge handles inside application state.

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

## A5. Sandbox boundary

The host creates an immutable app snapshot from exact Tarstate projections and
mounts it through the browser adapter. Applications receive normal relative
URLs, not a Repo, document handle, source handle, credentials, or host iframe
state. The trusted same-origin profile bridges interaction events only so host
editor selection follows interaction inside nested frames.

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
