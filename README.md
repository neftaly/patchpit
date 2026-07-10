# Patchpit

Patchpit is a shell for sandboxed HTML apps, sharing an automerge-backed filesystem.

## Dev

Prerequisites: Node `>=24.12.0`, `pnpm@10.33.2`, and Chromium for the browser
compat harness.

```sh
pnpm install
pnpm dev
pnpm build:prototype
pnpm preview:prototype
pnpm typecheck
pnpm test
pnpm lint
pnpm test:browser
pnpm test:preview
pnpm test:browser -- --case=fetch-relative-json
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium` if Chromium is not at
`/usr/bin/chromium`.

The prototype build requires the Vite preview server so sandbox responses keep
their per-mount CORS and content-security-policy headers. Static hosting is not
the production path; `pnpm build` remains blocked until Automerge FS owns it.

Validation scripts are root-owned. Package-filter commands are not wired as
package-local workflows yet.

Workspace package source is exported as TypeScript. Direct Node imports need the
repo loader:

```sh
node --import ./scripts/register-ts-loader.mjs your-script.mjs
```
