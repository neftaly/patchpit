# Tarstate capability lab e2e

The default e2e command runs Chromium only:

```sh
pnpm --filter @patchpit/tarstate-capability-lab test:e2e
```

Fullscreen activation behavior is browser-policy dependent. The tests assert typed runtime rows (`ok`, `unsupported`, or `denied`) instead of waiting for a fullscreen transition so headless and unsupported environments do not hang.

The config uses `/usr/bin/chromium` when it exists so local verification can run without downloading Playwright browser revisions. Set `CAPABILITY_LAB_CHROMIUM_PATH=/path/to/chromium` to override that path, or run `pnpm exec playwright install chromium` if you prefer Playwright-managed browsers.

Some automated Chromium builds allow synthetic fullscreen requests that a normal browser may deny. The e2e suite records that as an `ok` row when it happens; the deterministic runtime unit test covers the `NotAllowedError`/`denied` path without relying on browser policy.

Firefox and WebKit can be exercised locally when Playwright browsers and Linux system dependencies are available:

```sh
CAPABILITY_LAB_E2E_BROWSERS=all pnpm --filter @patchpit/tarstate-capability-lab test:e2e
```

Playwright WebKit is only a Linux WebKit port, not Safari itself. Use it as a Safari-style smoke test; final Safari activation behavior still needs a manual pass in Safari on macOS/iOS.
