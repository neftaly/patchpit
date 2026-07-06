# State Visibility TODO

This list tracks runtime and system state that should be visible through a
state/debug surface. Normal user file/folder documents and canonical state docs
stay in the file picker or document viewers; State Browser keeps live runtime
diagnostics and derived projections.

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
- Runtime projection catalog with advertised schema ids, schema hashes, owners,
  descriptions, and supported basis kinds.
- Generic live projection inspector for catalog rows, relation row counts,
  selected snapshot metadata, subscription lifecycle, event counters,
  storage-head summaries, and latest event diagnostics.
- Intent request/result log with request relation counts, outcomes, timings, and
  thrown errors.
- Window-manager surface/context/layout summary.
- Current policy/capability placeholder behavior in the bootstrap runtime.

## Remaining Gaps

- Boot connection errors before the shell reaches the normal app surface are
  only shown on the unavailable screen because the State Browser is not mounted.
- Runtime issue history is session-local and bounded; entries do not yet carry
  affected intent ids, recovery status, or durable failure-relation rows.
- Policy and capability state is still mostly hard-coded placeholder behavior;
  there is no visible effective grants/quarantine/revocation state.
- Projection diagnostics include the live projection catalog and current
  snapshots, but there is no historical basis browser or full patch inspector.
- Schema catalog and document schema ref detail are not currently covered by
  State Browser.
- Client/session/presence/viewport state is protocol-shaped in docs but not
  implemented as inspectable runtime state yet.
