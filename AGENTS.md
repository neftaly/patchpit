# Agent Instructions

## State Ownership

Before adding or changing state machinery, choose the owning layer first:
canonical storage, Tarstate relational machinery, or Patchpit product/runtime
semantics. Keep state logic in that layer, using projections or canonical
writers at boundaries.

## Tarstate / FRelP

For React/app state management, reach for Tarstate when building derived state:
projections, live state views, indexes, queries/tooling, write intents, and
row/schema validation. This does not decide where canonical state lives; choose
that separately under State Ownership.

When creating or repairing relation rows, use Tarstate schema tooling and
generated artifacts (`agent-card.md`, `rows.d.ts`, JSON Schema), regenerating
them from schema sources instead of hand-editing.

## Automerge Moves

Until Automerge exposes native object moves, record semantic moves on doc roots
as `__automergeMoves` keyed by `getObjectId`. This preserves move intent for
projections without pretending copy/delete preserves object identity.

## Decomplection

Prefer smaller state surfaces, clearer ownership, and less incidental coupling.
Avoid abstractions that only rename existing complexity.
