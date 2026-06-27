# Agent Instructions

## Claims

Use claims as a lightweight collision detector, not a default gate. A marshal or
task owner may assign disjoint scopes; when your scope is clearly disjoint, work
inside it without taking claims unless one of the cases below applies.

Take or refresh a claim before editing:

- shared or high-churn paths
- merge-conflict resolution areas
- shared configs, root package/lock/config, or repo orchestration files
- public package exports or other cross-package API surfaces
- files already touched by another active agent
- paths outside your assigned scope

Claims are not required for docs-only edits, new files under an owned directory,
marshal-assigned disjoint scopes, or single-agent work.

When a claim is useful, follow `.claims/README.md`.

- Check intended paths before editing: `pnpm claims:check -- path/to/file.ts`
- Take or refresh an edit claim: `CLAIMS_OWNER=<owner> pnpm claims:take -- "short task" path/to/file.ts`
- Inspect active claims: `pnpm claims:status`
- Check current changes before handoff: `pnpm claims:check`
- Ignore your own active claim when needed: `CLAIMS_OWNER=<owner> pnpm claims:check`

## Decomplection

Treat decomplection as part of every change, not a separate cleanup pass.

Keep separating incidental coupling around the touched code until the next change would be churn. Start where there is real pressure: performance, unclear ownership, repeated logic, dead code, premature optimization, or APIs tying unrelated concepts together.

Prefer clearer ownership, simpler flow, and explicit policy boundaries over speculative machinery. Internal API breaks are fine when they simplify the shape; keep aliases only when asked.

In plans, include decomplection after each meaningful step and before handoff.

## Monorepo

Keep the root package as orchestration only. Apps live in `apps/*`, reusable
code lives in `packages/*`, and shared compiler defaults live in
`tsconfig.json`.

When a change spans unrelated app/package boundaries, split the work into
disjoint write sets and take claims only for shared/high-churn overlap.
