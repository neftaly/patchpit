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
- Edit claims should use a 10 minute TTL.
- Refresh edit claims every 3-5 minutes while actively editing.
- Prefer exact file paths over globs.
- Use `client` for the tool or actor type, such as `codex`, `claude`, `cursor`, `human`, or `script`.
- Archive finished claims.

## Commands

```bash
pnpm claims:check
pnpm claims:check -- path/to/file.ts path/to/other-file.ts
```

Create, refresh, and archive claims by editing or moving the JSON files directly. The helper script only checks for active edit-claim conflicts.

The helper script lives in `scripts/claims.mjs` because it is repo tooling. `.claims/` holds the protocol, schema, and ledger data.
