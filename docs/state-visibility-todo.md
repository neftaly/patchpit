# State Visibility TODO

This list tracks runtime and system state that should be visible through a
state/debug surface. Normal user file/folder documents stay in the file picker;
state-shaped Automerge docs are also inspectable in the State Browser because
the viewer does not render their raw document shape.

## Upstream Candidates

- Consider upstreaming generic Tarstate relational machinery once the Patchpit
  shapes settle: single-row intent relation envelope helpers and strict/tool
  validation for relation rows.

## Decision

- Durable `/system/runtime` docs stay in the filesystem as normal inspectable
  Automerge state.
- Derived/debug state belongs in the State Browser and Tarstate projections, not
  in automatic filesystem materializations.
- A read-only `/srv` export can be added later for service-style inspection, but
  it should remain an export of runtime/projection state rather than canonical
  storage.

## Covered By State Browser

- Runtime boot gate ack/status from the runtime state doc and SharedWorker ack.
- Current runtime issue banner state and bounded session issue history with
  observed time and source.
- Runtime platform and feature checks.
- Current filesystem projection status, subscription lifecycle, event counters,
  storage-head document summaries, and latest event diagnostics.
- Canonical non-file/folder state documents, including filesystem visibility
  metadata that distinguishes file-tree-reachable docs from hidden docs such as
  the filesystem index.
- Full current derived filesystem and workspace projection snapshots.
- Intent request/result log with request relation counts, outcomes, timings, and
  thrown errors.
- Window-manager surface/context/layout summary.
- System schema catalog refs and observed document schema refs.
- Current policy/capability placeholder behavior in the bootstrap runtime.

## Remaining Gaps

- Boot connection errors before the shell reaches the normal app surface are
  only shown on the unavailable screen because the State Browser is not mounted.
- Runtime issue history is session-local and bounded; entries do not yet carry
  affected intent ids, recovery status, or durable failure-relation rows.
- Policy and capability state is still mostly hard-coded placeholder behavior;
  there is no visible effective grants/quarantine/revocation state.
- Projection diagnostics include current snapshots and bootstrap subscription
  entries, but there is no general projection catalog, historical basis browser,
  or full patch/storage-head inspector.
- Schema refs are visible as refs/catalog summaries, but there is no dedicated
  schema-detail browser or ref integrity checker.
- Client/session/presence/viewport state is protocol-shaped in docs but not
  implemented as inspectable runtime state yet.
