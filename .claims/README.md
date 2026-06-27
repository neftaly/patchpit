# Repo Claims

This directory is a small, tool-agnostic coordination ledger for parallel agents, editors, scripts, and humans working in this repository.

Claims are advisory leases. They help cooperative tools avoid accidental overlap, but they do not replace user instructions, git review, or tests.

- one JSON file per claim
- active claims live in `.claims/active/`
- completed claims move to `.claims/archived/`
- expired claims are stale and no longer block work

The protocol name is `repo-claims/v1`.

## Claim Format

```json
{
  "protocol": "repo-claims/v1",
  "owner": "codex-renderer-cache-review",
  "client": "codex",
  "task": "review renderer cache systems",
  "mode": "edit",
  "scope": [
    "packages/renderer/src/renderer/mesh/draw/forward-plus-frame-cache.ts"
  ],
  "created_at": "2026-06-24T03:20:00Z",
  "updated_at": "2026-06-24T03:23:00Z",
  "expires_at": "2026-06-24T03:33:00Z"
}
```

## Rules

- `mode: "read"` is informational.
- `mode: "edit"` blocks overlapping edits while active.
- Edit claims should use a 30 minute TTL.
- Refresh edit claims before they expire while actively editing.
- Prefer exact file paths over globs.
- Use `client` for the tool or actor type, such as `codex`, `claude`, `cursor`, `human`, or `script`.
- Archive finished claims.

## When to Claim

Claims are a lightweight collision detector, not a mandatory step for every
edit. Prefer marshal-assigned disjoint scopes when multiple workers are active.

Take or refresh an edit claim before changing:

- shared or high-churn files
- files involved in merge conflicts
- shared configs, root package/lock/config, or repo orchestration files
- public package exports or other cross-package API surfaces
- files already touched by another active agent
- paths outside your assigned scope

Claims are not required for docs-only edits, new files under an owned directory,
marshal-assigned disjoint scopes, or single-agent work.

## Commands

```bash
pnpm claims:check
pnpm claims:check -- path/to/file.ts path/to/other-file.ts
pnpm claims:status
pnpm claims:clean --dry-run
CLAIMS_OWNER=codex-name pnpm claims:take -- "short task" path/to/file.ts
```

`claims:take` creates or refreshes one edit claim for `CLAIMS_OWNER` with a 30
minute TTL. `claims:status` lists fresh and expired active claims.
`claims:clean` archives expired active claims; pass `--dry-run` to preview the
archive actions.

The helper script lives in `scripts/claims.mjs` because it is repo tooling. `.claims/` holds the protocol, schema, and ledger data.
