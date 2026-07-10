# Agent Instructions

## State Ownership

Before adding or changing state machinery, choose the owning layer first:
canonical storage, Tarstate relational machinery, or Patchpit product/runtime
semantics. Keep state logic in that layer, using projections or canonical
writers at boundaries.

## Tarstate Direction

Tarstate v1 is the target but is not wired here yet. Do not call hypothetical
APIs or build Patchpit-local substitutes; pause or escalate dependent work.

The target boundary keeps application data in canonical Automerge documents or
explicitly attached stores. Tarstate supplies authority-scoped projections,
queries, parsing/issues, simulation, and source-routed writes. Sandboxed apps
must not receive raw foreign handles or iframe state.

In the target model, incomplete sources are not empty relations, one source is
the atomic write boundary, and cross-source work is explicitly non-atomic.

Schemas describe logical meaning; storage layout, authority, lifecycle, and
physical indexes belong to mappings, bindings, or runtime. Generic gaps belong
upstream in Tarstate.

Regenerate generated artifacts from their canonical source rather than
hand-editing them.

## Identity

Filesystem data uses stable logical entry IDs; path, name, and order are
mutable facts. Keep source identity separate from local keys.

Treat direct `https:` leaves as resources, not as Automerge documents or
implicitly executable apps. Keep folder metadata, resource resolution state,
and fetched bytes separate.

## Automerge Moves

Until Automerge exposes native object moves, record semantic moves on document
roots as `__automergeMoves` keyed by `getObjectId`. Treat this as private
fallback bookkeeping: schemas, queries, refs, and apps depend on semantic move
guarantees rather than the journal format. Copy/relocate and identity-preserving
native moves are distinct capability levels.

## Decomplection

Prefer smaller state surfaces, clearer ownership, and less incidental coupling.
Avoid abstractions that only rename existing complexity.

## Testing Ratchet

Existing tests are legacy tripwires. Do not expand them as guard rails for new
work. New testing should favor fuzzing, behavior fuzzing, browser behavior
cases, and small benchmarks. Existing tests may be mechanically updated for
renames/import moves, or deleted once replaced by stronger behavior/fuzz
coverage.
