# Patchpit

Patchpit is a browser shell for trusted HTML apps sharing an
Automerge-backed filesystem. It projects an app folder into an immutable file
snapshot, stores that snapshot in Cache Storage, and launches it through a
same-origin service-worker mount so normal relative HTML, CSS, and module URLs
work.

The current same-origin app profile is for trusted plugins. See
[`packages/sandbox/SECURITY.md`](packages/sandbox/SECURITY.md) for its boundary.

## Development

Prerequisites: Node `>=24.12.0`, `pnpm@10.33.2`, and Chromium for the browser
harnesses.

```sh
pnpm install
pnpm dev
pnpm build
pnpm build:sandbox-compat
pnpm preview
pnpm typecheck
pnpm lint
pnpm test
pnpm test:browser
pnpm test:dev
pnpm test:preview
pnpm test:browser -- --case=fetch-relative-json
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium` when Chromium is not at
`/usr/bin/chromium`.

`pnpm build` produces the static site in `dist`, including the sandbox service
worker. `pnpm build:sandbox-compat` builds the standalone compatibility fixture.
Set `PATCHPIT_BASE` for a subpath deployment:

```sh
PATCHPIT_BASE=/patchpit/ pnpm build
```

The Pages workflow runs typecheck, lint, Node tests, both browser harnesses,
and a `/patchpit/` preview before uploading `dist` to GitHub Pages.

Workspace packages export TypeScript source. Direct Node imports use the repo
loader:

```sh
node --import ./scripts/register-ts-loader.mjs your-script.mjs
```
