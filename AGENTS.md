# Agent Instructions

## Claims

Before editing shared or high-churn code, follow `.claims/README.md`.

- Check intended paths before editing: `pnpm claims:check -- path/to/file.ts`
- Take or refresh an edit claim: `CLAIMS_OWNER=<owner> pnpm claims:take -- "short task" path/to/file.ts`
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

When a change spans unrelated app/package boundaries, split the work into independent claims or sub-agents with disjoint write sets.
