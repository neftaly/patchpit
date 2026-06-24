# Agent Instructions

## Coordination Claims

Before editing shared or high-churn code, follow the repo-claims protocol in `.claims/README.md`.

### Quick Check

Before editing specific files, check the intended paths:

```bash
pnpm claims:check -- path/to/file.ts
```

Before handing work back, check current changed files:

```bash
pnpm claims:check
```

Use `CLAIMS_OWNER=<owner> pnpm claims:check` to ignore your own active claim while checking local changed files.
