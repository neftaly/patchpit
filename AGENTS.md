# Agent Instructions

## Tarstate / FReLP

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

## Claims

Use `.claims/README.md` before editing shared, high-churn, root orchestration, or
cross-package API files. Skip claims for single-agent, disjoint, or docs-only
work.

## Monorepo

The root package is orchestration only. Apps live in `apps/*`, reusable code
lives in `packages/*`, and shared compiler defaults live in `tsconfig.json`.
