# Agent Instructions

## State Ownership

Before adding or changing state machinery, choose the owning layer first:
canonical storage, Tarstate relational machinery, or Patchpit product/runtime
semantics. Keep state logic in that layer, using projections or canonical
writers at boundaries.

## Tarstate Direction

Tarstate v1 is consumed through temporary local package builds while its Repo
adapter and readiness API remain uncommitted upstream. Do not call hypothetical
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

Sandbox launch needs an authority-scoped projection that reports ready,
incomplete, or invalid state, exact completeness, and each contributing source
basis. Patchpit may materialize that result as an immutable app snapshot; raw
source handles and unresolved resources must not cross the launch boundary.

Regenerate generated artifacts from their canonical source rather than
hand-editing them.

## Patchpit Documents

Durable Patchpit config and state files are I&S-style Automerge documents owned
by `@patchpit`. Its `type` identifies the Patchpit document, `schema` names the
exact primary Tarstate artifact, and self-contained documents inline sealed
artifacts by ID in `schemas`. Schemas describe logical relations rather than the
physical state tree. Normal state writes do not rewrite this metadata; regenerate
inline artifacts from their canonical schema source.

TODO: Before durable loading or replication, move per-client active and preview
state to an explicitly attached presence source. Inline its sealed Tarstate
schema in `@patchpit.schemas` only once that source and its real reference exist.

## Root Invocation

Patchpit's JSON hash selects the root filesystem document with `src` and
reserves `sync` and opaque `delegation` for document-host adapters. They remain
inert until those adapters exist. Missing `src` creates a root and canonicalizes
the hash; changing the hash replaces the active root lifecycle. Keep the Repo
injectable so browser and container hosts use the same protocol. Sandbox app
hashes remain app-owned invocation data and must not inherit Patchpit's sync or
delegation values.

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

The same-origin sandbox profile is temporarily restricted to trusted plugins so
browser-local URL mounts can use native relative loading. Keep runner origin
configurable, but do not invent a cross-origin transfer protocol yet. Before
accepting untrusted plugins, move mounts to an authority-free runner origin.

## Testing Ratchet

Existing tests are legacy tripwires. Do not expand them as guard rails for new
work. New testing should favor fuzzing, behavior fuzzing, browser behavior
cases, and small benchmarks. Existing tests may be mechanically updated for
renames/import moves, or deleted once replaced by stronger behavior/fuzz
coverage.
