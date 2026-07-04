# Agent Instructions

## Tarstate / FRelP

Keep Automerge docs as canonical state. Use Tarstate for relational projections,
live derived views, indexes, and write intents. Do not flatten compatible tree
docs just to fit Tarstate; project trees into relations and compile mutations
back to the doc shape.

## Automerge Moves

Until Automerge exposes native object moves, record semantic moves on doc roots
as `__automergeMoves` keyed by `getObjectId`. This preserves move intent for
projections without pretending copy/delete preserves object identity.

## Decomplection

Prefer smaller state surfaces, clearer ownership, and less incidental coupling.
Avoid abstractions that only rename existing complexity.
