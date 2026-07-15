# Patchpit

Patchpit is a browser shell for trusted HTML apps sharing an
Automerge-backed filesystem. It projects an app folder into an immutable file
snapshot, stores that snapshot in Cache Storage, and launches it through a
same-origin service-worker mount so normal relative HTML, CSS, and module URLs
work.

The current same-origin app profile is for trusted plugins. See
[`packages/sandbox/SECURITY.md`](packages/sandbox/SECURITY.md) for its boundary.

## Apps

A filesystem folder is launchable when it contains a direct `index.html` file.
The folder is the immutable app snapshot root and `index.html` is its entry;
individual files remain available to the raw inspector. Patchpit does not
require an app manifest for this profile.

The `sandbox-compat` app is the executable supported-profile target. Builds
ship it as separate static files under `__patchpit/apps/sandbox-compat/` rather
than embedding its bytes in the shell JavaScript. The memory-only browser host
imports that artifact when it creates its demo root, while the standalone and
browser harnesses execute the same built app.

The browser prototype currently supplies neither a persistent storage adapter
nor a network adapter to its Automerge Repo. Root hashes select documents only
for that Repo's page lifetime; durable reopening begins at the injectable Repo
host boundary rather than inside Patchpit's runtime.

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
