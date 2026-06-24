# Agent Instructions

## Claims

Before editing shared or high-churn code, follow `.claims/README.md`.

- Check intended paths before editing: `pnpm claims:check -- path/to/file.ts`
- Take or refresh an edit claim: `CLAIMS_OWNER=<owner> pnpm claims:take -- "short task" path/to/file.ts`
- Check current changes before handoff: `pnpm claims:check`
- Ignore your own active claim when needed: `CLAIMS_OWNER=<owner> pnpm claims:check`
