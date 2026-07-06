# State Visibility TODO

This list tracks runtime and system state that should be visible through a
state/debug surface. Normal user file/folder documents and canonical state docs
stay in the file picker or document viewers. Runtime diagnostics are a dev-only
shell surface for ephemeral session state and live projection status.

## Upstream Candidates

- Consider upstreaming generic Tarstate relational machinery once the Patchpit
  shapes settle: single-row intent relation envelope helpers and strict/tool
  validation for relation rows.

## Decision

- Durable `/system/runtime` docs stay in the filesystem as normal inspectable
  Automerge state.
- Derived/debug state belongs in Tarstate projections, runtime diagnostics, or
  explicit service exports, not in automatic filesystem materializations.

## Covered

- Runtime boot gate ack/status from the runtime state doc and SharedWorker ack.
- Current runtime issue banner state and bounded session issue history with
  observed time and source in dev diagnostics.
- Runtime platform and feature checks.
- Current runtime projection subscriptions and failures in dev diagnostics.
- Intent request/result log with outcomes, timings, and thrown errors in dev
  diagnostics.
- Window-manager surface/context/layout summary through `workspace.layout`.
- Current policy/capability placeholder behavior in the bootstrap runtime.

## Remaining Gaps

- Boot connection errors before the shell reaches the normal app surface are
  only shown on the unavailable screen because dev diagnostics are not mounted.
- Runtime issue history is session-local and bounded; entries do not yet carry
  affected intent ids, recovery status, or durable failure-relation rows.
- Policy and capability state is still mostly hard-coded placeholder behavior;
  there is no visible effective grants/quarantine/revocation state.
- Projection diagnostics do not yet include a historical basis browser or full
  patch inspector.
- Schema catalog and document schema ref detail are not fully covered by
  diagnostics.
- Client/session/presence/viewport state is protocol-shaped in docs but not
  implemented as inspectable runtime state yet.
